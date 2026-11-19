/// <reference lib="webworker" />
/*
 * Plongements de phrases (MiniLM entraîné question → réponse, ≈ 23 Mo, local) : permet de vérifier
 * qu'une réponse de l'apprenant se rapporte bien à la question d'Emma, et de quel thème elle parle.
 */
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

type Msg = { type: 'load' } | { type: 'embed'; id: number; texts: string[]; priority: boolean };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const MODEL = 'Xenova/multi-qa-MiniLM-L6-cos-v1';

// Petit modèle : 2 threads suffisent et laissent le processeur à Whisper et à la voix.
const wasmEnv = env.backends.onnx.wasm as { numThreads?: number } | undefined;
if (wasmEnv && self.crossOriginIsolated) wasmEnv.numThreads = Math.min(2, navigator.hardwareConcurrency || 2);

let fe: FeatureExtractionPipeline | null = null;
let loading: Promise<void> | null = null;

async function load() {
  const make = pipeline as unknown as (task: string, model: string, opts: object) => Promise<FeatureExtractionPipeline>;
  fe = await make('feature-extraction', MODEL, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: (p: unknown) => ctx.postMessage({ type: 'progress', p }),
  });
  ctx.postMessage({ type: 'ready' });
}

/* Les réponses de l'apprenant passent avant l'indexation des questions (file prioritaire). */
const queue: Extract<Msg, { type: 'embed' }>[] = [];
let busy = false;
async function pump() {
  if (busy || !fe) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift()!;
    try {
      const out = await fe(job.texts, { pooling: 'mean', normalize: true });
      const dim = out.dims[out.dims.length - 1];
      const data = out.data as Float32Array;
      const vecs = job.texts.map((_, i) => data.slice(i * dim, (i + 1) * dim));
      ctx.postMessage({ type: 'embedded', id: job.id, vecs }, vecs.map((v) => v.buffer));
    } catch (err) {
      ctx.postMessage({ type: 'embedded', id: job.id, vecs: null, error: String(err) });
    }
  }
  busy = false;
}

ctx.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    if (!loading) {
      loading = load().catch((err) => {
        loading = null;
        ctx.postMessage({ type: 'error', error: String(err?.message ?? err) });
      });
    }
    await loading;
    void pump();
  } else {
    if (msg.priority) queue.unshift(msg);
    else queue.push(msg);
    void pump();
  }
};
