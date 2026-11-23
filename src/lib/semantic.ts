/* ------------------------------------------------------------------
 * Similarité sémantique question ↔ réponse (petit modèle local, Web Worker).
 * Les questions de tous les thèmes sont indexées en arrière-plan au début
 * de la conversation ; chaque réponse de l'apprenant est ensuite comparée
 * à la question posée et aux autres thèmes (≈ 20 ms par phrase).
 * Jamais pendant qu'Emma parle : le modèle se charge, et les questions
 * s'indexent, quand elle se tait (sur iPhone, charger un modèle pendant
 * qu'elle parle précédait les plantages de la page).
 * ------------------------------------------------------------------ */
import { heapNote, journal } from './journal';
import { openModelWorker, type ModelWorker } from './modelWorker';
import { ProgressTracker, tts, type EngineStatus } from './tts';

/** Silence d'Emma exigé avant de lancer le chargement du modèle. */
const QUIET_BEFORE_LOAD_MS = 1500;

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

class SemanticService {
  status: EngineStatus = { status: 'idle', progress: 0 };
  private worker: ModelWorker | null = null;
  private listeners = new Set<() => void>();
  private tracker = new ProgressTracker();
  private nextId = 1;
  private waiters = new Map<number, (v: Float32Array[] | null) => void>();
  private vectors = new Map<string, Float32Array>();
  private indexing = new Set<string>();
  /** Lots de questions à indexer, envoyés un à un quand Emma se tait. */
  private backlog: string[][] = [];
  private pumping = false;
  /** Chargement demandé, en attente qu'Emma se taise. */
  private loadWaiting = false;

  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  get ready() {
    return this.status.status === 'ready';
  }

  /**
   * Charge le modèle (≈ 23 Mo, une seule fois) et indexe ces phrases, les premières d'abord. Si Emma
   * parle, le chargement attend qu'elle se taise (depuis QUIET_BEFORE_LOAD_MS) ; sinon il part tout de suite.
   */
  load(texts: string[] = []) {
    if (!this.worker && !this.loadWaiting && this.status.status !== 'error') {
      this.loadWaiting = true;
      const speaking = tts.isSpeaking;
      if (speaking) journal('compréhension : chargement reporté (Emma parle)');
      this.whenQuiet(speaking ? QUIET_BEFORE_LOAD_MS : 0, () => {
        this.loadWaiting = false;
        if (this.worker || this.status.status === 'error') return;
        this.status = { status: 'loading', progress: 0, detail: 'Préparation de la compréhension…' };
        this.emit();
        journal('compréhension : chargement');
        this.worker = openModelWorker('embed');
        this.worker.onmessage = (e) => this.onWorker(e.data);
        this.worker.onerror = (e) => this.fail(e.message || 'Erreur du worker');
        this.worker.postMessage({ type: 'load' });
        this.pumpIndex();
      });
    }
    this.index(texts);
  }

  /** Lance `run` quand Emma ne parle pas (et s'est tue depuis `graceMs`). */
  private whenQuiet(graceMs: number, run: () => void) {
    const attempt = () => {
      if (tts.isSpeaking) {
        const un = tts.subscribe(() => {
          if (tts.isSpeaking) return;
          un();
          attempt();
        });
        return;
      }
      if (graceMs <= 0) run();
      else window.setTimeout(() => (tts.isSpeaking ? attempt() : run()), graceMs);
    };
    attempt();
  }

  private fail(detail: string) {
    journal(`compréhension : erreur (${detail.slice(0, 80)})`);
    this.backlog.forEach((b) => b.forEach((t) => this.indexing.delete(t)));
    this.backlog = [];
    this.status = { status: 'error', progress: 0, detail };
    this.waiters.forEach((w) => w(null));
    this.waiters.clear();
    this.worker?.terminate();
    this.worker = null;
    this.emit();
  }

  private onWorker(m: any) {
    if (m.type === 'progress') {
      const p = this.tracker.update(m.p ?? {});
      this.status = { status: 'loading', progress: p, detail: 'Préparation de la compréhension…' };
      this.emit();
    } else if (m.type === 'ready') {
      journal(`compréhension prête${heapNote(m.heap)}`);
      this.status = { status: 'ready', progress: 1, detail: 'Compréhension prête (locale)' };
      this.emit();
    } else if (m.type === 'error') {
      this.fail(m.error);
    } else if (m.type === 'embedded') {
      this.waiters.get(m.id)?.(m.vecs);
      this.waiters.delete(m.id);
    }
  }

  private request(texts: string[], priority: boolean): Promise<Float32Array[] | null> {
    if (!this.worker) return Promise.resolve(null);
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.waiters.set(id, resolve);
      this.worker!.postMessage({ type: 'embed', id, texts, priority });
    });
  }

  /** Indexe des phrases en arrière-plan (par petits lots, sans bloquer les réponses ni la voix). */
  index(texts: string[]) {
    const todo = [...new Set(texts)].filter((t) => t && !this.vectors.has(t) && !this.indexing.has(t));
    for (let i = 0; i < todo.length; i += 8) {
      const batch = todo.slice(i, i + 8);
      batch.forEach((t) => this.indexing.add(t));
      this.backlog.push(batch);
    }
    this.pumpIndex();
  }

  /** Envoie le lot suivant quand Emma se tait, un lot à la fois. */
  private pumpIndex() {
    if (this.pumping || !this.worker || !this.backlog.length) return;
    this.pumping = true;
    this.whenQuiet(0, () => {
      const batch = this.backlog.shift();
      if (!batch || !this.worker) {
        this.pumping = false;
        return;
      }
      void this.request(batch, false).then((vecs) => {
        batch.forEach((t, k) => {
          this.indexing.delete(t);
          if (vecs?.[k]) this.vectors.set(t, vecs[k]);
        });
        this.pumping = false;
        this.pumpIndex();
      });
    });
  }

  vector(text: string): Float32Array | undefined {
    return this.vectors.get(text);
  }

  /**
   * Plongements de ces phrases (prioritaires), ou null si le modèle n'est pas prêt à temps :
   * Emma ne fait jamais attendre l'apprenant pour ça.
   */
  async embed(texts: string[], timeoutMs = 2500): Promise<Float32Array[] | null> {
    if (!this.ready) return null;
    const missing = texts.filter((t) => !this.vectors.has(t));
    let vecs: Float32Array[] | null = [];
    if (missing.length) {
      vecs = await Promise.race([
        this.request(missing, true),
        new Promise<null>((r) => window.setTimeout(() => r(null), timeoutMs)),
      ]);
      if (!vecs) return null;
    }
    const got = new Map(missing.map((t, i) => [t, vecs![i]]));
    return texts.map((t) => this.vectors.get(t) ?? got.get(t)!);
  }
}

export const semantic = new SemanticService();
