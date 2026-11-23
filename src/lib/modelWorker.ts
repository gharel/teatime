/* ------------------------------------------------------------------
 * Workers des modèles (voix, Whisper, compréhension).
 *
 * Ordinateur, Android : un worker par modèle (calculs en parallèle).
 * iPhone / iPad : un seul worker pour tous (voix Piper, compréhension,
 * Whisper), avec un seul onnxruntime en build WASM simple (voir
 * ortPlain.ts). Chaque runtime a son tas mémoire WASM, qui ne fait que
 * grandir : iOS refusait d'allouer celui d'un second runtime (« RangeError:
 * Out of memory », compréhension indisponible), et trois tas séparés
 * dépassaient la mémoire accordée à l'onglet (la page était tuée).
 * Mesures sur PC : Whisper base 470 Mo + Piper 170 à 300 Mo + MiniLM
 * 75 Mo séparés, contre ≈ 520 Mo partagés.
 * ------------------------------------------------------------------ */
import { isIOS } from './device';

export type ModelService = 'tts' | 'piper' | 'stt' | 'embed';

/** Ce que les services utilisent d'un worker (dédié, ou port du worker partagé). */
export interface ModelWorker {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  /** Libère le modèle (et le worker s'il n'est plus utilisé). */
  terminate(): void;
}

/** Un seul worker pour tous les modèles ? */
export function sharedModelWorker(): boolean {
  return isIOS();
}

function dedicated(name: ModelService): Worker {
  switch (name) {
    case 'tts':
      return new Worker(new URL('../workers/tts.worker.ts', import.meta.url), { type: 'module' });
    case 'piper':
      return new Worker(new URL('../workers/piper.worker.ts', import.meta.url), { type: 'module' });
    case 'stt':
      return new Worker(new URL('../workers/stt.worker.ts', import.meta.url), { type: 'module' });
    default:
      return new Worker(new URL('../workers/embed.worker.ts', import.meta.url), { type: 'module' });
  }
}

let host: Worker | null = null;
const live = new Set<PortWorker>();

class PortWorker implements ModelWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  constructor(private port: MessagePort) {
    port.onmessage = (e) => this.onmessage?.(e);
  }

  postMessage(message: unknown, transfer: Transferable[] = []) {
    this.port.postMessage(message, transfer);
  }

  terminate() {
    if (!live.delete(this)) return;
    this.onmessage = null;
    this.onerror = null;
    if (live.size === 0) {
      // Plus aucun service : on rend toute la mémoire.
      host?.terminate();
      host = null;
    } else {
      this.port.postMessage({ type: 'dispose' });
    }
  }
}

function shared(name: ModelService): ModelWorker {
  if (!host) {
    const w = new Worker(new URL('../workers/models.worker.ts', import.meta.url), { type: 'module' });
    // Erreur du worker partagé : chaque service la reçoit (et se relance de son côté).
    w.onerror = (e) => [...live].forEach((s) => s.onerror?.(e));
    host = w;
  }
  const channel = new MessageChannel();
  host.postMessage({ type: 'connect', name, port: channel.port2 }, [channel.port2]);
  const worker = new PortWorker(channel.port1);
  live.add(worker);
  return worker;
}

/** Ouvre le worker d'un service de modèle (iPhone : un port du worker partagé). */
export function openModelWorker(name: ModelService): ModelWorker {
  return sharedModelWorker() ? shared(name) : dedicated(name);
}
