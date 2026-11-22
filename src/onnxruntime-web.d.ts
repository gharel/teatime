/*
 * Types minimaux d'onnxruntime-web (ses types ne sont pas exposés par le champ « exports » de son
 * package.json). Seule l'API utilisée par la voix légère Piper est décrite.
 */
declare module 'onnxruntime-web' {
  export class Tensor {
    constructor(type: 'int64', data: BigInt64Array, dims: readonly number[]);
    constructor(type: 'float32', data: Float32Array, dims: readonly number[]);
    readonly data: unknown;
    readonly dims: readonly number[];
  }
  export interface InferenceSession {
    readonly inputNames: readonly string[];
    readonly outputNames: readonly string[];
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
    release(): Promise<void>;
  }
  export const InferenceSession: {
    create(
      model: Uint8Array,
      options?: { executionProviders?: string[]; graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all' },
    ): Promise<InferenceSession>;
  };
  export const env: { wasm: { wasmPaths?: string | Record<string, string>; numThreads?: number } };
}
