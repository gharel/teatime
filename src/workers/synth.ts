/// <reference lib="webworker" />
/*
 * Service de synthèse vocale commun aux workers de voix : file de phrases, annulation,
 * préchauffage et mesure de vitesse. Le moteur (Kokoro, Piper) est fourni par le worker.
 */
import { isNetworkError, retryOnNetworkError } from '../lib/download';
import type { Port } from './port';
import { heapBytes, heapMB, heapParts } from './wasmHeap';

export type Device = 'wasm' | 'webgpu';
export type Engine = 'kokoro' | 'piper';
export type Progress = (p: unknown) => void;

type Msg =
  | { type: 'load'; engine?: Engine; device: Device }
  | { type: 'speak'; id: number; text: string; voice: string; speed: number }
  | { type: 'cancel'; ids: number[] }
  | { type: 'dispose' };

/** Une phrase synthétisée. */
export interface Chunk {
  audio: Float32Array;
  sampleRate: number;
  phonemes: string;
  text: string;
}

export interface Synth {
  /** Threads de calcul utilisés. */
  threads: number;
  /** Synthétise un texte phrase par phrase. */
  stream(text: string, speed: number, voice: string): AsyncGenerator<Chunk>;
  /** Une phrase, pour la mesure de vitesse (durée du calcul seul, sans l'attente des autres modèles). */
  once(text: string): Promise<{ samples: number; sampleRate: number; ms: number }>;
  /** Libère la mémoire du modèle. */
  dispose(): Promise<void>;
}

export interface SynthFactories {
  piper: (progress: Progress) => Promise<Synth>;
  kokoro?: (device: Device, progress: Progress) => Promise<Synth>;
}

/** Sert la synthèse vocale sur ce port (un état par connexion : une reconnexion repart de zéro). */
export function serveSynth(port: Port, make: SynthFactories) {
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
    if (engine === 'piper' || !make.kokoro) {
      engine = 'piper';
      used = 'wasm';
      synth = await retryOnNetworkError(() => make.piper(progress));
    } else {
      const kokoro = make.kokoro;
      try {
        // Coupure réseau (fréquente sur mobile) : on relance, les fichiers déjà reçus sont en cache.
        synth = await retryOnNetworkError(() => kokoro(device, progress));
      } catch (err) {
        if (device !== 'webgpu' || isNetworkError(err)) throw err;
        // GPU incompatible : repli automatique sur le processeur
        used = 'wasm';
        synth = await retryOnNetworkError(() => kokoro('wasm', progress));
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
    post({ type: 'ready', engine, device: used, threads: synth.threads, rtf, heap: heapMB(), heapParts: heapParts() });
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
        let before = heapBytes();
        for await (const chunk of synth!.stream(job.text, job.speed, job.voice)) {
          if (cancelled.has(job.id) || disposed) break;
          const genMs = performance.now() - t;
          const after = heapBytes();
          post(
            {
              type: 'chunk',
              id: job.id,
              audio: chunk.audio,
              sampleRate: chunk.sampleRate,
              phonemes: chunk.phonemes,
              chars: chunk.text.length,
              genMs,
              heap: heapMB(),
              heapParts: heapParts(),
              heapGrowMB: Math.round(((after - before) / 1048576) * 10) / 10,
            },
            [chunk.audio.buffer],
          );
          t = performance.now();
          before = after;
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
