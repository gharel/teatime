/// <reference lib="webworker" />
/*
 * Voix légère Piper seule dans son worker (ordinateur, Android) : un onnxruntime en build WASM simple,
 * 1 thread, sans Transformers.js. Sur iPhone, elle tourne dans le worker partagé (models.worker.ts).
 */
import './wasmHeap';
import { createPiper } from './piper.core';
import type { Port } from './port';
import { serveSynth } from './synth';

serveSynth(self as unknown as Port, { piper: createPiper });
