/// <reference lib="webworker" />
/* Plongements de phrases dans leur propre worker (voir embed.core.ts). */
import './wasmHeap';
import { serveEmbed } from './embed.core';
import type { Port } from './port';
import { setWasmThreads } from './wasmThreads';

// Petit modèle : 2 threads suffisent et laissent le processeur à Whisper et à la voix.
setWasmThreads(Math.min(2, navigator.hardwareConcurrency || 2));
serveEmbed(self as unknown as Port);
