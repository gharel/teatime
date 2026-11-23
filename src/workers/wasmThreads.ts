/// <reference lib="webworker" />
/* Threads WASM de Transformers.js (seulement possible quand la page est isolée : SharedArrayBuffer). */
import { env } from '@huggingface/transformers';

export function setWasmThreads(n: number) {
  const wasm = env.backends.onnx.wasm as { numThreads?: number } | undefined;
  if (wasm && self.crossOriginIsolated) wasm.numThreads = Math.max(1, n);
}
