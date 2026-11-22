/// <reference lib="webworker" />
/*
 * Worker partagé (iPhone, voir src/lib/modelWorker.ts) : voix, Whisper et compréhension tournent
 * dans un seul onnxruntime, donc un seul tas mémoire WASM. Chaque tas ne fait que grandir ; trois
 * tas séparés (≈ 470 + 170 à 300 + 75 Mo) dépassaient ce que l'iPhone accorde à l'onglet, qui
 * plantait et se rechargeait. Partagé, l'espace libéré par un modèle sert aux calculs des autres.
 * Chaque service arrive par son propre MessagePort (message « connect »).
 */
import { serveTts } from './tts.core';
import { serveStt } from './stt.core';
import { serveEmbed } from './embed.core';
import { setWasmThreads, type Port } from './port';

setWasmThreads(Math.min(8, (navigator.hardwareConcurrency || 4) - 2));

const services: Record<string, (port: Port) => void> = { tts: serveTts, stt: serveStt, embed: serveEmbed };

self.onmessage = (e: MessageEvent) => {
  const m = e.data as { type?: string; name?: string; port?: MessagePort };
  if (m?.type === 'connect' && m.port && m.name) services[m.name]?.(m.port as unknown as Port);
};
