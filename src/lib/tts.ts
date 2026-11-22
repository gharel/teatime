/* ------------------------------------------------------------------
 * Synthèse vocale unifiée :
 *  - Voix neuronale locale (Web Worker), jouée par Web Audio — phonèmes
 *    fournis => synchro labiale précise + enveloppe audio réelle :
 *      · Kokoro-82M, très naturelle, si l'appareil la calcule assez vite ;
 *      · Piper, légère, sinon (téléphones) ;
 *  - Repli : speechSynthesis du système (instantané, sans téléchargement).
 *    Sur iPhone elle est muette en mode silencieux et se bat avec le micro :
 *    on ne s'en sert qu'en dernier recours.
 * ------------------------------------------------------------------ */
import {
  beginLoad,
  captureActive,
  captureEndCount,
  constrainedDevice,
  debugFlag,
  endLoad,
  interruptedLoads,
  isIOS,
  msSinceCaptureEnd,
  releaseMicWhileSpeaking,
  setPlaybackAudioSession,
} from './device';
import { friendlyLoadError } from './download';
import { openModelWorker, type ModelWorker } from './modelWorker';
import { autoReload } from './recover';
import { heapNote, journal } from './journal';
import { estimateSpeechMs, ipaToVisemes, lipsync, textToVisemes } from './lipsync';
import { PIPER_CACHE, PIPER_VOICE } from './piper';
import { getState } from './store';

export type NeuralModel = 'kokoro' | 'piper';

/**
 * Après la fermeture du micro, iOS garde encore quelques centaines de millisecondes la
 * session d'appel (« play-and-record ») : une voix lancée trop tôt part dans l'écouteur.
 */
const AFTER_CAPTURE_MS = 450;

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

/* ------------------------- Vitesse de la voix neuronale -------------------------
 * rtf = temps de calcul / durée de la voix. Au-delà de 1, la voix se calcule plus lentement
 * qu'elle ne se parle : sur un iPhone 12 mini (processeur, 1 thread), ≈ 2,7 — Emma mettrait
 * 10 à 25 s à commencer sa réponse. La voix du système, instantanée, prend alors le relais.
 * Seuils avec de la marge (la mesure varie avec la charge) : un PC sans GPU tourne autour de 1
 * et garde la voix neuronale ; sur téléphone, la mémoire qu'elle libère sert aussi à Whisper.
 * La mesure est gardée par appareil de calcul pour ne pas recharger la voix pour rien.
 */
function slowRtf(): number {
  return constrainedDevice() ? 1.5 : 2.5;
}
/**
 * Piper n'est abandonnée (pour la voix du système) que si elle est vraiment très lente : sur
 * iPhone la voix du système est muette en mode silencieux, mieux vaut un peu d'attente.
 */
function piperMaxRtf(): number {
  return slowRtf() * 2;
}
const SPEED_KEY = 'teatime:kokoro-speed';

/** Vitesses mesurées : Kokoro par appareil de calcul (« wasm », « webgpu ») et « piper ». */
function readSpeed(): Partial<Record<'wasm' | 'webgpu' | 'piper', number>> {
  try {
    return JSON.parse(localStorage.getItem(SPEED_KEY) || '{}') ?? {};
  } catch {
    return {};
  }
}

function writeSpeed(key: 'wasm' | 'webgpu' | 'piper', rtf: number) {
  try {
    localStorage.setItem(SPEED_KEY, JSON.stringify({ ...readSpeed(), [key]: Math.round(rtf * 100) / 100 }));
  } catch {
    /* navigation privée */
  }
}

function fmtRtf(rtf: number): string {
  return rtf.toFixed(1).replace('.', ',');
}

function slowDetail(rtf: number): string {
  return `Voix neuronale trop lente sur cet appareil (${fmtRtf(rtf)} s de calcul par seconde de voix) : voix du système, instantanée`;
}

/**
 * Kokoro sur le processeur d'un téléphone sans multi-thread (page non isolée : iPhone, iPad)
 * se calcule 2 à 3× plus lentement qu'elle ne se parle : inutile de télécharger ses 90 Mo pour
 * le constater, la voix légère est choisie d'emblée.
 */
function kokoroPredictedSlow(device: 'wasm' | 'webgpu'): boolean {
  return device === 'wasm' && constrainedDevice() && typeof self !== 'undefined' && !self.crossOriginIsolated;
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
  /** Voix neuronale (Kokoro ou Piper selon l'appareil). */
  neural: EngineStatus = { status: 'idle', progress: 0 };
  /** Modèle chargé (ou en cours de chargement) dans le worker. */
  neuralModel: NeuralModel | null = null;
  private listeners = new Set<Listener>();
  /** Fermetures du micro déjà prises en compte par le contexte audio (iOS). */
  private seenCaptureEnds = 0;
  private worker: ModelWorker | null = null;
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
  /** Vitesse mesurée de Kokoro (temps de calcul / durée de la voix), si connue. */
  kokoroRtf: number | null = null;
  /** Vitesse mesurée de Piper, si connue. */
  piperRtf: number | null = null;
  /** Threads de calcul du worker de voix. */
  neuralThreads: number | null = null;
  private tracker = new ProgressTracker();
  private systemVoices: SpeechSynthesisVoice[] = [];
  private speakingCount = 0;
  private speechPrimed = false;
  /** Chargement demandé par l'apprenant (bouton) : pas de rechargement automatique en cas d'échec. */
  private manualLoad = false;
  /** Pause puis reprise du lecteur en cours (iOS, après fermeture du micro). */
  private relaunching = false;
  /** Surveillance d'un chargement qui ne progresse plus. */
  private watched: EngineStatus | null = null;
  private stallTimer: number | undefined;

  constructor() {
    if (typeof window === 'undefined') return;
    if ('speechSynthesis' in window) {
      const refresh = () => {
        this.systemVoices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
        this.emit();
      };
      refresh();
      speechSynthesis.addEventListener?.('voiceschanged', refresh);
    }
    // iOS n'autorise le son qu'à la suite d'un geste, et suspend (« interrupted ») le contexte audio
    // quand le micro s'ouvre, après un appel, Siri… : chaque toucher relance ce qui doit l'être.
    const onGesture = () => {
      this.primeSystemSpeech();
      if (this.audioCtx && this.audioCtx.state !== 'running') {
        setPlaybackAudioSession();
        void this.audioCtx.resume().catch(() => undefined);
      }
    };
    for (const type of ['touchend', 'click', 'keydown']) window.addEventListener(type, onGesture, { capture: true, passive: true });
  }

  /**
   * iOS bloque speechSynthesis tant qu'une première phrase n'a pas été lue pendant un geste de
   * l'utilisateur ; or Emma parle souvent en réponse à un événement asynchrone. On lit donc une
   * phrase muette au premier toucher.
   */
  private primeSystemSpeech() {
    if (this.speechPrimed || !isIOS() || !('speechSynthesis' in window)) return;
    // Pas d'amorçage si Emma parle par Web Audio : sur iOS 27, une phrase de la voix du système
    // (même muette) interrompt la session audio de la page (bug WebKit 218815).
    if (this.currentVoice() !== 'system') return;
    this.speechPrimed = true;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {
      /* sans gravité */
    }
  }

  /** Note un événement audio (journal persistant, voir journal.ts). */
  note(event: string) {
    journal(event);
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    if (this.neural !== this.watched) {
      this.watched = this.neural;
      this.watchStall();
    }
    this.listeners.forEach((l) => l());
  }

  /**
   * Chargement bloqué (aucun progrès pendant 90 s : connexion figée, worker muet) : erreur, puis
   * rechargement automatique de la page (une fois), qui suffit en général.
   */
  private watchStall() {
    if (typeof window === 'undefined') return;
    window.clearTimeout(this.stallTimer);
    if (this.neural.status !== 'loading') return;
    const st = this.neural;
    this.stallTimer = window.setTimeout(() => {
      if (this.neural !== st) return;
      this.loadFailed('le chargement de la voix ne progresse plus. Touchez « Réessayer »', 'chargement bloqué depuis 90 s');
    }, 90_000);
  }

  /** Échec du chargement de la voix : erreur affichée, worker libéré, page rechargée une fois. */
  private loadFailed(detail: string, why: string) {
    if (this.neural.status === 'loading' && this.neuralModel) endLoad(this.neuralModel);
    this.worker?.terminate();
    this.worker = null;
    this.neural = { status: 'error', progress: 0, detail };
    this.note(`voix : ${why.slice(0, 90)}`);
    this.emit();
    if (!this.manualLoad && autoReload(`voix : ${why.slice(0, 90)}`)) this.note('rechargement automatique de la page');
  }

  get isSpeaking() {
    return this.speakingCount > 0;
  }

  /** Kokoro se calcule plus lentement qu'elle ne se parle sur cet appareil. */
  get kokoroTooSlow(): boolean {
    return this.kokoroRtf !== null && this.kokoroRtf > slowRtf();
  }

  /** La voix neuronale est chargée et assez rapide (ou gardée malgré sa lenteur). */
  neuralUsable(): boolean {
    if (this.neural.status !== 'ready' || !this.worker) return false;
    if (this.neuralModel === 'piper') return true;
    return !this.kokoroTooSlow || getState().settings.kokoroEvenIfSlow;
  }

  /** Voix qu'Emma utilisera pour la prochaine phrase. */
  currentVoice(): 'kokoro' | 'piper' | 'system' {
    if (getState().settings.ttsEngine !== 'system' && this.neuralUsable()) return this.neuralModel ?? 'system';
    return 'system';
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
      (/premium|enhanced|améliorée|amelioree/i.test(v.name) ? 8 : 0) +
      (/(aria|jenny|sonia|libby|emma|ava|samantha|serena|female)/i.test(v.name) ? 3 : 0) +
      (v.lang === 'en-US' || v.lang === 'en-GB' ? 2 : 0) +
      (v.localService ? 1 : 0);
    return vs.slice().sort((a, b) => score(b) - score(a))[0];
  }

  /**
   * À appeler de préférence suite à un geste utilisateur (politique d'autoplay). Renvoie null si
   * Web Audio est indisponible : la voix du système prend alors le relais.
   */
  unlockAudio(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    // iOS : catégorie « playback », sinon le mode silencieux coupe la voix d'Emma.
    setPlaybackAudioSession();
    this.primeSystemSpeech();
    if (!this.audioCtx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        const ctx = new Ctor();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.connect(ctx.destination);
        this.audioCtx = ctx;
        this.analyser = analyser;
        this.note(`lecteur audio créé (${ctx.state}, ${ctx.sampleRate} Hz)`);
        ctx.onstatechange = () => this.note(`lecteur audio : ${ctx.state}`);
      } catch (err) {
        this.note(`lecteur audio : création impossible (${String(err).slice(0, 60)})`);
        return null;
      }
    }
    const ctx = this.audioCtx;
    // Relance en cours (pause puis reprise) : on la laisse finir, sans reprise concurrente.
    if (this.relaunching) return ctx;
    // « suspended » (autoplay) ou « interrupted » (iOS : micro ouvert, appel, Siri…).
    if (ctx.state !== 'running') {
      this.note(`lecteur audio : reprise demandée (${ctx.state})`);
      void ctx.resume().catch((err) => this.note(`lecteur audio : reprise refusée (${String(err).slice(0, 60)})`));
    } else if (isIOS() && this.seenCaptureEnds !== captureEndCount() && !captureActive()) {
      // iOS : un contexte qui jouait pendant que le micro était ouvert garde parfois la sortie
      // « appel » (écouteur du haut, volume faible) après sa fermeture ; une suspension suivie
      // d'une reprise le recale sur le haut-parleur (bug WebKit 218012).
      this.seenCaptureEnds = captureEndCount();
      if (debugFlag('noContextRelaunch')) {
        this.note('lecteur audio : relance après le micro sautée (option de dépannage)');
      } else {
        this.note('lecteur audio : pause + reprise après fermeture du micro');
        this.relaunching = true;
        // Filet : une pause jamais confirmée (iOS « interrupted ») ne doit pas bloquer les reprises.
        window.setTimeout(() => (this.relaunching = false), 1500);
        void ctx
          .suspend()
          .then(() => ctx.resume())
          .then(() => this.note('lecteur audio : reprise faite'))
          .catch((err) => this.note(`lecteur audio : relance en échec (${String(err).slice(0, 60)})`))
          .finally(() => (this.relaunching = false));
      }
    }
    return ctx;
  }

  /** La voix neuronale qui serait chargée ici a-t-elle déjà été téléchargée (Cache Storage) ? */
  async neuralCached(): Promise<boolean> {
    try {
      if (!('caches' in self)) return false;
      const { model, device } = await this.pickModel();
      if (model === 'piper') return !!(await (await caches.open(PIPER_CACHE)).match(PIPER_VOICE.model));
      const file = device === 'webgpu' ? /onnx\/model\.onnx/ : /onnx\/model_quantized\.onnx/;
      const c = await caches.open('transformers-cache');
      const keys = await c.keys();
      return keys.some((k) => /Kokoro-82M/i.test(k.url) && file.test(k.url));
    } catch {
      return false;
    }
  }

  /**
   * Modèle à charger : Kokoro si l'appareil la calcule assez vite (mesure gardée, ou prédiction
   * pour les téléphones sans multi-thread), sinon Piper. Réglage « piper » : Piper d'office.
   */
  async pickModel(): Promise<{ model: NeuralModel; device: 'wasm' | 'webgpu' }> {
    const s = getState().settings;
    if (s.ttsEngine === 'piper') return { model: 'piper', device: 'wasm' };
    const device = await this.resolveDevice();
    if (s.kokoroEvenIfSlow) return { model: 'kokoro', device };
    const known = readSpeed()[device];
    const slow = known !== undefined ? known > slowRtf() : kokoroPredictedSlow(device);
    return slow ? { model: 'piper', device: 'wasm' } : { model: 'kokoro', device };
  }

  /** Appareil à utiliser pour Kokoro selon le réglage, l'appareil et les plantages précédents. */
  async resolveDevice(): Promise<'wasm' | 'webgpu'> {
    const pref = getState().settings.kokoroDevice;
    if (pref === 'wasm' || pref === 'webgpu') return pref;
    // Téléphone : la voix GPU (fp32, ≈ 320 Mo) ne tient pas en mémoire à côté du reste ; l'onglet
    // plante et la page se recharge en boucle. Le processeur (8 bits, ≈ 90 Mo) est sûr.
    if (constrainedDevice()) return 'wasm';
    // Le dernier chargement GPU n'est jamais arrivé au bout (onglet planté ?) : processeur.
    if (interruptedLoads('kokoro').device === 'webgpu') return 'wasm';
    return (await webgpuAvailable()) ? 'webgpu' : 'wasm';
  }

  /**
   * Lance (une seule fois) le téléchargement/chargement de la voix neuronale. Les chargements
   * automatiques s'arrêtent après deux interruptions (plantage probable) ; `manual` force un essai.
   */
  loadNeural({ manual = false }: { manual?: boolean } = {}) {
    if (this.neural.status === 'loading' || this.neural.status === 'ready') return;
    this.manualLoad = manual;
    this.neural = { status: 'loading', progress: 0, detail: 'Préparation de la voix neuronale…' };
    this.emit();
    void this.pickModel().then(({ model, device }) => {
      if (!manual && interruptedLoads(model).count >= 2) {
        this.neural = {
          status: 'error',
          progress: 0,
          detail: 'le chargement de la voix a été interrompu plusieurs fois (mémoire insuffisante ?). Touchez « Réessayer »',
        };
        this.emit();
        return;
      }
      if (model === 'piper') {
        const known = readSpeed()[device];
        if (known !== undefined && known > slowRtf()) this.kokoroRtf = known;
      }
      this.startWorker(model, device);
    });
  }

  /** Recharge la voix neuronale (changement de réglage : Kokoro, Piper…). */
  reloadNeural() {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    if (this.neural.status === 'loading' && this.neuralModel) endLoad(this.neuralModel);
    this.neuralModel = null;
    this.neural = { status: 'idle', progress: 0 };
    this.emit();
    if (getState().settings.ttsEngine !== 'system') this.loadNeural({ manual: true });
  }

  private startWorker(model: NeuralModel, device: 'wasm' | 'webgpu') {
    this.worker?.terminate();
    this.neuralModel = model;
    this.tracker = new ProgressTracker();
    beginLoad(model, device);
    // Sur GPU la génération est 3 à 5× plus rapide que la parole ; sur CPU elle peut être plus lente.
    this.rtf = model === 'piper' ? 0.5 : device === 'webgpu' ? 0.3 : 1;
    this.worker = openModelWorker('tts');
    this.worker.onmessage = (e: MessageEvent) => this.onWorker(e.data);
    this.worker.onerror = (e) => {
      endLoad(model);
      this.loadFailed(friendlyLoadError(e.message || 'Erreur du worker'), `erreur du worker : ${e.message || '?'}`);
    };
    this.worker.postMessage({ type: 'load', engine: model, device });
  }

  private onWorker(msg: any) {
    switch (msg.type) {
      case 'progress': {
        const p = this.tracker.update(msg.p ?? {});
        const mb = this.tracker.totalMB();
        const name = this.neuralModel === 'piper' ? 'Voix neuronale légère' : 'Voix neuronale';
        this.neural =
          mb < 5
            ? { status: 'loading', progress: 0, detail: `Préparation de la ${name.toLowerCase()}…` }
            : { status: 'loading', progress: p, detail: p >= 0.999 ? 'Initialisation de la voix…' : `${name} : ${Math.round(p * 100)} % (${mb.toFixed(0)} Mo)` };
        this.emit();
        break;
      }
      case 'ready': {
        const model: NeuralModel = msg.engine === 'piper' ? 'piper' : 'kokoro';
        endLoad(model);
        this.neuralThreads = typeof msg.threads === 'number' ? msg.threads : null;
        const rtf = typeof msg.rtf === 'number' && Number.isFinite(msg.rtf) ? (msg.rtf as number) : null;
        if (rtf !== null) this.rtf = rtf;
        const s = getState().settings;
        if (model === 'kokoro') {
          this.kokoroDevice = msg.device ?? null;
          if (rtf !== null) {
            this.kokoroRtf = rtf;
            if (this.kokoroDevice) writeSpeed(this.kokoroDevice, rtf);
          }
          if (this.kokoroTooSlow && !s.kokoroEvenIfSlow) {
            // Trop lente pour converser : on libère sa mémoire, la voix légère prend le relais.
            this.note(`Kokoro trop lente (${fmtRtf(this.kokoroRtf!)}) : voix légère Piper`);
            this.neural = { status: 'loading', progress: 0, detail: 'Kokoro est trop lente ici : préparation de la voix légère…' };
            this.startWorker('piper', 'wasm');
            this.emit();
            return;
          }
          this.neural = { status: 'ready', progress: 1, detail: msg.device === 'webgpu' ? 'Voix neuronale prête (GPU)' : 'Voix neuronale prête (processeur)' };
        } else {
          if (rtf !== null) {
            this.piperRtf = rtf;
            writeSpeed('piper', rtf);
          }
          if (rtf !== null && rtf > piperMaxRtf() && s.ttsEngine !== 'piper') {
            this.worker?.terminate();
            this.worker = null;
            this.neural = { status: 'unsupported', progress: 0, detail: slowDetail(rtf) };
            this.note(`Piper trop lente (${fmtRtf(rtf)}) : voix du système`);
            this.emit();
            return;
          }
          this.neural = { status: 'ready', progress: 1, detail: 'Voix neuronale légère prête' };
        }
        this.note(`voix ${model} prête${rtf !== null ? ` (vitesse ${fmtRtf(rtf)})` : ''}${heapNote(msg.heap)}`);
        this.emit();
        break;
      }
      case 'error':
        endLoad(this.neuralModel ?? 'kokoro');
        // Worker neuf au prochain essai (celui-ci peut être dans un état incohérent).
        this.loadFailed(friendlyLoadError(msg.error), `erreur de chargement : ${String(msg.error)}`);
        break;
      case 'speak-error':
        this.note(`erreur de synthèse : ${String(msg.error).slice(0, 80)}`);
        break;
      case 'chunk':
        this.onChunk(msg.id, msg.audio, msg.sampleRate, msg.phonemes, msg.chars ?? 0, msg.genMs ?? 0, msg.heap);
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

  private onChunk(id: number, audio: Float32Array, sampleRate: number, phonemes: string, chars: number, genMs: number, heap?: number) {
    const p = this.pending.get(id);
    if (!p || !this.audioCtx) return;
    const durMs = (audio.length / sampleRate) * 1000;
    this.note(`voix : phrase calculée en ${Math.round(genMs)} ms (${(durMs / 1000).toFixed(1).replace('.', ',')} s d’audio)${heapNote(heap)}`);
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
    // iPhone : micro tout juste refermé, on laisse iOS revenir sur le haut-parleur.
    const afterCapture = releaseMicWhileSpeaking() ? Math.max(0, AFTER_CAPTURE_MS - msSinceCaptureEnd()) / 1000 : 0;
    const startAt = Math.max(ctx.currentTime + 0.03, ctx.currentTime + afterCapture, this.playHead);
    if (!p.sources.length) {
      this.note(
        `voix ${this.neuralModel ?? '?'} : phrase de ${(buf.duration).toFixed(1).replace('.', ',')} s, contexte ${ctx.state}, sortie ${ctx.sampleRate} Hz${
          captureActive() ? ', micro ouvert' : ''
        }`,
      );
    }
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
      if (p.sources.length) this.note('voix : fin de lecture');
      this.pending.delete(id);
      this.speakingCount = Math.max(0, this.speakingCount - 1);
      p.resolve();
      this.emit();
    }
  }

  /** Lecteur audio de la voix, que les effets sonores partagent (iPhone : un seul lecteur audio). */
  outputContext(): AudioContext | null {
    return this.unlockAudio();
  }

  /** Lit un texte. Les appels successifs sont mis en file (lecture en flux). */
  speak(text: string, rate = getState().settings.speechRate): Promise<void> {
    const clean = cleanForSpeech(text);
    if (!clean) return Promise.resolve();
    const s = getState().settings;
    const useNeural = s.ttsEngine !== 'system' && this.neuralUsable() && !!this.unlockAudio();
    this.note(`voix : phrase demandée (${clean.length} car., ${useNeural ? this.neuralModel : 'voix du système'})`);
    this.speakingCount++;
    this.emit();
    if (useNeural) {
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

  private async speakSystem(text: string, rate: number): Promise<void> {
    if (!('speechSynthesis' in window)) {
      this.note('voix du système absente de ce navigateur');
      return;
    }
    // iPhone : micro tout juste refermé, on laisse iOS quitter la session d'appel.
    const wait = releaseMicWhileSpeaking() ? AFTER_CAPTURE_MS - msSinceCaptureEnd() : 0;
    if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
    setPlaybackAudioSession();
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
      let started = false;
      let guard = window.setTimeout(() => {
        if (!started) this.note('voix du système : aucun son (lecture jamais démarrée)');
        finish();
      }, est * 2.5 + 3000);
      u.onstart = () => {
        started = true;
        this.note(`voix du système : lecture (${u.voice?.name ?? u.lang})${captureActive() ? ', micro ouvert' : ''}`);
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
      u.onerror = (e) => {
        this.note(`voix du système : erreur « ${(e as SpeechSynthesisErrorEvent).error ?? '?'} »`);
        window.clearTimeout(guard);
        finish();
      };
      speechSynthesis.speak(u);
    });
  }

  /** État audio lisible (réglages → diagnostic). */
  /** État de la voix et du lecteur audio (diagnostic, voir diagnostics.ts). */
  diagnostics(): { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }[] {
    const ctx = this.audioCtx;
    const voice = this.currentVoice();
    const voiceLabel =
      voice === 'kokoro'
        ? `Kokoro (${this.kokoroDevice === 'webgpu' ? 'GPU' : 'processeur'})`
        : voice === 'piper'
          ? 'Piper (voix légère)'
          : `voix du système${this.neural.status === 'loading' ? ' (voix neuronale en chargement)' : ''}`;
    const rtf = voice === 'piper' ? this.piperRtf : voice === 'kokoro' ? this.kokoroRtf : null;
    const n = this.neural;
    return [
      {
        label: 'Voix utilisée',
        value: voiceLabel + (rtf !== null ? ` · ${fmtRtf(rtf)} s de calcul par s de voix` : ''),
        tone: voice === 'system' && isIOS() ? 'warn' : 'ok',
      },
      {
        label: 'Voix neuronale',
        value: `${{ idle: 'pas chargée', loading: 'chargement', ready: 'prête', error: 'erreur', unsupported: 'trop lente ici' }[n.status] ?? n.status}${n.detail ? ` · ${n.detail}` : ''}`,
        tone: n.status === 'ready' ? 'ok' : n.status === 'loading' || n.status === 'idle' ? 'warn' : 'bad',
      },
      {
        label: 'Lecteur audio',
        value: ctx ? `${ctx.state} · ${ctx.sampleRate} Hz` : 'pas encore créé (touchez « Tester la voix »)',
        tone: !ctx ? undefined : ctx.state === 'running' ? 'ok' : 'warn',
      },
      { label: 'Threads de la voix', value: `${this.neuralThreads ?? '?'}` },
    ];
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
