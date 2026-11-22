/// <reference lib="webworker" />
/* Synthèse vocale dans son propre worker (voir tts.core.ts). */
import './wasmHeap';
import { serveTts } from './tts.core';
import { setWasmThreads, type Port } from './port';

// Par défaut onnxruntime n'utilise que 4 threads : on en prend davantage (en laissant de la marge au reste).
setWasmThreads(Math.min(8, (navigator.hardwareConcurrency || 4) - 2));
serveTts(self as unknown as Port);
