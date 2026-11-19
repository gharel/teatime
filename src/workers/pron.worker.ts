/// <reference lib="webworker" />
/*
 * Analyse de prononciation 100 % locale :
 *  - wav2vec2-lv-60-espeak (CTC, sans modèle de langue) => phonèmes réellement prononcés ;
 *  - eSpeak-NG (phonemizer) => phonèmes attendus pour le texte reconnu ;
 *  - comparaison et diagnostic (src/lib/pronunciation.ts).
 */
import { AutoModelForCTC, AutoProcessor, env, type PreTrainedModel, type Processor } from '@huggingface/transformers';
import { phonemize } from 'phonemizer';
import { assess, splitWords } from '../lib/pronunciation';
import { retryOnNetworkError } from '../lib/download';

const MODEL = 'onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX';
const VOCAB_URL = `https://huggingface.co/${MODEL}/resolve/main/vocab.json`;

type Msg = { type: 'load' } | { type: 'analyze'; id: number; audio: Float32Array; text: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let processor: Processor | null = null;
let model: PreTrainedModel | null = null;
let idToToken: Record<number, string> = {};
let loading: Promise<void> | null = null;

const wasmEnv = env.backends.onnx.wasm as { numThreads?: number } | undefined;
if (wasmEnv && self.crossOriginIsolated) wasmEnv.numThreads = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 2));

async function loadVocab(): Promise<Record<string, number>> {
  // Petit fichier, gardé en cache pour fonctionner hors ligne.
  const cache = 'caches' in self ? await caches.open('teatime-pron') : null;
  let res = cache ? await cache.match(VOCAB_URL) : undefined;
  if (!res) {
    res = await fetch(VOCAB_URL);
    if (cache && res.ok) await cache.put(VOCAB_URL, res.clone());
  }
  return res.json();
}

async function load() {
  // Coupure réseau pendant les ≈ 320 Mo (fréquente sur mobile) : on relance, les fichiers déjà
  // reçus sont en cache.
  await retryOnNetworkError(async () => {
    const vocab = await loadVocab();
    idToToken = Object.fromEntries(Object.entries(vocab).map(([k, v]) => [v, k]));
    processor = await AutoProcessor.from_pretrained(MODEL);
    model = await AutoModelForCTC.from_pretrained(MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: unknown) => ctx.postMessage({ type: 'progress', p }),
    });
  });
  // Pré-chauffe
  await phonemize('hello', 'en-us');
  await run(new Float32Array(16000));
  ctx.postMessage({ type: 'ready' });
}

/** Décodage CTC glouton : symboles phonétiques réellement entendus. */
async function run(audio: Float32Array): Promise<string[]> {
  const inputs = await processor!(audio);
  const { logits } = (await model!(inputs)) as { logits: { dims: number[]; data: Float32Array } };
  const [, frames, V] = logits.dims;
  const data = logits.data;
  const out: string[] = [];
  let prev = -1;
  for (let f = 0; f < frames; f++) {
    let best = 0;
    let bv = -Infinity;
    const base = f * V;
    for (let v = 0; v < V; v++) {
      const x = data[base + v];
      if (x > bv) {
        bv = x;
        best = v;
      }
    }
    const tok = idToToken[best];
    if (best !== prev && tok && !tok.startsWith('<') && tok !== '|') out.push(tok);
    prev = best;
  }
  return out;
}

/** IPA attendu, un élément par mot (repli mot par mot si eSpeak regroupe/découpe autrement). */
async function expectedIpa(words: string[]): Promise<string[]> {
  const clean = words.map((w) => w.replace(/[^A-Za-z0-9']/g, ''));
  const whole = (await phonemize(clean.join(' '), 'en-us')).join(' ').trim().split(/\s+/);
  if (whole.length === clean.length) return whole;
  return Promise.all(clean.map(async (w) => (await phonemize(w || 'a', 'en-us')).join('').replace(/\s+/g, '')));
}

const queue: Extract<Msg, { type: 'analyze' }>[] = [];
let busy = false;
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift()!;
    try {
      if (!model) await loading;
      if (!model) throw new Error('Modèle non chargé');
      const words = splitWords(job.text);
      const [heard, expected] = await Promise.all([run(job.audio), expectedIpa(words)]);
      ctx.postMessage({ type: 'result', id: job.id, result: assess(words, expected, heard) });
    } catch (err) {
      ctx.postMessage({ type: 'result', id: job.id, result: null, error: String(err) });
    }
  }
  busy = false;
}

ctx.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (msg.type === 'load') {
    if (!loading) {
      loading = load().catch((err) => {
        loading = null;
        ctx.postMessage({ type: 'error', error: String(err?.message ?? err) });
      });
    }
    await loading;
  } else if (msg.type === 'analyze') {
    queue.push(msg);
    void pump();
  }
};
