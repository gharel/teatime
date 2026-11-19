/* ------------------------------------------------------------------
 * Synthèse vocale unifiée :
 *  - Kokoro-82M (neuronale, locale, dans un Web Worker) — voix naturelle,
 *    phonèmes fournis => synchro labiale précise + enveloppe audio réelle.
 *  - Repli : speechSynthesis du système (instantané, sans téléchargement).
 * ------------------------------------------------------------------ */
import { estimateSpeechMs, ipaToVisemes, lipsync, textToVisemes } from './lipsync';
import { getState } from './store';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

export interface EngineStatus {
  status: LoadStatus;
  progress: number; // 0..1
  detail?: string;
}

type Listener = () => void;

/** Agrège la progression de téléchargement de plusieurs fichiers (callbacks Transformers.js). */
export class ProgressTracker {
  private files = new Map<string, { loaded: number; total: number }>();
  update(p: { status?: string; file?: string; loaded?: number; total?: number }): number {
    if (p.file && p.total) this.files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    if (p.file && p.status === 'done') {
      const f = this.files.get(p.file);
      if (f) f.loaded = f.total;
    }
    let l = 0;
    let t = 0;
    this.files.forEach((f) => {
      l += f.loaded;
      t += f.total;
    });
    return t ? l / t : 0;
  }
  totalMB(): number {
    let t = 0;
    this.files.forEach((f) => (t += f.total));
    return t / 1e6;
  }
}

/** Nettoie un texte avant lecture (markdown, emojis, balises). */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*|__|`|#+\s/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Job {
  resolve: () => void;
  lastEnd: number;
  done: boolean;
  sources: AudioBufferSourceNode[];
  requestedAt: number;
  chars: number;
  receivedMs: number;
  staged: number;
}

interface Staged {
  id: number;
  audio: Float32Array;
  sampleRate: number;
  phonemes: string;
  durMs: number;
  genMs: number;
}

export async function webgpuAvailable(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

class TtsService {
  kokoro: EngineStatus = { status: 'idle', progress: 0 };
  private listeners = new Set<Listener>();
  private worker: Worker | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private playHead = 0;
  private nextId = 1;
  private pending = new Map<number, Job>();
  /** Phrases prêtes mais pas encore programmées (tampon anti-trous quand la génération est lente). */
  private staged: Staged[] = [];
  /** Rapport temps de génération / durée audio (moyenne glissante). < 1 = plus rapide que la parole. */
  private rtf = 0.5;
  /** Durée audio moyenne par caractère (ms), pour estimer ce qui reste à générer. */
  private msPerChar = 65;
  private flushTimer: number | undefined;
  /** Appareil réellement utilisé par Kokoro (après détection / repli). */
  kokoroDevice: 'wasm' | 'webgpu' | null = null;
  private tracker = new ProgressTracker();
  private systemVoices: SpeechSynthesisVoice[] = [];
  private speakingCount = 0;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const refresh = () => {
        this.systemVoices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
        this.emit();
      };
      refresh();
      speechSynthesis.addEventListener?.('voiceschanged', refresh);
    }
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  get isSpeaking() {
    return this.speakingCount > 0;
  }

  voices(): SpeechSynthesisVoice[] {
    return this.systemVoices;
  }

  /** Choisit la meilleure voix système anglaise (voix « Natural/Online » d'Edge, Google, Samantha…). */
  bestSystemVoice(): SpeechSynthesisVoice | undefined {
    const wanted = getState().settings.systemVoice;
    const vs = this.systemVoices;
    if (wanted) {
      const v = vs.find((x) => x.name === wanted);
      if (v) return v;
    }
    const score = (v: SpeechSynthesisVoice) =>
      (/natural|neural|online/i.test(v.name) ? 10 : 0) +
      (/google/i.test(v.name) ? 6 : 0) +
      (/(aria|jenny|sonia|libby|emma|ava|samantha|serena|female)/i.test(v.name) ? 3 : 0) +
      (v.lang === 'en-US' || v.lang === 'en-GB' ? 2 : 0) +
      (v.localService ? 1 : 0);
    return vs.slice().sort((a, b) => score(b) - score(a))[0];
  }

  /** Doit être appelé suite à un geste utilisateur (politique d'autoplay). */
  unlockAudio(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') void this.audioCtx.resume();
    return this.audioCtx;
  }

  /** La voix neuronale a-t-elle déjà été téléchargée (Cache Storage de Transformers.js) ? */
  async kokoroCached(): Promise<boolean> {
    try {
      if (!('caches' in self)) return false;
      const device = await this.resolveDevice();
      const file = device === 'webgpu' ? /onnx\/model\.onnx/ : /onnx\/model_quantized\.onnx/;
      const c = await caches.open('transformers-cache');
      const keys = await c.keys();
      return keys.some((k) => /Kokoro-82M/i.test(k.url) && file.test(k.url));
    } catch {
      return false;
    }
  }

  /** Lance (une seule fois) le téléchargement/chargement de Kokoro. */
  async resolveDevice(): Promise<'wasm' | 'webgpu'> {
    const pref = getState().settings.kokoroDevice;
    if (pref === 'wasm' || pref === 'webgpu') return pref;
    return (await webgpuAvailable()) ? 'webgpu' : 'wasm';
  }

  loadKokoro() {
    if (this.kokoro.status === 'loading' || this.kokoro.status === 'ready') return;
    this.kokoro = { status: 'loading', progress: 0, detail: 'Téléchargement de la voix neuronale…' };
    this.emit();
    void this.resolveDevice().then((device) => this.startWorker(device));
  }

  private startWorker(device: 'wasm' | 'webgpu') {
    // Sur GPU la génération est 3 à 5× plus rapide que la parole ; sur CPU elle peut être plus lente.
    this.rtf = device === 'webgpu' ? 0.3 : 1;
    this.worker = new Worker(new URL('../workers/tts.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent) => this.onWorker(e.data);
    this.worker.onerror = (e) => {
      this.kokoro = { status: 'error', progress: 0, detail: e.message || 'Erreur du worker' };
      this.emit();
    };
    this.worker.postMessage({ type: 'load', device });
  }

  private onWorker(msg: any) {
    switch (msg.type) {
      case 'progress': {
        const p = this.tracker.update(msg.p ?? {});
        const mb = this.tracker.totalMB();
        this.kokoro =
          mb < 5
            ? { status: 'loading', progress: 0, detail: 'Préparation de la voix neuronale…' }
            : { status: 'loading', progress: p, detail: p >= 0.999 ? 'Initialisation de la voix…' : `Voix neuronale : ${Math.round(p * 100)} % (${mb.toFixed(0)} Mo)` };
        this.emit();
        break;
      }
      case 'ready':
        this.kokoroDevice = msg.device ?? null;
        this.kokoro = { status: 'ready', progress: 1, detail: msg.device === 'webgpu' ? 'Voix neuronale prête (GPU)' : 'Voix neuronale prête (processeur)' };
        this.emit();
        break;
      case 'error':
        this.kokoro = { status: 'error', progress: 0, detail: msg.error };
        this.emit();
        break;
      case 'chunk':
        this.onChunk(msg.id, msg.audio, msg.sampleRate, msg.phonemes, msg.chars ?? 0, msg.genMs ?? 0);
        break;
      case 'done': {
        const p = this.pending.get(msg.id);
        if (!p) break;
        p.done = true;
        this.flush();
        this.maybeResolve(msg.id);
        break;
      }
    }
  }

  /** Statistiques de fluidité (diagnostic) : génération vs durée audio, trous entre phrases. */
  stats: { genMs: number; durMs: number; gapMs: number; waitMs: number }[] = [];

  private onChunk(id: number, audio: Float32Array, sampleRate: number, phonemes: string, chars: number, genMs: number) {
    const p = this.pending.get(id);
    if (!p || !this.audioCtx) return;
    const durMs = (audio.length / sampleRate) * 1000;
    if (durMs > 200) {
      this.rtf = this.rtf * 0.6 + (genMs / durMs) * 0.4;
      if (chars > 0) this.msPerChar = this.msPerChar * 0.7 + (durMs / chars) * 0.3;
    }
    p.receivedMs += durMs;
    p.staged++;
    this.staged.push({ id, audio, sampleRate, phonemes, durMs, genMs });
    this.flush();
  }

  /**
   * Programme les phrases prêtes. Si Emma parle déjà, on enchaîne. Sinon, quand la génération est plus
   * lente que la parole (CPU), on attend d'avoir assez d'avance pour que la suite s'enchaîne sans trou :
   * une courte pause avant de parler est bien plus naturelle qu'une voix hachée.
   */
  private flush() {
    window.clearTimeout(this.flushTimer);
    if (!this.staged.length || !this.audioCtx) return;
    const ctx = this.audioCtx;
    const playing = ctx.currentTime < this.playHead - 0.05;
    if (!playing) {
      // Phrases encore à générer (estimées d'après leur longueur).
      const upcoming = [...this.pending.values()].filter((p) => !p.done).map((p) => Math.max(0, p.chars * this.msPerChar - p.receivedMs));
      const stagedMs = this.staged.reduce((a, c) => a + c.durMs, 0);
      // Pas de trou si l'avance couvre la génération de la plus longue phrase à venir
      // (et, si la génération est plus lente que la parole, le retard cumulé sur le reste).
      // Une courte pause entre deux phrases (≈ 0,35 s) est naturelle : on la tolère pour démarrer plus tôt.
      const r = this.rtf;
      const PAUSE = 350;
      const maxNext = upcoming.length ? Math.max(...upcoming) : 0;
      const rest = upcoming.reduce((a, b) => a + b, 0);
      const need = Math.max(r * maxNext * 1.1 - PAUSE, (r - 1) * rest + r * maxNext - PAUSE * upcoming.length);
      if (upcoming.length && stagedMs < need) {
        // Re-vérifie dans un instant (au cas où l'estimation du reste baisserait)
        this.flushTimer = window.setTimeout(() => this.flush(), 400);
        return;
      }
    }
    const batch = this.staged.splice(0);
    for (const c of batch) this.schedule(c);
  }

  private schedule(c: Staged) {
    const p = this.pending.get(c.id);
    if (!p || !this.audioCtx || !this.analyser) return;
    p.staged--;
    const ctx = this.audioCtx;
    const buf = ctx.createBuffer(1, c.audio.length, c.sampleRate);
    buf.copyToChannel(c.audio as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser);
    const startAt = Math.max(ctx.currentTime + 0.03, this.playHead);
    // Trou audible : la phrase précédente était finie avant que celle-ci soit prête.
    const queuedBehind = p.sources.length > 0 || p.requestedAt < this.playHead;
    const gapMs = queuedBehind && startAt > this.playHead + 0.035 ? (startAt - this.playHead) * 1000 : 0;
    this.stats.push({ genMs: Math.round(c.genMs), durMs: Math.round(c.durMs), gapMs: Math.round(gapMs), waitMs: 0 });
    if (this.stats.length > 200) this.stats.shift();
    if (import.meta.env.DEV || (globalThis as { __ttsDebug?: boolean }).__ttsDebug) {
      console.info(
        `[tts] gen ${Math.round(c.genMs)} ms · audio ${Math.round(c.durMs)} ms · trou ${Math.round(gapMs)} ms · rtf ${this.rtf.toFixed(2)}`,
      );
    }
    src.start(startAt);
    this.playHead = startAt + buf.duration;
    p.lastEnd = this.playHead;
    p.sources.push(src);
    const perfStart = performance.now() + (startAt - ctx.currentTime) * 1000;
    lipsync.setAnalyser(this.analyser);
    lipsync.schedule(ipaToVisemes(c.phonemes), perfStart, buf.duration * 1000, 60);
    src.onended = () => this.maybeResolve(c.id);
  }

  private maybeResolve(id: number) {
    const p = this.pending.get(id);
    if (!p || !p.done || p.staged > 0 || !this.audioCtx) return;
    if (this.audioCtx.currentTime + 0.02 >= p.lastEnd) {
      this.pending.delete(id);
      this.speakingCount = Math.max(0, this.speakingCount - 1);
      p.resolve();
      this.emit();
    }
  }

  /** Lit un texte. Les appels successifs sont mis en file (lecture en flux). */
  speak(text: string, rate = getState().settings.speechRate): Promise<void> {
    const clean = cleanForSpeech(text);
    if (!clean) return Promise.resolve();
    const s = getState().settings;
    const useKokoro = s.ttsEngine === 'kokoro' && this.kokoro.status === 'ready' && this.worker;
    this.speakingCount++;
    this.emit();
    if (useKokoro) {
      this.unlockAudio();
      const id = this.nextId++;
      return new Promise<void>((resolve) => {
        this.pending.set(id, {
          resolve,
          lastEnd: 0,
          done: false,
          sources: [],
          requestedAt: this.audioCtx?.currentTime ?? 0,
          chars: clean.length,
          receivedMs: 0,
          staged: 0,
        });
        this.worker!.postMessage({ type: 'speak', id, text: clean, voice: s.kokoroVoice, speed: rate });
      });
    }
    return this.speakSystem(clean, rate).finally(() => {
      this.speakingCount = Math.max(0, this.speakingCount - 1);
      this.emit();
    });
  }

  private speakSystem(text: string, rate: number): Promise<void> {
    if (!('speechSynthesis' in window)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const v = this.bestSystemVoice();
      if (v) u.voice = v;
      u.lang = v?.lang ?? 'en-US';
      u.rate = rate;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        lipsync.clear();
        resolve();
      };
      const est = estimateSpeechMs(text, rate);
      let guard = window.setTimeout(finish, est * 2.5 + 3000);
      u.onstart = () => {
        lipsync.setAnalyser(null);
        lipsync.clear();
        lipsync.schedule(textToVisemes(text), performance.now(), est, 0);
        window.clearTimeout(guard);
        guard = window.setTimeout(finish, est * 2.5 + 3000);
      };
      // Resynchronisation à chaque mot quand la voix le permet
      u.onboundary = (e) => {
        if (e.name && e.name !== 'word') return;
        const rest = text.slice(e.charIndex);
        lipsync.clear();
        lipsync.schedule(textToVisemes(rest), performance.now(), estimateSpeechMs(rest, rate), 0);
      };
      u.onend = () => {
        window.clearTimeout(guard);
        finish();
      };
      u.onerror = () => {
        window.clearTimeout(guard);
        finish();
      };
      speechSynthesis.speak(u);
    });
  }

  /** Coupe immédiatement la parole et vide la file. */
  stop() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const ids = [...this.pending.keys()];
    if (ids.length) this.worker?.postMessage({ type: 'cancel', ids });
    this.pending.forEach((p) => {
      p.sources.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* déjà arrêtée */
        }
      });
      p.resolve();
    });
    this.pending.clear();
    this.staged = [];
    window.clearTimeout(this.flushTimer);
    this.speakingCount = 0;
    this.playHead = 0;
    lipsync.clear();
    this.emit();
  }
}

export const tts = new TtsService();
if ((globalThis as { __ttsDebug?: boolean }).__ttsDebug) (globalThis as { __tts?: TtsService }).__tts = tts;

/** Lecture simple pour les exercices (bouton haut-parleur). */
export function say(text: string, slow = false) {
  tts.stop();
  const r = getState().settings.speechRate;
  return tts.speak(text, slow ? Math.max(0.6, r * 0.75) : r);
}
