/// <reference lib="webworker" />
/* Synthèse vocale neuronale Kokoro-82M (Apache 2.0), exécutée localement (WebGPU ou WASM multi-thread). */
import { env } from '@huggingface/transformers';
import { KokoroTTS, TextSplitterStream } from 'kokoro-js';

type Device = 'wasm' | 'webgpu';
type Msg =
  | { type: 'load'; device: Device }
  | { type: 'speak'; id: number; text: string; voice: string; speed: number }
  | { type: 'cancel'; ids: number[] };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let tts: KokoroTTS | null = null;
let loading: Promise<void> | null = null;
const cancelled = new Set<number>();
const queue: Extract<Msg, { type: 'speak' }>[] = [];
let busy = false;

// Par défaut onnxruntime n'utilise que 4 threads : on en prend davantage (en laissant de la marge au reste).
const cores = navigator.hardwareConcurrency || 4;
const wasmEnv = env.backends.onnx.wasm as { numThreads?: number } | undefined;
if (wasmEnv && self.crossOriginIsolated) wasmEnv.numThreads = Math.max(1, Math.min(8, cores - 2));

async function create(device: Device) {
  return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    // WebGPU : fp32 (rapide et sans artefact) ; CPU : 8 bits (léger)
    dtype: device === 'webgpu' ? 'fp32' : 'q8',
    device,
    progress_callback: (p) => ctx.postMessage({ type: 'progress', p }),
  });
}

async function load(device: Device) {
  let used = device;
  try {
    tts = await create(device);
  } catch (err) {
    if (device !== 'webgpu') throw err;
    // GPU incompatible : repli automatique sur le processeur
    used = 'wasm';
    tts = await create('wasm');
  }
  // Préchauffage : la 1re inférence initialise le runtime ; on la fait avant d'annoncer « prêt ».
  try {
    await tts.generate('Hello there.', { voice: 'af_heart' });
  } catch {
    /* sans gravité */
  }
  ctx.postMessage({ type: 'ready', device: used, threads: wasmEnv?.numThreads });
}

async function pump() {
  if (busy || !tts) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift()!;
    if (cancelled.has(job.id)) {
      ctx.postMessage({ type: 'done', id: job.id });
      continue;
    }
    try {
      // kokoro-js 1.2.1 ne ferme pas son découpeur quand on lui passe une chaîne : la dernière phrase
      // resterait bloquée indéfiniment. On fournit donc notre propre flux, fermé explicitement.
      const splitter = new TextSplitterStream();
      const stream = tts.stream(splitter, { voice: job.voice as never, speed: job.speed });
      splitter.push(job.text);
      splitter.close();
      let t = performance.now();
      for await (const chunk of stream) {
        if (cancelled.has(job.id)) break;
        const audio = chunk.audio.audio as Float32Array;
        const genMs = performance.now() - t;
        ctx.postMessage(
          {
            type: 'chunk',
            id: job.id,
            audio,
            sampleRate: chunk.audio.sampling_rate,
            phonemes: chunk.phonemes,
            chars: chunk.text.length,
            genMs,
          },
          [audio.buffer],
        );
        t = performance.now();
      }
    } catch (err) {
      ctx.postMessage({ type: 'speak-error', id: job.id, error: String(err) });
    }
    ctx.postMessage({ type: 'done', id: job.id });
  }
  busy = false;
}

ctx.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    if (!loading) {
      loading = load(msg.device).catch((err) => {
        loading = null;
        ctx.postMessage({ type: 'error', error: String(err?.message ?? err) });
      });
    }
    await loading;
    pump();
  } else if (msg.type === 'speak') {
    queue.push(msg);
    pump();
  } else if (msg.type === 'cancel') {
    msg.ids.forEach((id) => cancelled.add(id));
  }
};
