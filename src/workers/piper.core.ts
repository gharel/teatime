/// <reference lib="webworker" />
/*
 * Piper (MIT, VITS), voix légère : calcul local, une phrase à la fois.
 * Seul dans son worker (piper.worker.ts) : son propre onnxruntime en build WASM simple, sans
 * Transformers.js ni kokoro-js, pour une mémoire minimale sur iPhone.
 */
// Build WASM simple d'onnxruntime-web (1.22) : l'import par défaut charge le build JSEP
// (WebGPU, asyncify, ≈ 21,6 Mo de WASM contre 11,1 Mo), inutile ici et plus lourd en mémoire sur iPhone.
import * as ort from 'onnxruntime-web/wasm';
import ortMjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import ortWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import { phonemize } from 'phonemizer';
import {
  normalizePeak,
  piperPhonemeIds,
  piperPunctuation,
  piperText,
  PIPER_CACHE,
  PIPER_VOICE,
  splitForPhonemes,
  splitSentences,
  type PiperConfig,
} from '../lib/piper';
import { exclusive, exclusiveTimed } from './port';
import type { Progress, Synth } from './synth';

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

/**
 * Session ONNX du modèle. Le fichier (≈ 63 Mo) n'est gardé que le temps de la création : onnxruntime
 * le recopie dans son tas WASM, la copie JavaScript est libérée aussitôt (fonction à part, pour
 * qu'aucune fermeture ne la retienne). Ni arène mémoire ni plan mémoire réutilisé : le tas grandit
 * moins d'une phrase à l'autre (la mémoire WASM ne se rend jamais).
 */
async function createSession(progress: Progress): Promise<ort.InferenceSession> {
  let model: ArrayBuffer | null = await fetchCached(PIPER_VOICE.model, progress);
  let bytes: Uint8Array | null = new Uint8Array(model);
  model = null;
  try {
    return await exclusive(() =>
      ort.InferenceSession.create(bytes!, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
        enableCpuMemArena: false,
        enableMemPattern: false,
      }),
    );
  } finally {
    bytes = null;
  }
}

export async function createPiper(progress: Progress): Promise<Synth> {
  // Fichiers du build simple (module d'amorçage + WASM), servis avec l'appli : le bundle les cherche à
  // côté de lui, où Vite ne les met pas.
  ort.env.wasm.wasmPaths = { mjs: ortMjsUrl, wasm: ortWasmUrl };
  ort.env.wasm.numThreads = 1;
  // Petit fichier d'abord : la progression affichée porte sur le modèle.
  const cfg = JSON.parse(new TextDecoder().decode(await fetchCached(PIPER_VOICE.config, progress))) as PiperConfig;
  const session = await createSession(progress);
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
    threads: 1,
    async *stream(text, speed) {
      for (const sentence of splitSentences(text)) {
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
