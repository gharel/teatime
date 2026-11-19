/* Service d'analyse de prononciation (Web Worker) : chargement à la demande, file d'analyses. */
import type { PronResult } from './pronunciation';
import { beginLoad, endLoad } from './device';
import { ProgressTracker, type EngineStatus } from './tts';

class PronService {
  status: EngineStatus = { status: 'idle', progress: 0 };
  private worker: Worker | null = null;
  private listeners = new Set<() => void>();
  private tracker = new ProgressTracker();
  private nextId = 1;
  private waiters = new Map<number, (r: PronResult | null) => void>();

  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** Démarre le téléchargement / chargement (≈ 320 Mo la première fois, puis en cache). */
  load() {
    if (this.worker) return;
    this.status = { status: 'loading', progress: 0, detail: 'Préparation de l’analyse de prononciation…' };
    this.emit();
    beginLoad('pron');
    this.worker = new Worker(new URL('../workers/pron.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        const p = this.tracker.update(m.p ?? {});
        const mb = this.tracker.totalMB();
        this.status = {
          status: 'loading',
          progress: mb < 5 ? 0 : p,
          detail: mb < 5 ? 'Préparation de l’analyse de prononciation…' : p >= 0.999 ? 'Initialisation…' : `Analyse de prononciation : ${Math.round(p * 100)} % (${mb.toFixed(0)} Mo)`,
        };
        this.emit();
      } else if (m.type === 'ready') {
        endLoad('pron');
        this.status = { status: 'ready', progress: 1, detail: 'Analyse de prononciation prête (locale)' };
        this.emit();
      } else if (m.type === 'error') {
        endLoad('pron');
        this.status = { status: 'error', progress: 0, detail: m.error };
        this.waiters.forEach((w) => w(null));
        this.waiters.clear();
        this.emit();
      } else if (m.type === 'result') {
        this.waiters.get(m.id)?.(m.result);
        this.waiters.delete(m.id);
      }
    };
    this.worker.onerror = (e) => {
      endLoad('pron');
      this.status = { status: 'error', progress: 0, detail: e.message || 'Erreur du worker' };
      this.emit();
    };
    this.worker.postMessage({ type: 'load' });
  }

  /** Analyse un énoncé (audio 16 kHz + texte reconnu). Résout null en cas d'échec. */
  analyze(audio: Float32Array, text: string): Promise<PronResult | null> {
    if (this.status.status === 'error') return Promise.resolve(null);
    this.load();
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.waiters.set(id, resolve);
      this.worker!.postMessage({ type: 'analyze', id, audio, text }, [audio.buffer]);
    });
  }
}

export const pron = new PronService();
