/// <reference lib="webworker" />
/* Reconnaissance vocale Whisper exécutée localement (Transformers.js) : aucune donnée envoyée. */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { languagePicker } from './whisperLang';

type Msg =
  | { type: 'load'; model: string; device: 'wasm' | 'webgpu' }
  | { type: 'transcribe'; id: number; audio: Float32Array };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loading: Promise<void> | null = null;

const wasmEnv = env.backends.onnx.wasm as { numThreads?: number } | undefined;
if (wasmEnv && self.crossOriginIsolated) wasmEnv.numThreads = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));

async function create(model: string, device: 'wasm' | 'webgpu') {
  const make = pipeline as unknown as (task: string, model: string, opts: object) => Promise<unknown>;
  return (await make('automatic-speech-recognition', model, {
    device,
    // L'encodeur quantifié en 8 bits dégrade nettement la reconnaissance des petits modèles (tiny, base),
    // surtout avec un accent : on le garde en fp32 (≈ +50 Mo). Small reste en 8 bits (mémoire).
    dtype:
      device === 'webgpu'
        ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
        : { encoder_model: /small|medium|large/i.test(model) ? 'q8' : 'fp32', decoder_model_merged: 'q8' },
    progress_callback: (p: unknown) => ctx.postMessage({ type: 'progress', p }),
  })) as AutomaticSpeechRecognitionPipeline;
}

async function load(model: string, device: 'wasm' | 'webgpu') {
  try {
    asr = await create(model, device);
  } catch (err) {
    if (device !== 'webgpu') throw err;
    asr = await create(model, 'wasm'); // GPU incompatible : repli processeur
  }
  // Pré-chauffe (compile les shaders / initialise le runtime), chronométrée : sur un appareil lent,
  // l'appli renonce à la transcription en direct.
  const t = performance.now();
  await asr(new Float32Array(16000));
  ctx.postMessage({ type: 'ready', warmMs: performance.now() - t });
}

/* Les transcriptions passent une par une (une session ONNX ne supporte pas les appels concurrents). */
const queue: { id: number; audio: Float32Array }[] = [];
let busy = false;
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift()!;
    try {
      if (!asr) await loading;
      if (!asr) throw new Error('Modèle non chargé');
      const t = performance.now();
      const lang = languagePicker((asr as unknown as { model: { generation_config?: Record<string, any> } }).model.generation_config);
      const out = await asr(job.audio, lang ? ({ decoder_input_ids: lang.prefix, logits_processor: [lang.process] } as object) : undefined);
      const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
      ctx.postMessage({ type: 'result', id: job.id, text: text.trim(), lang: lang?.detected ?? 'en', ms: performance.now() - t });
    } catch (err) {
      ctx.postMessage({ type: 'result', id: job.id, text: '', error: String(err) });
    }
  }
  busy = false;
}

ctx.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    if (!loading) {
      loading = load(msg.model, msg.device).catch((err) => {
        loading = null;
        ctx.postMessage({ type: 'error', error: String(err?.message ?? err) });
      });
    }
    await loading;
  } else if (msg.type === 'transcribe') {
    queue.push({ id: msg.id, audio: msg.audio });
    void pump();
  }
};
