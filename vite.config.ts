import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Version affichée dans le diagnostic : commit + date du build (savoir ce qui tourne sur le téléphone). */
function appVersion(): string {
  let sha = 'dev';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    /* pas de git */
  }
  const d = new Date();
  const p = (n: number) => `${n}`.padStart(2, '0');
  return `${sha} · ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

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
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
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
