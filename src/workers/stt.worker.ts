/// <reference lib="webworker" />
/* Whisper dans son propre worker (voir stt.core.ts). */
import './wasmHeap';
import { serveStt } from './stt.core';
import { setWasmThreads, type Port } from './port';

setWasmThreads(Math.min(8, (navigator.hardwareConcurrency || 4) - 2));
serveStt(self as unknown as Port);
