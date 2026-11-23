/// <reference lib="webworker" />
/*
 * onnxruntime-web en build WASM simple (1.22, sans JSEP ni WebGPU : ≈ 11,1 Mo de WASM contre 21,6),
 * servi avec l'appli. Celui de Piper partout ; sur iPhone, celui de tous les modèles : le worker
 * partagé l'importe avant Transformers.js, et son bundle lui redirige l'import « onnxruntime-web »
 * de Transformers.js (voir vite.config.ts). Un seul runtime, donc un seul tas mémoire WASM : iOS
 * refusait d'en allouer un second (« RangeError: Out of memory », compréhension indisponible).
 */
import * as ort from 'onnxruntime-web/wasm';
import ortMjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import ortWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';

export { ort };

/**
 * Fichiers du build simple (module d'amorçage + WASM) : le bundle les cherche à côté de lui, où Vite
 * ne les met pas. Un thread : Piper n'en tire rien, et l'iPhone n'est pas isolé (pas de threads).
 * À poser avant la création de la première session.
 */
export function usePlainOrt() {
  ort.env.wasm.wasmPaths = { mjs: ortMjsUrl, wasm: ortWasmUrl };
  ort.env.wasm.numThreads = 1;
}

// Dès l'import : Transformers.js, importé ensuite, garde ces chemins (il ne pose les siens, vers son
// CDN et le build JSEP, que si aucun n'est défini).
usePlainOrt();
