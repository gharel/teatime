/* ------------------------------------------------------------------
 * Reconnaissance vocale unifiée :
 *  - Web Speech API (Chrome/Edge/Safari) : rapide, résultats intermédiaires.
 *    Dans Chrome l'audio part vers un service en ligne de Google ; s'il est
 *    injoignable (erreur « network », navigateur intégré…), on bascule
 *    automatiquement et durablement sur Whisper.
 *  - Whisper (Transformers.js, Web Worker) : 100 % local et privé, avec
 *    transcription en direct (passes intermédiaires pendant qu'on parle).
 *
 * Deux modes :
 *  - listen()               : un énoncé (exercices, jeux, test du micro) ;
 *  - ContinuousListener     : micro ouvert en permanence (conversation avec
 *                             Emma), découpage automatique en énoncés.
 * ------------------------------------------------------------------ */
import {
  beginCaptureAudioSession,
  beginLoad,
  constrainedDevice,
  endCaptureAudioSession,
  endLoad,
  interruptedLoads,
  isIOS,
  releaseMicWhileSpeaking,
} from './device';
import { openModelWorker, type ModelWorker } from './modelWorker';
import { heapNote, journal } from './journal';
import { crashOnStartup } from './recover';
import { getState, updateSettings } from './store';
import { ProgressTracker, tts, type EngineStatus } from './tts';

/** Écoute sans aucun mot reconnu au-delà de ce délai : noté au journal (diagnostic). */
const QUIET_NOTE_MS = 20_000;

export interface ListenOptions {
  silenceMs?: number;
  /** Abandon si l'apprenant ne parle pas du tout (ms). */
  noSpeechMs?: number;
  maxMs?: number;
  onInterim?: (text: string) => void;
  onLevel?: (level: number) => void;
  onSpeechStart?: () => void;
  /** Appelé quand la capture est finie et que la transcription commence (Whisper). */
  onProcessing?: () => void;
}

export interface ListenHandle {
  /** Termine l'écoute et renvoie ce qui a été entendu. */
  stop(): void;
  /** Annule sans résultat. */
  abort(): void;
  result: Promise<string>;
}

type SR = any;

export function webSpeechSupported(): boolean {
  return typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/** Moteur réellement utilisé selon les réglages et le navigateur. */
export function resolveSttEngine(): 'webspeech' | 'whisper' {
  const e = getState().settings.sttEngine;
  if (!webSpeechSupported()) return 'whisper';
  if (e !== 'whisper') return 'webspeech';
  // iPhone : la page a été tuée deux fois de suite pendant le chargement de Whisper (mémoire) :
  // reconnaissance du navigateur plutôt qu'un plantage à chaque ouverture.
  if (isIOS() && interruptedLoads('whisper').count >= 2) return 'webspeech';
  return 'whisper';
}

/**
 * iOS : une reconnaissance du navigateur démarrée moins de ~45 s après la fin de la précédente
 * reste sourde, sans résultat, erreur ni fin (bug WebKit 321436, iOS 26 à 27.3 ; constaté aussi
 * sans aucun son joué entre les deux). Rien côté page ne la réveille (nouvel objet, stop/abort,
 * getUserMedia, iframe neuve) : dans une conversation, la 2e réponse n'était jamais entendue.
 */
const IOS_REC_COOLDOWN_MS = 45_000;
/** iOS : délai sans aucun mot avant de conclure à une reconnaissance sourde (relancée trop tôt). */
const IOS_DEAF_MS = 12_000;
/** Fin de la dernière session de reconnaissance du navigateur. */
let lastRecEnd = -Infinity;

/**
 * La page capte-t-elle elle-même le micro (audio de l'énoncé, pour l'analyse de prononciation) ?
 * Whisper toujours. Avec la reconnaissance du navigateur, pas sur iPhone : iOS ne laisse le micro
 * qu'à une capture, la seconde coupait la reconnaissance (« audio-capture », puis « not-allowed »),
 * redemandait l'autorisation et précédait les plantages de la page.
 */
export function pageCapturesMic(): boolean {
  return resolveSttEngine() === 'whisper' || !isIOS();
}

/* ------------------------------ Avis (bascule) ------------------------------ */

const noticeListeners = new Set<(msg: string) => void>();
export function onSttNotice(cb: (msg: string) => void) {
  noticeListeners.add(cb);
  return () => noticeListeners.delete(cb);
}

const NETWORK_FALLBACK_MSG =
  'La reconnaissance vocale du navigateur est injoignable ici. Emma utilise maintenant Whisper, qui fonctionne entièrement sur votre appareil.';
const IOS_DEAF_MSG =
  'Sur iPhone, la reconnaissance du navigateur n’entend plus rien après une première réponse (bug d’iOS). Emma utilise maintenant Whisper, qui fonctionne entièrement sur votre appareil.';
const WHISPER_FAILED_MSG =
  'Whisper n’a pas pu se charger : Emma écoute avec la reconnaissance du navigateur (sur iPhone, elle peut ne pas entendre la réponse suivante).';

/** La reconnaissance du navigateur a échoué (réseau, ou sourde sur iPhone) : on passe à Whisper pour de bon. */
function fallbackToWhisper(msg = NETWORK_FALLBACK_MSG) {
  if (getState().settings.sttEngine !== 'whisper') updateSettings({ sttEngine: 'whisper' });
  noticeListeners.forEach((l) => l(msg));
  void whisper.load();
}

/* --------------------------- Micro + niveau --------------------------- */

/**
 * Lecteur audio de la capture (worklet), gardé d'une écoute à l'autre et suspendu entre deux.
 * WebKit (iOS) ne laisse démarrer un lecteur sans toucher que si la page capte déjà le micro à
 * l'instant où il le demande (AudioContext::willBeginPlayback) ; sinon sa reprise reste en attente
 * pour toujours : micro ouvert, voyant allumé, aucun son livré. Un lecteur qui a démarré une fois
 * (pendant un toucher : primeMicCapture, ou pendant une capture) repart ensuite sans geste.
 */
let captureCtx: AudioContext | null = null;
let captureModule: Promise<void> | null = null;
let captureSink: GainNode | null = null;
/** Captures en cours sur ce lecteur (il n'est suspendu qu'à la dernière fermeture). */
let captureUsers = 0;

function captureContext(): AudioContext {
  if (!captureCtx || captureCtx.state === 'closed') {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    captureCtx = new Ctor();
    captureModule = null;
    captureSink = null;
  }
  return captureCtx;
}

/** Abandonne le lecteur de capture (bloqué) : le prochain sera créé pendant la capture. */
function dropCaptureContext(ctx: AudioContext) {
  if (captureCtx !== ctx) return;
  captureCtx = null;
  captureModule = null;
  captureSink = null;
  void ctx.close().catch(() => undefined);
}

function captureWorklet(ctx: AudioContext): Promise<void> {
  if (!captureModule) {
    captureModule = ctx.audioWorklet.addModule(new URL('worklets/capture.js', document.baseURI).href).catch((err) => {
      captureModule = null;
      throw err;
    });
  }
  return captureModule;
}

/** Sortie à gain nul : le worklet doit être relié à la sortie pour être cadencé dans certains navigateurs. */
function captureOutput(ctx: AudioContext): AudioNode {
  if (!captureSink) {
    captureSink = ctx.createGain();
    captureSink.gain.value = 0;
    captureSink.connect(ctx.destination);
  }
  return captureSink;
}

/**
 * Démarre le lecteur de capture. Plusieurs demandes espacées : WebKit ne réévalue son autorisation
 * qu'à chaque demande, et la page n'est comptée « en capture » qu'un instant après getUserMedia.
 */
async function runCaptureContext(ctx: AudioContext): Promise<boolean> {
  for (let i = 0; i < 6 && ctx.state !== 'running'; i++) {
    await Promise.race([ctx.resume().catch(() => undefined), new Promise((r) => window.setTimeout(r, 350))]);
  }
  return ctx.state === 'running';
}

/** État du lecteur de capture (diagnostic). */
export function captureContextState(): string {
  return captureCtx ? `${captureCtx.state} · ${captureCtx.sampleRate} Hz` : 'pas encore créé';
}

/**
 * À appeler pendant un toucher (Commencer, bouton du micro) : sur iPhone avec Whisper, le lecteur
 * de capture démarre pendant le geste, puis repart sans geste à chaque écoute.
 */
export function primeMicCapture() {
  if (typeof window === 'undefined' || !isIOS() || resolveSttEngine() !== 'whisper') return;
  try {
    const ctx = captureContext();
    if (ctx.state === 'running') return;
    void ctx
      .resume()
      .then(() => {
        if (captureUsers === 0 && captureCtx === ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
      })
      .catch(() => undefined);
  } catch {
    /* sans gravité : il sera créé pendant la capture */
  }
}

/** Micro qui ne livre plus rien (lecteur bloqué, piste muette ou coupée par le système). */
type MicDead = (why: string) => void;

class MicCapture {
  stream: MediaStream | null = null;
  ctx: AudioContext | null = null;
  node: AudioWorkletNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  sampleRate = 48000;

  private session = false;
  /** Surveillance : aucun son, plus de son, ou que des zéros (piste rendue muette par iOS). */
  private watch: number | undefined;
  private openedAt = 0;
  private chunks = 0;
  private lastChunk = 0;
  private lastSound = 0;
  private peak = 0;
  private nudged = false;
  /** Piste signalée muette par le système depuis cet instant (0 : active). */
  private mutedSince = 0;
  private onDead: MicDead | undefined;

  async start(onChunk: (pcm: Float32Array, rms: number) => void, onDead?: MicDead) {
    // iOS : session audio « play-and-record » avant d'ouvrir le micro, gardée ensuite (voir device.ts).
    if (!this.session) {
      await tts.parkForCapture();
      this.session = true;
      beginCaptureAudioSession();
    }
    journal('micro : ouverture demandée');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    for (const t of this.stream.getAudioTracks()) {
      t.onended = () => this.dead('micro coupé par le système');
      t.onmute = () => {
        this.mutedSince = performance.now();
        journal('micro : piste rendue muette par le système');
      };
      t.onunmute = () => {
        this.mutedSince = 0;
        journal('micro : piste de nouveau active');
      };
    }
    this.openedAt = performance.now();
    this.lastSound = this.openedAt;
    this.ctx = captureContext();
    captureUsers++;
    let running = await this.connect(this.ctx, onChunk);
    if (!running && captureUsers === 1) {
      // Lecteur resté bloqué (créé hors geste avant la capture) : un neuf, créé pendant la capture, peut démarrer.
      journal(`micro : lecteur de capture bloqué (${this.ctx.state}), lecteur neuf`);
      this.disconnect();
      dropCaptureContext(this.ctx);
      this.ctx = captureContext();
      running = await this.connect(this.ctx, onChunk);
    }
    this.sampleRate = this.ctx.sampleRate;
    journal(`micro ouvert (lecteur de capture ${this.ctx.state}, ${this.sampleRate} Hz)`);
    this.onDead = onDead;
    window.clearInterval(this.watch);
    this.watch = window.setInterval(() => this.check(), 1000);
  }

  private async connect(ctx: AudioContext, onChunk: (pcm: Float32Array, rms: number) => void): Promise<boolean> {
    await captureWorklet(ctx);
    this.src = ctx.createMediaStreamSource(this.stream!);
    this.node = new AudioWorkletNode(ctx, 'capture-processor');
    this.node.port.onmessage = (e) => {
      const now = performance.now();
      const rms: number = e.data.rms;
      if (!this.chunks) journal(`micro : premier son ${Math.round(now - this.openedAt)} ms après l’ouverture`);
      this.chunks++;
      this.lastChunk = now;
      // Que des zéros : piste muette (un vrai micro, même au calme, n'est jamais exactement nul).
      if (rms > 0) this.lastSound = now;
      if (rms > this.peak) this.peak = rms;
      onChunk(e.data.pcm, rms);
    };
    this.src.connect(this.node);
    this.node.connect(captureOutput(ctx));
    return runCaptureContext(ctx);
  }

  private check() {
    if (!this.ctx) return;
    const now = performance.now();
    let why = '';
    if (!this.chunks) {
      if (now - this.openedAt > 2500 && !this.nudged) {
        this.nudged = true;
        journal(`micro : aucun son en 2,5 s (lecteur de capture ${this.ctx.state}), relance du lecteur`);
        void this.ctx.resume().catch(() => undefined);
      }
      if (now - this.openedAt > 6000) why = `aucun son du micro en 6 s (lecteur de capture ${this.ctx.state})`;
    } else if (now - this.lastChunk > 3000) {
      why = `le micro ne livre plus de son (lecteur de capture ${this.ctx.state})`;
    } else if (this.lastSound === this.openedAt && now - this.openedAt > 6000) {
      // Que des zéros depuis l'ouverture : piste muette (un vrai micro n'est jamais exactement nul).
      why = 'micro muet depuis l’ouverture (que des zéros)';
    } else if (this.mutedSince && now - this.mutedSince > 4000) {
      why = 'piste muette depuis 4 s';
    }
    if (why) this.dead(why);
  }

  private dead(why: string) {
    window.clearInterval(this.watch);
    const cb = this.onDead;
    this.onDead = undefined;
    journal(`micro : ${why}`);
    cb?.(why);
  }

  private disconnect() {
    if (this.node) this.node.port.onmessage = null;
    this.node?.disconnect();
    this.src?.disconnect();
    this.node = null;
    this.src = null;
  }

  stop() {
    window.clearInterval(this.watch);
    this.onDead = undefined;
    if (this.stream || this.ctx) {
      const s = this.openedAt ? ((performance.now() - this.openedAt) / 1000).toFixed(1).replace('.', ',') : '0';
      journal(`micro : fermeture (${s} s, ${this.chunks} blocs, niveau max ${this.peak.toFixed(3).replace('.', ',')})`);
    }
    this.disconnect();
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.onmute = null;
      t.onunmute = null;
      t.stop();
    });
    this.stream = null;
    if (this.ctx) {
      // Lecteur gardé pour la prochaine écoute (il repartira sans geste), suspendu en attendant.
      captureUsers = Math.max(0, captureUsers - 1);
      if (captureUsers === 0 && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
      this.ctx = null;
    }
    if (this.session) {
      this.session = false;
      endCaptureAudioSession();
    }
  }
}

function micErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Micro refusé : autorisez l’accès au microphone dans votre navigateur.';
  if (name === 'NotFoundError') return 'Aucun micro détecté. Branchez un micro ou un casque.';
  return (err as Error)?.message || String(err);
}

/** Noyau passe-bas (sinc fenêtré de Blackman) tabulé, par rapport de ré-échantillonnage. */
const KERNEL_RES = 64; // pas de la table : 1/64 d'échantillon
const kernels = new Map<number, { half: number; table: Float32Array }>();
function lowpassKernel(ratio: number) {
  let k = kernels.get(ratio);
  if (k) return k;
  // Coupure un peu sous 8 kHz (Nyquist de la sortie), exprimée en cycles par échantillon d'entrée.
  const fc = (0.5 / ratio) * 0.92;
  const half = Math.ceil(8 * ratio); // 8 passages par zéro de chaque côté
  const table = new Float32Array(half * KERNEL_RES + 2);
  for (let j = 0; j < table.length; j++) {
    const t = j / KERNEL_RES;
    const u = Math.min(1, t / half);
    const win = 0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u);
    const x = 2 * fc * t;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    table[j] = 2 * fc * sinc * win;
  }
  k = { half, table };
  kernels.set(ratio, k);
  return k;
}

/**
 * Ré-échantillonnage vers 16 kHz (format attendu par Whisper), avec filtre anti-repliement.
 * Une simple interpolation linéaire depuis 48 kHz replie les aigus (s, f, th…) dans la bande
 * utile : la voix devient brouillée et Whisper se trompe bien plus souvent.
 */
export function resampleTo16k(chunks: Float32Array[], fromRate: number): Float32Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const input = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    input.set(c, o);
    o += c.length;
  }
  if (fromRate === 16000 || !total) return input;
  const ratio = fromRate / 16000;
  const outLen = Math.floor(total / ratio);
  const out = new Float32Array(outLen);
  if (ratio < 1) {
    // Sur-échantillonnage (micro à 8 kHz) : pas de repliement possible, l'interpolation suffit.
    for (let i = 0; i < outLen; i++) {
      const x = i * ratio;
      const i0 = Math.floor(x);
      const i1 = Math.min(total - 1, i0 + 1);
      const f = x - i0;
      out[i] = input[i0] * (1 - f) + input[i1] * f;
    }
    return out;
  }
  const { half, table } = lowpassKernel(ratio);
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const c = Math.floor(x);
    const from = Math.max(0, c - half + 1);
    const to = Math.min(total - 1, c + half);
    let acc = 0;
    let wsum = 0;
    for (let k = from; k <= to; k++) {
      const h = table[Math.round(Math.abs(x - k) * KERNEL_RES)];
      acc += input[k] * h;
      wsum += h;
    }
    out[i] = wsum ? acc / wsum : 0;
  }
  return out;
}

/** Nettoie une transcription Whisper (balises, « hallucinations » sur du silence, boucles). */
export function cleanWhisperText(text: string): string {
  let t = text
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(you\.?|thank you\.?|thanks for watching!?|bye\.?|\.+)$/i.test(t)) return '';
  // Whisper part parfois en boucle (« I like it. I like it. I like it. ») : on garde une occurrence.
  return collapseRepeats(t);
}

/** Réduit à une occurrence tout groupe de 1 à 6 mots répété au moins 3 fois de suite. */
export function collapseRepeats(text: string): string {
  const w = text.split(/\s+/).filter(Boolean);
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, '');
  const same = (a: number, b: number, n: number) => {
    for (let k = 0; k < n; k++) if (key(w[a + k]) !== key(w[b + k])) return false;
    return true;
  };
  const out: string[] = [];
  let i = 0;
  while (i < w.length) {
    let step = 0;
    for (let n = 1; n <= 6 && i + n * 3 <= w.length; n++) {
      let reps = 1;
      while (i + (reps + 1) * n <= w.length && same(i, i + reps * n, n)) reps++;
      if (reps >= 3) {
        out.push(...w.slice(i, i + n));
        step = reps * n;
        break;
      }
    }
    if (step) i += step;
    else out.push(w[i++]);
  }
  return out.join(' ');
}

/**
 * Fusionne deux morceaux de transcription Web Speech. Chrome Android renvoie souvent des résultats
 * cumulatifs (« I », « I like », « I like cats ») : les concaténer donnait « I I like I like cats ».
 */
export function mergeTranscript(prev: string, next: string): string {
  const p = prev.trim();
  const n = next.trim();
  if (!p) return n;
  if (!n) return p;
  const np = normalizeLoose(p);
  const nn = normalizeLoose(n);
  if (nn === np || nn.startsWith(np + ' ')) return n; // le nouveau résultat contient déjà l'ancien
  if (nn.includes(' ') && (` ${np} `).includes(` ${nn} `)) return p; // doublon (2 mots ou plus)
  // Chevauchement fin de l'ancien / début du nouveau (« I like » + « like cats »)
  const pw = np.split(' ');
  const nw = nn.split(' ');
  for (let k = Math.min(pw.length, nw.length); k >= 2; k--) {
    if (pw.slice(-k).join(' ') === nw.slice(0, k).join(' ')) return `${p} ${n.split(/\s+/).slice(k).join(' ')}`.trim();
  }
  return `${p} ${n}`;
}

function normalizeLoose(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Texte d'une session Web Speech, reconstruit à chaque événement depuis la liste complète des
 * résultats (et non accumulé d'un événement à l'autre : Android renvoie les mêmes résultats).
 */
export function webSpeechText(results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>): string {
  let final = '';
  let interim = '';
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const t = r[0]?.transcript ?? '';
    if (r.isFinal) final = mergeTranscript(final, t);
    else interim = mergeTranscript(interim, t);
  }
  // Un résultat intermédiaire qui reprend le texte final (Android) ne doit pas le doubler.
  return mergeTranscript(final, interim);
}

/* ------------------------------ Whisper ------------------------------ */

const LIGHT_WHISPER = 'onnx-community/whisper-tiny';

/**
 * iPhone : la page a été tuée (mémoire) pendant une conversation où Whisper écoutait : modèle tiny,
 * ≈ 100 Mo de moins en mémoire et deux fois plus rapide, un peu moins précis. Le modèle reste
 * modifiable dans les réglages.
 */
function lighterWhisperAfterCrash() {
  const crash = crashOnStartup();
  const model = getState().settings.whisperModel;
  if (!crash || !isIOS() || !/^conversation .*Whisper/.test(crash.label) || model === LIGHT_WHISPER) return;
  updateSettings({ whisperModel: LIGHT_WHISPER });
  journal(`page tuée pendant la conversation : Whisper passe de ${model.split('/').pop()} à ${LIGHT_WHISPER.split('/').pop()} (plus léger)`);
}

class WhisperService {
  status: EngineStatus = { status: 'idle', progress: 0 };
  private worker: ModelWorker | null = null;
  private listeners = new Set<() => void>();
  private tracker = new ProgressTracker();
  private nextId = 1;
  private waiters = new Map<number, (t: string) => void>();
  private readyWaiters: (() => void)[] = [];
  /**
   * Transcription lente (téléphone, ≈ 4 s par énoncé sur un iPhone 12 mini) : l'aperçu en direct
   * occuperait Whisper en continu et la transcription finale attendrait derrière lui. On s'en passe.
   */
  slow = false;
  private avgMs: number | null = null;

  private noteDuration(ms: number) {
    this.avgMs = this.avgMs === null ? ms : this.avgMs * 0.6 + ms * 0.4;
    this.slow = this.avgMs > 1500;
  }

  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  async load() {
    if (this.status.status === 'ready') return;
    if (this.status.status !== 'loading') {
      lighterWhisperAfterCrash();
      this.status = { status: 'loading', progress: 0, detail: 'Téléchargement de Whisper…' };
      this.emit();
      // Téléphone : processeur. Le GPU mobile donne des transcriptions fausses avec le décodeur 4 bits,
      // et la mémoire manque à côté de la voix. Même repli si un chargement GPU a déjà planté.
      const gpu =
        !constrainedDevice() &&
        interruptedLoads('whisper').device !== 'webgpu' &&
        !!(navigator as any).gpu &&
        !!(await (navigator as any).gpu.requestAdapter().catch(() => null));
      beginLoad('whisper', gpu ? 'webgpu' : 'wasm');
      this.worker?.terminate();
      this.worker = openModelWorker('stt');
      this.worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') {
          const p = this.tracker.update(m.p ?? {});
          const mb = this.tracker.totalMB();
          this.status = {
            status: 'loading',
            progress: mb < 5 ? 0 : p,
            detail: mb < 5 ? 'Préparation de Whisper…' : p >= 0.999 ? 'Initialisation de Whisper…' : `Whisper : ${Math.round(p * 100)} % (${mb.toFixed(0)} Mo)`,
          };
          this.emit();
        } else if (m.type === 'ready') {
          if (typeof m.warmMs === 'number') this.noteDuration(m.warmMs);
          journal(`Whisper prêt (pré-chauffe ${Math.round(m.warmMs ?? 0)} ms)${heapNote(m.heap)}`);
          endLoad('whisper');
          this.status = { status: 'ready', progress: 1, detail: 'Whisper prêt (100 % local)' };
          this.readyWaiters.splice(0).forEach((r) => r());
          this.emit();
        } else if (m.type === 'error') {
          endLoad('whisper');
          this.status = { status: 'error', progress: 0, detail: m.error };
          this.readyWaiters.splice(0).forEach((r) => r());
          this.emit();
        } else if (m.type === 'result') {
          if (typeof m.ms === 'number') this.noteDuration(m.ms);
          journal(
            `Whisper : ${m.error ? `erreur ${String(m.error).slice(0, 60)}` : `${String(m.text ?? '').length} car. en ${Math.round(m.ms ?? 0)} ms`}${heapNote(m.heap)}`,
          );
          this.waiters.get(m.id)?.(m.text);
          this.waiters.delete(m.id);
        }
      };
      this.worker.postMessage({ type: 'load', model: getState().settings.whisperModel, device: gpu ? 'webgpu' : 'wasm' });
    }
    await new Promise<void>((r) => this.readyWaiters.push(r));
  }

  transcribe(audio: Float32Array): Promise<string> {
    if (!this.worker) return Promise.resolve('');
    const id = this.nextId++;
    journal(`Whisper : transcription de ${(audio.length / 16000).toFixed(1).replace('.', ',')} s d’audio`);
    return new Promise((resolve) => {
      this.waiters.set(id, resolve);
      this.worker!.postMessage({ type: 'transcribe', id, audio }, [audio.buffer]);
    });
  }
}

export const whisper = new WhisperService();

/** Le modèle Whisper choisi est-il déjà téléchargé (cache de Transformers.js) ? */
export async function whisperCached(): Promise<boolean> {
  try {
    if (!('caches' in self)) return false;
    const name = getState().settings.whisperModel.split('/').pop() ?? '';
    const keys = await (await caches.open('transformers-cache')).keys();
    return keys.some((k) => k.url.includes(`/${name}/`) && /encoder_model/.test(k.url));
  } catch {
    return false;
  }
}

/* ------------------------------ Découpage en énoncés (VAD) ------------------------------ */

interface SegmenterOptions {
  sampleRate: number;
  /** Bruit de fond déjà estimé (micro rouvert : on repart de la mesure précédente). */
  noise?: number;
  silenceMs: () => number;
  onSpeechStart: () => void;
  /** Audio de l'énoncé en cours, appelé régulièrement (transcription en direct). */
  onPartial: (chunks: Float32Array[]) => void;
  onSegment: (chunks: Float32Array[]) => void;
  partialEveryMs?: number;
  maxMs?: number;
}

/**
 * Détecteur d'activité vocale par énergie, avec bruit de fond adaptatif, hystérésis,
 * pré-roll (on garde le début du mot) et durée minimale de parole.
 */
class Segmenter {
  private noise = Infinity;
  private speaking = false;
  private loudRun = 0;
  private chunks: Float32Array[] = [];
  private preroll: Float32Array[] = [];
  private lastVoice = 0;
  private startedAt = 0;
  private voicedMs = 0;
  private lastPartial = 0;
  /** Nombre de blocs jusqu'au dernier bloc où l'on entendait la voix. */
  private voicedUpTo = 0;
  constructor(private o: SegmenterOptions) {
    if (o.noise !== undefined && Number.isFinite(o.noise)) this.noise = o.noise;
  }

  /** Bruit de fond estimé (RMS). */
  get noiseLevel(): number {
    return this.noise;
  }

  reset() {
    this.speaking = false;
    this.loudRun = 0;
    this.chunks = [];
    this.preroll = [];
    this.voicedMs = 0;
    this.voicedUpTo = 0;
  }

  /**
   * Énoncé sans le long silence de fin (le temps de réflexion avant qu'Emma réponde) : sur du
   * silence ou du bruit, Whisper invente des mots (« Thank you. ») et transcrit plus lentement.
   */
  private trimmed(chunkMs: number): Float32Array[] {
    const tail = Math.ceil(400 / Math.max(1, chunkMs));
    return this.chunks.slice(0, Math.min(this.chunks.length, this.voicedUpTo + tail));
  }

  push(pcm: Float32Array, rms: number) {
    const now = performance.now();
    const chunkMs = (pcm.length / this.o.sampleRate) * 1000;
    if (!Number.isFinite(this.noise)) this.noise = Math.max(0.002, rms);
    const thresh = Math.min(0.06, Math.max(0.01, this.noise * 3));
    if (!this.speaking) {
      // Le bruit de fond s'adapte lentement quand personne ne parle.
      this.noise = this.noise * 0.97 + Math.min(rms, this.noise * 2) * 0.03;
      this.preroll.push(pcm);
      if (this.preroll.length > 10) this.preroll.shift();
      this.loudRun = rms > thresh ? this.loudRun + 1 : 0;
      if (this.loudRun >= 2) {
        this.speaking = true;
        this.chunks = this.preroll.slice();
        this.voicedUpTo = this.chunks.length;
        this.preroll = [];
        this.startedAt = now;
        this.lastVoice = now;
        this.lastPartial = now;
        this.voicedMs = chunkMs * 2;
        this.o.onSpeechStart();
      }
      return;
    }
    this.chunks.push(pcm);
    if (rms > thresh * 0.7) {
      this.lastVoice = now;
      this.voicedMs += chunkMs;
      this.voicedUpTo = this.chunks.length;
    }
    if (now - this.lastPartial > (this.o.partialEveryMs ?? 900)) {
      this.lastPartial = now;
      this.o.onPartial(this.chunks);
    }
    const ended = now - this.lastVoice > this.o.silenceMs();
    const tooLong = now - this.startedAt > (this.o.maxMs ?? 30000);
    if (ended || tooLong) {
      const seg = this.trimmed(chunkMs);
      const voiced = this.voicedMs;
      this.reset();
      if (voiced >= 350) this.o.onSegment(seg);
    }
  }

  /** Force la fin de l'énoncé en cours (bouton « J'ai fini »). */
  flush() {
    if (!this.speaking) return;
    const last = this.chunks[this.chunks.length - 1];
    const seg = last ? this.trimmed((last.length / this.o.sampleRate) * 1000) : this.chunks;
    this.reset();
    this.o.onSegment(seg);
  }
}

/* ------------------------------ Écoute ponctuelle ------------------------------ */

export function listen(opts: ListenOptions = {}): ListenHandle {
  if (resolveSttEngine() === 'whisper') return listenWhisper(opts);
  // Web Speech, avec repli transparent sur Whisper si le service en ligne est injoignable.
  let current = listenWebSpeech(opts);
  const result = current.result.catch((err: Error & { network?: boolean }) => {
    if (!err.network) throw err;
    fallbackToWhisper();
    current = listenWhisper(opts);
    return current.result;
  });
  return {
    result,
    stop: () => current.stop(),
    abort: () => current.abort(),
  };
}

function networkError(): Error & { network: true } {
  return Object.assign(new Error(NETWORK_FALLBACK_MSG), { network: true as const });
}

function listenWebSpeech(opts: ListenOptions): ListenHandle {
  const s = getState().settings;
  const silenceMs = opts.silenceMs ?? s.silenceMs;
  const noSpeechMs = opts.noSpeechMs ?? 9000;
  const maxMs = opts.maxMs ?? 45000;
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec: SR = new Ctor();
  rec.lang = s.sttLang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let text = '';
  let heard = false;
  let aborted = false;
  let failed = false;
  const started = performance.now();
  let lastActivity = started;
  let resolveFn!: (t: string) => void;
  let rejectFn!: (e: Error) => void;
  const result = new Promise<string>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });

  // Indicateur de niveau micro (purement visuel) ; pas sur iPhone (une seule capture, voir pageCapturesMic).
  const mic = new MicCapture();
  if (opts.onLevel && pageCapturesMic()) {
    mic.start((_, rms) => opts.onLevel!(Math.min(1, rms * 12))).catch(() => undefined);
  }

  rec.onresult = (e: any) => {
    text = webSpeechText(e.results);
    if (!heard) opts.onSpeechStart?.();
    heard = true;
    lastActivity = performance.now();
    opts.onInterim?.(text);
  };
  rec.onspeechstart = () => {
    lastActivity = performance.now();
  };
  rec.onerror = (e: any) => {
    if (e.error === 'not-allowed') {
      failed = true;
      cleanup();
      rejectFn(new Error('Micro refusé : autorisez l’accès au microphone dans votre navigateur.'));
    } else if (e.error === 'network' || e.error === 'service-not-allowed' || e.error === 'language-not-supported') {
      failed = true;
      cleanup();
      rejectFn(networkError());
    }
  };
  rec.onend = () => {
    lastRecEnd = performance.now();
    cleanup();
    if (!failed) resolveFn(aborted ? '' : text.trim());
  };

  const timer = window.setInterval(() => {
    const now = performance.now();
    if ((heard && now - lastActivity > silenceMs) || (!heard && now - started > noSpeechMs) || now - started > maxMs) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
  }, 120);

  function cleanup() {
    window.clearInterval(timer);
    mic.stop();
  }

  try {
    rec.start();
  } catch (err) {
    cleanup();
    rejectFn(err as Error);
  }

  return {
    result,
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
    abort: () => {
      aborted = true;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

function listenWhisper(opts: ListenOptions): ListenHandle {
  const s = getState().settings;
  const noSpeechMs = opts.noSpeechMs ?? 9000;
  const mic = new MicCapture();
  let finished = false;
  let aborted = false;
  let heard = false;
  let started = performance.now();
  let interimBusy = false;
  let resolveFn!: (t: string) => void;
  let rejectFn!: (e: Error) => void;
  const result = new Promise<string>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });
  let seg: Segmenter | undefined;

  const done = async (chunks: Float32Array[] | null) => {
    if (finished) return;
    finished = true;
    mic.stop();
    if (aborted || !chunks || !chunks.length) {
      resolveFn('');
      return;
    }
    opts.onProcessing?.();
    const text = cleanWhisperText(await whisper.transcribe(resampleTo16k(chunks, mic.sampleRate)));
    resolveFn(text);
  };

  (async () => {
    try {
      if (whisper.status.status !== 'ready') await whisper.load();
      if (whisper.status.status !== 'ready') throw new Error(whisper.status.detail || 'Whisper indisponible');
      if (finished) return;
      await mic.start(
        (pcm, rms) => {
          if (finished) return;
          opts.onLevel?.(Math.min(1, rms * 12));
          seg?.push(pcm, rms);
          if (!heard && performance.now() - started > noSpeechMs) void done(null);
        },
        (why) => {
          if (finished) return;
          finished = true;
          mic.stop();
          rejectFn(new Error(`Le micro ne répond pas (${why}). Réessayez.`));
        },
      );
      started = performance.now();
      seg = new Segmenter({
        sampleRate: mic.sampleRate,
        silenceMs: () => opts.silenceMs ?? s.silenceMs,
        maxMs: opts.maxMs ?? 30000,
        onSpeechStart: () => {
          heard = true;
          opts.onSpeechStart?.();
        },
        onPartial: (chunks) => {
          if (!opts.onInterim || interimBusy || whisper.slow) return;
          interimBusy = true;
          void whisper.transcribe(resampleTo16k(chunks, mic.sampleRate)).then((t) => {
            interimBusy = false;
            if (!finished) opts.onInterim?.(cleanWhisperText(t));
          });
        },
        onSegment: (chunks) => void done(chunks),
      });
    } catch (err) {
      mic.stop();
      finished = true;
      rejectFn(new Error(micErrorMessage(err)));
    }
  })();

  return {
    result,
    stop: () => {
      if (seg) seg.flush();
      else void done(null);
    },
    abort: () => {
      aborted = true;
      void done(null);
    },
  };
}

/* ------------------------------ Écoute continue ------------------------------ */

export type ContinuousState = 'loading' | 'listening' | 'hearing' | 'transcribing' | 'paused' | 'stopped';

export interface ContinuousEvents {
  onLevel?: (level: number) => void;
  onState?: (s: ContinuousState, detail?: string) => void;
  onInterim?: (text: string) => void;
  /** Énoncé terminé : texte reconnu + audio 16 kHz (pour l'analyse de prononciation). */
  onFinal?: (text: string, audio?: Float32Array) => void;
  onError?: (message: string) => void;
}

/**
 * Micro ouvert en permanence : chaque énoncé (fin détectée après un silence réglable)
 * est transcrit puis remis via onFinal. pause()/resume() pendant qu'Emma parle,
 * pour ne pas transcrire sa propre voix. Sur iPhone, pause() referme réellement le
 * micro (sinon iOS étouffe ou coupe la voix d'Emma) et resume() le rouvre.
 */
export class ContinuousListener {
  private mic: MicCapture | null = null;
  /** Ouverture du micro en cours. */
  private micOpening: Promise<void> | null = null;
  /** Génération du micro : toute fermeture invalide une ouverture en cours. */
  private micGen = 0;
  /** Micro refermé pendant les pauses (iPhone). */
  private readonly release = releaseMicWhileSpeaking();
  /** Moteur de reconnaissance prêt (Whisper chargé) : le micro peut s'ouvrir. */
  private ready = false;
  private noise: number | undefined;
  private seg: Segmenter | null = null;
  private rec: SR = null;
  private recTimer: number | undefined;
  private paused = false;
  private running = false;
  private interimBusy = false;
  /** Texte déjà validé de l'énoncé en cours (sessions de reconnaissance terminées). */
  private wsText = '';
  /** Texte de la session de reconnaissance en cours, reconstruit à chaque résultat. */
  private wsInterim = '';
  private wsLast = 0;
  private wsStart = 0;
  /** Audio récent (Web Speech ne fournit pas l'audio : on l'enregistre en parallèle). */
  private ring: { t: number; pcm: Float32Array }[] = [];
  private micRate = 48000;
  /** Session audio « enregistrement » tenue pour la reconnaissance du navigateur seule (iPhone). */
  private recSession = false;
  /** Démarrage de la reconnaissance en cours (journal : délai avant les premiers mots). */
  private recStartedAt = 0;
  /** Temps écoulé entre la fin de la reconnaissance précédente et le démarrage de celle-ci. */
  private recGap = Infinity;
  /** Réouvertures, pendant cette écoute, d'un micro resté sans son (Whisper). */
  private micRetries = 0;
  private quietTimer: number | undefined;
  /** Relances d'une écoute restée sourde (une seule par écoute). */
  private quietRestarts = 0;
  /**
   * Écoute suspendue parce que la page est masquée (autre appli, écran verrouillé), reprise au
   * retour : en arrière-plan, iOS coupe la capture (« audio-capture »), la reconnaissance rendait
   * des bribes tardives auxquelles Emma répondait, et iOS tuait la page pendant sa réponse.
   */
  private hiddenPause = false;
  private readonly onVisibility = () => {
    if (!this.running) return;
    if (document.hidden) {
      if (this.paused) return;
      this.hiddenPause = true;
      this.pauseNow('page masquée');
    } else if (this.hiddenPause) {
      this.hiddenPause = false;
      journal('page visible : reprise de l’écoute');
      this.resumeNow();
    }
  };
  private levelTimer: number | undefined;
  engine: 'webspeech' | 'whisper' = resolveSttEngine();

  constructor(private ev: ContinuousEvents) {}

  get active() {
    return this.running;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.engine = resolveSttEngine();
    document.addEventListener('visibilitychange', this.onVisibility);
    try {
      if (this.engine === 'whisper') await this.startWhisper();
      else await this.startWebSpeech();
    } catch (err) {
      // iPhone : Whisper n'a pas pu se charger (le micro, lui, n'est pas en cause) : la reconnaissance
      // du navigateur, qui entend au moins la première réponse.
      let error = err;
      if (this.running && this.engine === 'whisper' && whisper.status.status !== 'ready' && isIOS() && webSpeechSupported()) {
        journal(`Whisper indisponible (${String((err as Error)?.message ?? err).slice(0, 60)}) : reconnaissance du navigateur`);
        noticeListeners.forEach((l) => l(WHISPER_FAILED_MSG));
        this.engine = 'webspeech';
        try {
          await this.startWebSpeech();
          return;
        } catch (e2) {
          error = e2;
        }
      }
      this.stop();
      this.ev.onError?.(micErrorMessage(error));
    }
  }

  pause() {
    // Pause demandée (Emma parle…) : pas de reprise automatique au retour sur la page.
    this.hiddenPause = false;
    this.pauseNow();
  }

  private pauseNow(why?: string) {
    if (this.paused) return;
    this.paused = true;
    window.clearTimeout(this.quietTimer);
    journal(
      `écoute ${why ? `suspendue (${why})` : 'en pause'}${this.rec ? ' (reconnaissance du navigateur arrêtée)' : ''}${this.release ? ', micro refermé' : ''}`,
    );
    this.seg?.reset();
    this.wsText = '';
    this.wsInterim = '';
    this.ring = [];
    if (this.rec) lastRecEnd = performance.now();
    try {
      this.rec?.abort();
    } catch {
      /* ignore */
    }
    if (this.release) this.closeMic();
    this.ev.onLevel?.(0);
    if (this.running) this.ev.onState?.('paused');
  }

  resume() {
    if (!this.paused) return;
    if (this.running && document.hidden) {
      // Pas d'écoute en arrière-plan : elle reprendra au retour sur la page.
      if (!this.hiddenPause) journal('écoute reportée : page masquée');
      this.hiddenPause = true;
      return;
    }
    this.hiddenPause = false;
    this.resumeNow();
  }

  private resumeNow() {
    if (!this.paused) return;
    this.paused = false;
    this.quietRestarts = 0;
    this.micRetries = 0;
    if (!this.running) return;
    if (this.engine === 'webspeech') this.restartRec();
    if (this.release && this.ready && !this.mic && this.captureNeeded()) {
      // iPhone : le micro a été refermé pendant qu'Emma parlait ; « Je vous écoute » une fois rouvert.
      this.ev.onState?.('loading', 'ouverture du micro');
      this.ensureMic()
        .then(() => {
          if (this.running && !this.paused) this.ev.onState?.('listening');
        })
        .catch((err) => {
          this.stop();
          this.ev.onError?.(micErrorMessage(err));
        });
      return;
    }
    this.ev.onState?.('listening');
  }

  /** Capture du micro par la page en plus de la reconnaissance du navigateur (voir pageCapturesMic). */
  private captureNeeded(): boolean {
    return this.engine === 'whisper' || !isIOS();
  }

  /**
   * Micro tenu par la reconnaissance du navigateur seule (iPhone) : session audio
   * « play-and-record », gardée après l'écoute (voir device.ts).
   */
  private holdSession(on: boolean) {
    if (on === this.recSession) return;
    this.recSession = on;
    if (on) beginCaptureAudioSession();
    else endCaptureAudioSession();
  }

  /** Niveau affiché sans capture : une impulsion à chaque résultat de la reconnaissance. */
  private pulseLevel() {
    this.ev.onLevel?.(0.5);
    window.clearTimeout(this.levelTimer);
    this.levelTimer = window.setTimeout(() => this.ev.onLevel?.(0), 350);
  }

  /** Ouvre le micro s'il doit l'être (moteur prêt, pas en pause sur iPhone) et ne l'est pas déjà. */
  private ensureMic(): Promise<void> {
    if (this.micOpening) return this.micOpening;
    if (!this.running || !this.ready || this.mic || (this.paused && this.release)) return Promise.resolve();
    const gen = ++this.micGen;
    const mic = new MicCapture();
    const whisperMode = this.engine === 'whisper';
    const opening = mic
      .start(
        (pcm, rms) => {
          if (this.mic !== mic || !this.running || this.paused) return;
          this.ev.onLevel?.(Math.min(1, rms * 12));
          if (whisperMode) {
            this.seg?.push(pcm, rms);
          } else {
            const now = performance.now();
            this.ring.push({ t: now, pcm });
            while (this.ring.length && now - this.ring[0].t > 30000) this.ring.shift();
          }
        },
        (why) => this.micDead(mic, why),
      )
      .then(() => {
        // Refermé (pause, arrêt) pendant l'ouverture : on relâche aussitôt.
        if (gen !== this.micGen || !this.running || (this.paused && this.release)) {
          mic.stop();
          return;
        }
        this.mic = mic;
        if (whisperMode) this.seg = this.createSegmenter(mic);
        else this.micRate = mic.sampleRate;
      })
      .catch((err) => {
        mic.stop();
        throw err;
      })
      .finally(() => {
        if (this.micOpening === opening) this.micOpening = null;
      });
    this.micOpening = opening;
    return opening;
  }

  private closeMic() {
    this.micGen++;
    this.micOpening = null;
    if (this.seg) this.noise = this.seg.noiseLevel;
    this.mic?.stop();
    this.mic = null;
    this.seg = null;
    this.holdSession(false);
  }

  /**
   * Micro resté sans son (lecteur de capture bloqué, piste rendue muette ou coupée par iOS) : avec
   * Whisper, réouvert une fois pendant l'écoute, puis erreur (un toucher sur le micro le relance).
   * Avec la reconnaissance du navigateur, ce n'est que l'indicateur de niveau : il est abandonné.
   */
  private micDead(mic: MicCapture, why: string) {
    if (this.mic !== mic || !this.running) return;
    this.closeMic();
    if (this.engine !== 'whisper' || (this.paused && this.release)) return;
    if (this.micRetries++ < 1) {
      journal('micro : réouverture');
      this.ev.onState?.('loading', 'réouverture du micro');
      this.ensureMic()
        .then(() => {
          if (this.running && !this.paused) this.ev.onState?.('listening');
        })
        .catch((err) => {
          this.stop();
          this.ev.onError?.(micErrorMessage(err));
        });
      return;
    }
    this.stop();
    this.ev.onError?.(`Le micro ne répond pas (${why}). Touchez le micro pour réessayer.`);
  }

  /** Bascule durable sur Whisper : service du navigateur injoignable, ou reconnaissance sourde sur iPhone. */
  private switchToWhisper(msg: string) {
    const old = this.rec;
    this.rec = null;
    try {
      old?.abort();
    } catch {
      /* ignore */
    }
    window.clearInterval(this.recTimer);
    window.clearTimeout(this.quietTimer);
    this.closeMic();
    this.ready = false;
    fallbackToWhisper(msg);
    this.engine = 'whisper';
    void this.startWhisper().catch((err) => {
      this.stop();
      this.ev.onError?.(micErrorMessage(err));
    });
  }

  /** L'apprenant indique qu'il a fini sa phrase. */
  flush() {
    if (this.engine === 'whisper') this.seg?.flush();
    else this.emitWebSpeech();
  }

  stop() {
    this.running = false;
    this.ready = false;
    this.hiddenPause = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.clearInterval(this.recTimer);
    window.clearTimeout(this.levelTimer);
    window.clearTimeout(this.quietTimer);
    try {
      this.rec?.abort();
    } catch {
      /* ignore */
    }
    this.rec = null;
    this.closeMic();
    this.ev.onLevel?.(0);
    this.ev.onState?.('stopped');
  }

  /* ---------- Whisper ---------- */

  private async startWhisper() {
    if (whisper.status.status !== 'ready') {
      this.ev.onState?.('loading', whisper.status.detail);
      const un = whisper.subscribe(() => this.ev.onState?.('loading', whisper.status.detail));
      await whisper.load();
      un();
      const st = whisper.status as EngineStatus;
      if (st.status !== 'ready') throw new Error(st.detail || 'Whisper indisponible');
    }
    if (!this.running) return;
    this.ready = true;
    await this.ensureMic();
    this.ev.onState?.(this.paused ? 'paused' : 'listening');
  }

  private createSegmenter(mic: MicCapture): Segmenter {
    return new Segmenter({
      sampleRate: mic.sampleRate,
      noise: this.noise,
      silenceMs: () => getState().settings.silenceMs,
      onSpeechStart: () => {
        this.micRetries = 0;
        this.ev.onState?.('hearing');
      },
      onPartial: (chunks) => {
        if (this.interimBusy || whisper.slow) return;
        this.interimBusy = true;
        void whisper.transcribe(resampleTo16k(chunks, mic.sampleRate)).then((t) => {
          this.interimBusy = false;
          if (this.running && !this.paused) this.ev.onInterim?.(cleanWhisperText(t));
        });
      },
      onSegment: (chunks) => {
        this.ev.onState?.('transcribing');
        const audio = resampleTo16k(chunks, mic.sampleRate);
        const copy = audio.slice(); // l'original est transféré au worker Whisper
        void whisper.transcribe(audio).then((t) => {
          const text = cleanWhisperText(t);
          if (!this.running) return;
          if (text) this.ev.onFinal?.(text, copy);
          else if (!this.paused) this.ev.onState?.('listening');
        });
      },
    });
  }

  /* ---------- Web Speech ---------- */

  private async startWebSpeech() {
    // Micro « niveau » permanent (affiche que l'on est bien écouté), sauf iPhone (voir captureNeeded)
    this.ready = true;
    if (this.captureNeeded()) await this.ensureMic();
    else journal('reconnaissance du navigateur seule (pas de seconde capture du micro)');
    if (!this.running) return;
    this.recTimer = window.setInterval(() => {
      if (this.paused || !this.running) return;
      const text = mergeTranscript(this.wsText, this.wsInterim);
      if (text && performance.now() - this.wsLast > getState().settings.silenceMs) this.emitWebSpeech();
    }, 150);
    if (!this.paused) this.restartRec();
    this.ev.onState?.(this.paused ? 'paused' : 'listening');
  }

  private emitWebSpeech() {
    const text = mergeTranscript(this.wsText, this.wsInterim);
    this.wsText = '';
    this.wsInterim = '';
    const chunks = this.ring.filter((c) => c.t >= this.wsStart).map((c) => c.pcm);
    this.ring = [];
    const audio = chunks.length ? resampleTo16k(chunks, this.micRate) : undefined;
    if (text) {
      this.ev.onState?.('transcribing');
      journal(`reconnaissance du navigateur : phrase reconnue (${text.length} car.), arrêt`);
      // Repart sur une reconnaissance neuve pour ne pas recoller l'énoncé suivant
      try {
        this.rec?.abort();
      } catch {
        /* ignore */
      }
      this.ev.onFinal?.(text, audio);
    }
  }

  private restartRec() {
    if (!this.running || this.paused || this.engine !== 'webspeech') return;
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    try {
      this.rec?.abort();
    } catch {
      /* ignore */
    }
    const rec: SR = new Ctor();
    this.rec = rec;
    rec.lang = getState().settings.sttLang;
    rec.continuous = true;
    rec.interimResults = true;
    let heard = false;
    let audioOn = false;
    rec.onaudiostart = () => {
      audioOn = true;
      if (rec === this.rec) journal(`reconnaissance du navigateur : micro actif (${Math.round(performance.now() - this.recStartedAt)} ms)`);
    };
    // Écoute qui n'entend rien : noté au journal (silence ou micro muet ?), puis une relance avec
    // une reconnaissance neuve. Sur iOS, une reconnaissance relancée peu après la précédente reste
    // sourde sans aucune erreur (voir IOS_REC_COOLDOWN_MS) : bascule sur Whisper, qui capte lui-même.
    window.clearTimeout(this.quietTimer);
    const soon = isIOS() && performance.now() - lastRecEnd < IOS_REC_COOLDOWN_MS;
    const quietMs = soon ? IOS_DEAF_MS : QUIET_NOTE_MS;
    this.quietTimer = window.setTimeout(() => {
      if (rec !== this.rec || heard || !this.running || this.paused) return;
      if (soon && whisper.status.status !== 'error' && interruptedLoads('whisper').count < 2) {
        journal(
          `reconnaissance du navigateur : rien entendu en ${quietMs / 1000} s, relancée ${Math.round(this.recGap / 1000)} s après la précédente (iOS la laisse sourde) : passage à Whisper`,
        );
        this.switchToWhisper(IOS_DEAF_MSG);
        return;
      }
      const retry = this.quietRestarts < 1;
      journal(
        `reconnaissance du navigateur : rien entendu en ${quietMs / 1000} s (micro ${audioOn ? 'actif' : 'jamais signalé actif'})${retry ? ', relance' : ''}`,
      );
      if (!retry) return;
      this.quietRestarts++;
      this.restartRec();
    }, quietMs);
    rec.onresult = (e: any) => {
      if (this.paused || rec !== this.rec) return;
      if (!heard) {
        heard = true;
        this.quietRestarts = 0;
        journal(`reconnaissance du navigateur : premiers mots ${((performance.now() - this.recStartedAt) / 1000).toFixed(1).replace('.', ',')} s après le démarrage`);
      }
      // Début d'énoncé : les résultats arrivent avec ~1 s de retard sur la voix.
      if (!this.wsText && !this.wsInterim) this.wsStart = performance.now() - 1500;
      this.wsInterim = webSpeechText(e.results);
      this.wsLast = performance.now();
      if (!this.mic) this.pulseLevel();
      this.ev.onState?.('hearing');
      this.ev.onInterim?.(mergeTranscript(this.wsText, this.wsInterim));
    };
    rec.onerror = (e: any) => {
      if (rec !== this.rec) return;
      journal(`reconnaissance du navigateur : erreur « ${e.error ?? '?'} »`);
      if (e.error === 'network' || e.error === 'service-not-allowed' || e.error === 'language-not-supported') {
        // Service en ligne injoignable : bascule définitive sur Whisper, micro toujours ouvert.
        this.switchToWhisper(NETWORK_FALLBACK_MSG);
      } else if (e.error === 'not-allowed') {
        this.stop();
        this.ev.onError?.('Micro refusé : autorisez l’accès au microphone dans votre navigateur.');
      }
    };
    // Chrome arrête la reconnaissance après un moment : on la relance tant que le micro est actif.
    rec.onend = () => {
      lastRecEnd = performance.now();
      if (rec !== this.rec) return;
      journal('reconnaissance du navigateur : terminée');
      // Android arrête la reconnaissance après chaque phrase : on garde ce qui a été dit avant de relancer.
      this.wsText = mergeTranscript(this.wsText, this.wsInterim);
      this.wsInterim = '';
      if (this.running && !this.paused) window.setTimeout(() => this.restartRec(), 250);
    };
    const begin = () => {
      if (rec !== this.rec || !this.running || this.paused) return;
      // iOS : session audio « play-and-record » avant d'écouter, gardée ensuite (voir device.ts).
      if (!this.captureNeeded()) this.holdSession(true);
      try {
        this.recStartedAt = performance.now();
        this.recGap = this.recStartedAt - lastRecEnd;
        rec.start();
        const gap = isIOS() && this.recGap < IOS_REC_COOLDOWN_MS ? `, ${Math.round(this.recGap / 1000)} s après la précédente` : '';
        journal(`reconnaissance du navigateur : démarrée (${rec.lang}${gap})`);
      } catch (err) {
        journal(`reconnaissance du navigateur : démarrage refusé (${String(err).slice(0, 60)})`);
      }
    };
    // iOS : lecteur de la voix en pause pendant l'écoute (voir parkForCapture).
    if (!this.captureNeeded() && !this.recSession) void tts.parkForCapture().then(begin);
    else begin();
  }
}
