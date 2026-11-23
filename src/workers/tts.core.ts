/// <reference lib="webworker" />
/*
 * Synthèse vocale neuronale, exécutée localement :
 *  - Kokoro-82M (Apache 2.0) : très naturelle, WebGPU ou WASM ;
 *  - Piper (MIT, VITS) : voix légère, pour les appareils où Kokoro est trop lente (piper.core.ts ;
 *    l'appli la sert seule dans piper.worker.ts).
 * Service servi dans son propre worker (tts.worker.ts) ou dans le worker partagé (models.worker.ts).
 */
import { env } from '@huggingface/transformers';
import { KokoroTTS, TextSplitterStream } from 'kokoro-js';
import { createPiper } from './piper.core';
import { exclusive, exclusiveTimed, type Port } from './port';
import { serveSynth, type Device, type Progress, type Synth } from './synth';

const wasmEnv = env.backends.onnx.wasm as { numThreads?: number } | undefined;

/* ------------------------------ Kokoro ------------------------------ */

async function createKokoro(device: Device, progress: Progress): Promise<Synth> {
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    // WebGPU : fp32 (rapide et sans artefact) ; CPU : 8 bits (léger)
    dtype: device === 'webgpu' ? 'fp32' : 'q8',
    device,
    progress_callback: progress,
  });
  return {
    threads: wasmEnv?.numThreads ?? 1,
    async *stream(text, speed, voice) {
      // kokoro-js 1.2.1 ne ferme pas son découpeur quand on lui passe une chaîne : la dernière phrase
      // resterait bloquée indéfiniment. On fournit donc notre propre flux, fermé explicitement.
      const splitter = new TextSplitterStream();
      const stream = tts.stream(splitter, { voice: voice as never, speed });
      splitter.push(text);
      splitter.close();
      // Une phrase calculée à la fois (file commune aux modèles du worker).
      const it = stream[Symbol.asyncIterator]();
      for (;;) {
        const r = await exclusive(() => it.next());
        if (r.done) break;
        const c = r.value;
        yield { audio: c.audio.audio as Float32Array, sampleRate: c.audio.sampling_rate, phonemes: c.phonemes, text: c.text };
      }
    },
    async once(text) {
      const { value: out, ms } = await exclusiveTimed(() => tts.generate(text, { voice: 'af_heart' }));
      return { samples: out.audio.length, sampleRate: out.sampling_rate, ms };
    },
    async dispose() {
      await (tts as unknown as { model?: { dispose?: () => Promise<unknown> } }).model?.dispose?.();
    },
  };
}

/** Sert la synthèse vocale (Kokoro ou Piper) sur ce port. */
export function serveTts(port: Port) {
  serveSynth(port, { kokoro: createKokoro, piper: createPiper });
}
