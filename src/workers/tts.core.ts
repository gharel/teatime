/// <reference lib="webworker" />
/*
 * Synthèse vocale neuronale, exécutée localement :
 *  - Kokoro-82M (Apache 2.0) : très naturelle, WebGPU ou WASM ;
 *  - Piper (MIT, VITS) : voix légère, pour les appareils où Kokoro est trop lente.
 * Service servi dans son propre worker (tts.worker.ts) ou dans le worker partagé (models.worker.ts).
 */
import { env } from '@huggingface/transformers';
import { KokoroTTS, TextSplitterStream } from 'kokoro-js';
import * as ort from 'onnxruntime-web';
import { phonemize } from 'phonemizer';
import { isNetworkError, retryOnNetworkError } from '../lib/download';
import {
  normalizePeak,
  piperPhonemeIds,
  piperPunctuation,
  piperText,
  PIPER_CACHE,
  PIPER_VOICE,
  splitForPhonemes,
  type PiperConfig,
} from '../lib/piper';
import { exclusive, exclusiveTimed, type Port } from './port';

type Device = 'wasm' | 'webgpu';
type Engine = 'kokoro' | 'piper';
type Msg =
  | { type: 'load'; engine?: Engine; device: Device }
  | { type: 'speak'; id: number; text: string; voice: string; speed: number }
  | { type: 'cancel'; ids: number[] }
  | { type: 'dispose' };

type Progress = (p: unknown) => void;

const wasmEnv = env.backends.onnx.wasm as { numThreads?: number; wasmPaths?: unknown } | undefined;

/** Une phrase synthétisée. */
interface Chunk {
  audio: Float32Array;
  sampleRate: number;
  phonemes: string;
  text: string;
}

interface Synth {
  /** Synthétise un texte phrase par phrase. */
  stream(text: string, speed: number, voice: string): AsyncGenerator<Chunk>;
  /** Une phrase, pour la mesure de vitesse (durée du calcul seul, sans l'attente des autres modèles). */
  once(text: string): Promise<{ samples: number; sampleRate: number; ms: number }>;
  /** Libère la mémoire du modèle. */
  dispose(): Promise<void>;
}

/* ------------------------------ Kokoro ------------------------------ */

async function createKokoro(device: Device, progress: Progress): Promise<Synth> {
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    // WebGPU : fp32 (rapide et sans artefact) ; CPU : 8 bits (léger)
    dtype: device === 'webgpu' ? 'fp32' : 'q8',
    device,
    progress_callback: progress,
  });
  return {
    async *stream(text, speed, voice) {
      // kokoro-js 1.2.1 ne ferme pas son découpeur quand on lui passe une chaîne : la dernière phrase
      // resterait bloquée indéfiniment. On fournit donc notre propre flux, fermé explicitement.
      const splitter = new TextSplitterStream();
      const stream = tts.stream(splitter, { voice: voice as never, speed });
      splitter.push(text);
      splitter.close();
      // Une phrase calculée à la fois (file commune aux modèles du worker).
      const it = stream[Symbol.asyncIterator]();
      for (;;) {
        const r = await exclusive(() => it.next());
        if (r.done) break;
        const c = r.value;
        yield { audio: c.audio.audio as Float32Array, sampleRate: c.audio.sampling_rate, phonemes: c.phonemes, text: c.text };
      }
    },
    async once(text) {
      const { value: out, ms } = await exclusiveTimed(() => tts.generate(text, { voice: 'af_heart' }));
      return { samples: out.audio.length, sampleRate: out.sampling_rate, ms };
    },
    async dispose() {
      await (tts as unknown as { model?: { dispose?: () => Promise<unknown> } }).model?.dispose?.();
    },
  };
}

/* ------------------------------ Piper ------------------------------ */

/** Télécharge un fichier (avec progression), gardé dans Cache Storage pour les visites suivantes. */
async function fetchCached(url: string, progress: Progress): Promise<ArrayBuffer> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(PIPER_CACHE);
    const hit = await cache.match(url);
    if (hit) {
      const buf = await hit.arrayBuffer();
      progress({ status: 'done', file: url, loaded: buf.byteLength, total: buf.byteLength });
      return buf;
    }
  } catch {
    cache = undefined; // navigation privée : pas de cache, tant pis
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  let buf: ArrayBuffer;
  const reader = res.body?.getReader();
  if (!reader) {
    buf = await res.arrayBuffer();
  } else {
    const parts: Uint8Array[] = [];
    let loaded = 0;
    let lastPost = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      const now = performance.now();
      if (total && now - lastPost > 150) {
        lastPost = now;
        progress({ status: 'progress', file: url, loaded, total });
      }
    }
    const out = new Uint8Array(loaded);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    buf = out.buffer;
  }
  progress({ status: 'done', file: url, loaded: buf.byteLength, total: total || buf.byteLength });
  try {
    await cache?.put(url, new Response(buf.slice(0), { headers: { 'Content-Length': String(buf.byteLength) } }));
  } catch {
    /* quota : la voix fonctionne, elle sera simplement retéléchargée */
  }
  return buf;
}

async function piperPhonemes(text: string, lang: string): Promise<string> {
  const parts = splitForPhonemes(piperText(text));
  const out = await Promise.all(
    parts.map(async (p) => (p.punct ? piperPunctuation(p.text) : (await phonemize(p.text, lang)).join(' '))),
  );
  return out.join('').trim();
}

async function createPiper(progress: Progress): Promise<Synth> {
  // Même emplacement des fichiers WASM que Transformers.js (déjà en cache du navigateur).
  if (wasmEnv?.wasmPaths && !ort.env.wasm.wasmPaths) ort.env.wasm.wasmPaths = wasmEnv.wasmPaths as string;
  if (wasmEnv?.numThreads) ort.env.wasm.numThreads = wasmEnv.numThreads;
  // Petit fichier d'abord : la progression affichée porte sur le modèle.
  const cfg = JSON.parse(new TextDecoder().decode(await fetchCached(PIPER_VOICE.config, progress))) as PiperConfig;
  const model = await fetchCached(PIPER_VOICE.model, progress);
  const session = await exclusive(() =>
    ort.InferenceSession.create(new Uint8Array(model), {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }),
  );
  const lang = cfg.espeak?.voice || 'en-us';
  const inf = { noise_scale: 0.667, length_scale: 1, noise_w: 0.8, ...cfg.inference };
  const sampleRate = cfg.audio.sample_rate;
  const multi = session.inputNames.includes('sid');

  const run = async (phonemes: string, speed: number): Promise<{ audio: Float32Array; ms: number }> => {
    const { ids } = piperPhonemeIds(phonemes, cfg.phoneme_id_map);
    const feeds: Record<string, ort.Tensor> = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids, (x) => BigInt(x)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale, inf.length_scale / Math.max(0.5, speed), inf.noise_w]), [3]),
    };
    if (multi) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
    const { value: out, ms } = await exclusiveTimed(() => session.run(feeds));
    const data = out[session.outputNames[0]].data as Float32Array;
    return { audio: normalizePeak(new Float32Array(data)), ms };
  };

  return {
    async *stream(text, speed) {
      const splitter = new TextSplitterStream();
      splitter.push(text);
      splitter.close();
      for await (const sentence of splitter) {
        const phonemes = await piperPhonemes(sentence, lang);
        if (!phonemes) continue;
        yield { audio: (await run(phonemes, speed)).audio, sampleRate, phonemes, text: sentence };
      }
    },
    async once(text) {
      const { audio, ms } = await run(await piperPhonemes(text, lang), 1);
      return { samples: audio.length, sampleRate, ms };
    },
    async dispose() {
      await session.release();
    },
  };
}

/* ------------------------------ Service ------------------------------ */

/** Sert la synthèse vocale sur ce port (un état par connexion : une reconnexion repart de zéro). */
export function serveTts(port: Port) {
  let loading: Promise<void> | null = null;
  let synth: Synth | null = null;
  const cancelled = new Set<number>();
  const queue: Extract<Msg, { type: 'speak' }>[] = [];
  let pumping: Promise<void> | null = null;
  let disposed = false;
  const post = (m: unknown, transfer: Transferable[] = []) => {
    if (!disposed) port.postMessage(m, transfer);
  };
  const progress: Progress = (p) => post({ type: 'progress', p });

  async function load(engine: Engine, device: Device) {
    let used = device;
    if (engine === 'piper') {
      used = 'wasm';
      synth = await retryOnNetworkError(() => createPiper(progress));
    } else {
      try {
        // Coupure réseau (fréquente sur mobile) : on relance, les fichiers déjà reçus sont en cache.
        synth = await retryOnNetworkError(() => createKokoro(device, progress));
      } catch (err) {
        if (device !== 'webgpu' || isNetworkError(err)) throw err;
        // GPU incompatible : repli automatique sur le processeur
        used = 'wasm';
        synth = await retryOnNetworkError(() => createKokoro('wasm', progress));
      }
    }
    // Préchauffage : la 1re inférence initialise le runtime ; on la fait avant d'annoncer « prêt ».
    // Puis mesure de vitesse (temps de calcul / durée de la voix) : sur un téléphone, la voix peut
    // être bien plus lente à produire qu'à écouter, et Emma répondrait avec de longues secondes de retard.
    let rtf: number | undefined;
    try {
      await synth.once('Hello there.');
      const out = await synth.once('Nice to meet you. How are you today?');
      const audioMs = (out.samples / out.sampleRate) * 1000;
      if (audioMs > 300) rtf = out.ms / audioMs;
    } catch {
      /* sans gravité */
    }
    post({ type: 'ready', engine, device: used, threads: wasmEnv?.numThreads ?? 1, rtf });
  }

  async function drain() {
    while (queue.length && !disposed) {
      const job = queue.shift()!;
      if (cancelled.has(job.id)) {
        post({ type: 'done', id: job.id });
        continue;
      }
      try {
        let t = performance.now();
        for await (const chunk of synth!.stream(job.text, job.speed, job.voice)) {
          if (cancelled.has(job.id) || disposed) break;
          const genMs = performance.now() - t;
          post(
            {
              type: 'chunk',
              id: job.id,
              audio: chunk.audio,
              sampleRate: chunk.sampleRate,
              phonemes: chunk.phonemes,
              chars: chunk.text.length,
              genMs,
            },
            [chunk.audio.buffer],
          );
          t = performance.now();
        }
      } catch (err) {
        post({ type: 'speak-error', id: job.id, error: String(err) });
      }
      post({ type: 'done', id: job.id });
    }
  }

  function pump() {
    if (pumping || !synth || disposed) return;
    pumping = drain().finally(() => (pumping = null));
  }

  /** Connexion fermée : on termine la phrase en cours puis on libère le modèle. */
  async function dispose() {
    disposed = true;
    queue.length = 0;
    await loading?.catch(() => undefined);
    await pumping;
    await synth?.dispose().catch(() => undefined);
    synth = null;
    port.close?.();
  }

  port.onmessage = async (e: MessageEvent<Msg>) => {
    const msg = e.data;
    if (msg.type === 'load') {
      if (!loading) {
        loading = load(msg.engine ?? 'kokoro', msg.device).catch((err) => {
          loading = null;
          post({ type: 'error', error: String(err?.message ?? err) });
        });
      }
      await loading;
      pump();
    } else if (msg.type === 'speak') {
      queue.push(msg);
      pump();
    } else if (msg.type === 'cancel') {
      msg.ids.forEach((id) => cancelled.add(id));
    } else if (msg.type === 'dispose') {
      void dispose();
    }
  };
}
