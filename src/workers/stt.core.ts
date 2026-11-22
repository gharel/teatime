/// <reference lib="webworker" />
/*
 * Reconnaissance vocale Whisper exécutée localement (Transformers.js) : aucune donnée envoyée.
 * Service servi dans son propre worker (stt.worker.ts) ou dans le worker partagé (models.worker.ts).
 */
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { languagePicker } from './whisperLang';
import { exclusiveTimed, type Port } from './port';

type Msg =
  | { type: 'load'; model: string; device: 'wasm' | 'webgpu' }
  | { type: 'transcribe'; id: number; audio: Float32Array }
  | { type: 'dispose' };

async function create(model: string, device: 'wasm' | 'webgpu', progress: (p: unknown) => void) {
  const make = pipeline as unknown as (task: string, model: string, opts: object) => Promise<unknown>;
  return (await make('automatic-speech-recognition', model, {
    device,
    // L'encodeur quantifié en 8 bits dégrade nettement la reconnaissance des petits modèles (tiny, base),
    // surtout avec un accent : on le garde en fp32 (≈ +50 Mo). Small reste en 8 bits (mémoire).
    dtype:
      device === 'webgpu'
        ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
        : { encoder_model: /small|medium|large/i.test(model) ? 'q8' : 'fp32', decoder_model_merged: 'q8' },
    progress_callback: progress,
  })) as AutomaticSpeechRecognitionPipeline;
}

/** Sert la transcription sur ce port (un état par connexion). */
export function serveStt(port: Port) {
  let asr: AutomaticSpeechRecognitionPipeline | null = null;
  let loading: Promise<void> | null = null;
  let disposed = false;
  const post = (m: unknown) => {
    if (!disposed) port.postMessage(m, []);
  };
  const progress = (p: unknown) => post({ type: 'progress', p });

  async function load(model: string, device: 'wasm' | 'webgpu') {
    try {
      asr = await create(model, device, progress);
    } catch (err) {
      if (device !== 'webgpu') throw err;
      asr = await create(model, 'wasm', progress); // GPU incompatible : repli processeur
    }
    // Pré-chauffe (compile les shaders / initialise le runtime), chronométrée : sur un appareil lent,
    // l'appli renonce à la transcription en direct.
    const { ms } = await exclusiveTimed(() => asr!(new Float32Array(16000)));
    post({ type: 'ready', warmMs: ms });
  }

  /* Les transcriptions passent une par une (une session ONNX ne supporte pas les appels concurrents). */
  const queue: { id: number; audio: Float32Array }[] = [];
  let pumping: Promise<void> | null = null;
  async function drain() {
    while (queue.length && !disposed) {
      const job = queue.shift()!;
      try {
        if (!asr) await loading;
        if (!asr) throw new Error('Modèle non chargé');
        const model = asr;
        const lang = languagePicker((model as unknown as { model: { generation_config?: Record<string, any> } }).model.generation_config);
        const { value: out, ms } = await exclusiveTimed(() =>
          model(job.audio, lang ? ({ decoder_input_ids: lang.prefix, logits_processor: [lang.process] } as object) : undefined),
        );
        const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
        post({ type: 'result', id: job.id, text: text.trim(), lang: lang?.detected ?? 'en', ms });
      } catch (err) {
        post({ type: 'result', id: job.id, text: '', error: String(err) });
      }
    }
  }
  function pump() {
    if (pumping || disposed) return;
    pumping = drain().finally(() => (pumping = null));
  }

  async function dispose() {
    disposed = true;
    queue.length = 0;
    await loading?.catch(() => undefined);
    await pumping;
    await (asr as unknown as { dispose?: () => Promise<unknown> } | null)?.dispose?.()?.catch(() => undefined);
    asr = null;
    port.close?.();
  }

  port.onmessage = async (e: MessageEvent<Msg>) => {
    const msg = e.data;
    if (msg.type === 'load') {
      if (!loading) {
        loading = load(msg.model, msg.device).catch((err) => {
          loading = null;
          post({ type: 'error', error: String(err?.message ?? err) });
        });
      }
      await loading;
    } else if (msg.type === 'transcribe') {
      queue.push({ id: msg.id, audio: msg.audio });
      pump();
    } else if (msg.type === 'dispose') {
      void dispose();
    }
  };
}
