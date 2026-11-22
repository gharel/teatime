/// <reference lib="webworker" />
/*
 * Plongements de phrases (MiniLM entraîné question → réponse, ≈ 23 Mo, local) : permet de vérifier
 * qu'une réponse de l'apprenant se rapporte bien à la question d'Emma, et de quel thème elle parle.
 * Service servi dans son propre worker (embed.worker.ts) ou dans le worker partagé (models.worker.ts).
 */
import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { exclusive, type Port } from './port';

type Msg = { type: 'load' } | { type: 'embed'; id: number; texts: string[]; priority: boolean } | { type: 'dispose' };

const MODEL = 'Xenova/multi-qa-MiniLM-L6-cos-v1';

/** Sert les plongements sur ce port (un état par connexion). */
export function serveEmbed(port: Port) {
  let fe: FeatureExtractionPipeline | null = null;
  let loading: Promise<void> | null = null;
  let disposed = false;
  const post = (m: unknown, transfer: Transferable[] = []) => {
    if (!disposed) port.postMessage(m, transfer);
  };

  async function load() {
    const make = pipeline as unknown as (task: string, model: string, opts: object) => Promise<FeatureExtractionPipeline>;
    fe = await make('feature-extraction', MODEL, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (p: unknown) => post({ type: 'progress', p }),
    });
    post({ type: 'ready' });
  }

  /* Les réponses de l'apprenant passent avant l'indexation des questions (file prioritaire). */
  const queue: Extract<Msg, { type: 'embed' }>[] = [];
  let pumping: Promise<void> | null = null;
  async function drain() {
    while (queue.length && fe && !disposed) {
      const job = queue.shift()!;
      const model = fe;
      try {
        // Lot par lot : la voix et Whisper (worker partagé) passent entre deux lots.
        const out = await exclusive(() => model(job.texts, { pooling: 'mean', normalize: true }));
        const dim = out.dims[out.dims.length - 1];
        const data = out.data as Float32Array;
        const vecs = job.texts.map((_, i) => data.slice(i * dim, (i + 1) * dim));
        post({ type: 'embedded', id: job.id, vecs }, vecs.map((v) => v.buffer));
      } catch (err) {
        post({ type: 'embedded', id: job.id, vecs: null, error: String(err) });
      }
    }
  }
  function pump() {
    if (pumping || !fe || disposed) return;
    pumping = drain().finally(() => (pumping = null));
  }

  async function dispose() {
    disposed = true;
    queue.length = 0;
    await loading?.catch(() => undefined);
    await pumping;
    await (fe as unknown as { dispose?: () => Promise<unknown> } | null)?.dispose?.()?.catch(() => undefined);
    fe = null;
    port.close?.();
  }

  port.onmessage = async (e: MessageEvent<Msg>) => {
    const msg = e.data;
    if (msg.type === 'load') {
      if (!loading) {
        loading = load().catch((err) => {
          loading = null;
          post({ type: 'error', error: String(err?.message ?? err) });
        });
      }
      await loading;
      pump();
    } else if (msg.type === 'embed') {
      if (msg.priority) queue.unshift(msg);
      else queue.push(msg);
      pump();
    } else if (msg.type === 'dispose') {
      void dispose();
    }
  };
}
