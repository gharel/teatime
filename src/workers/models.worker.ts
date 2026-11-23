/// <reference lib="webworker" />
/*
 * Worker partagé (iPhone, voir src/lib/modelWorker.ts) : voix Piper, compréhension et Whisper dans
 * un seul onnxruntime, en build WASM simple, donc un seul tas mémoire WASM. iOS refusait d'allouer
 * le tas d'un second runtime (« RangeError: Out of memory ») ; trois tas séparés (≈ 470 + 170 à
 * 300 + 75 Mo) dépassaient de toute façon ce que l'iPhone accorde à l'onglet. Partagé, l'espace
 * libéré par un modèle sert aux calculs des autres ; la voix passe avant les calculs de fond
 * (voir exclusive et whenIdle dans port.ts). Chaque service arrive par son propre MessagePort.
 */
import './wasmHeap';
// Avant Transformers.js : il doit trouver les chemins du build simple déjà posés (voir ortPlain.ts).
import './ortPlain';
import { serveTts } from './tts.core';
import { serveStt } from './stt.core';
import { serveEmbed } from './embed.core';
import { createPiper } from './piper.core';
import { useLowMemorySessions, type Port } from './port';
import { serveSynth } from './synth';

useLowMemorySessions();

const services: Record<string, (port: Port) => void> = {
  piper: (port) => serveSynth(port, { piper: createPiper }),
  tts: serveTts,
  stt: serveStt,
  embed: serveEmbed,
};

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { type?: string; name?: string; port?: MessagePort };
  if (m?.type === 'connect' && m.port && m.name) services[m.name]?.(m.port as unknown as Port);
};
