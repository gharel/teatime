import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * COOP/COEP « credentialless » => crossOriginIsolated = true dans Chrome/Edge/Firefox :
 * active SharedArrayBuffer, donc le WASM multi-thread d'onnxruntime (Kokoro, Whisper)
 * tout en laissant charger les modèles depuis Hugging Face (CORS).
 */
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm', 'kokoro-js', '@huggingface/transformers'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
  },
});
