/// <reference lib="webworker" />
/*
 * Voix légère Piper seule dans son worker, sur tous les appareils : un onnxruntime en build WASM
 * simple, 1 thread, sans Transformers.js. Sur iPhone, son tas mémoire ne se mélange plus à celui
 * de la compréhension (worker partagé).
 */
import './wasmHeap';
import { createPiper } from './piper.core';
import type { Port } from './port';
import { serveSynth } from './synth';

serveSynth(self as unknown as Port, { piper: createPiper });
