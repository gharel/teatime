/* ------------------------------------------------------------------
 * Journal des événements audio et des modèles (diagnostic).
 *
 * Gardé dans localStorage à chaque événement : quand iOS tue l'onglet,
 * les dernières lignes avant le plantage restent lisibles au lancement
 * suivant (Réglages → Diagnostic audio, bouton « Copier »).
 * ------------------------------------------------------------------ */
import { crashOnStartup } from './recover';

export interface JournalEntry {
  t: number;
  e: string;
}

const KEY = 'teatime:journal';
/** Assez pour plusieurs tours de conversation (≈ 25 lignes par tour sur iPhone). */
const MAX = 200;

function load(): JournalEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.t === 'number' && typeof x.e === 'string') : [];
  } catch {
    return [];
  }
}

let entries: JournalEntry[] = typeof localStorage === 'undefined' ? [] : load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* navigation privée ou quota : journal en mémoire seulement */
  }
}

/** Note un événement (horodaté à la milliseconde). */
export function journal(e: string) {
  entries.push({ t: Date.now(), e });
  if (entries.length > MAX) entries = entries.slice(-MAX);
  persist();
  listeners.forEach((l) => l());
}

export function journalEntries(): readonly JournalEntry[] {
  return entries;
}

/** « · mémoire du moteur 512 Mo » (tas WASM du worker de modèles, voir workers/wasmHeap.ts). */
export function heapNote(mb: unknown): string {
  return typeof mb === 'number' && mb > 0 ? ` · mémoire du moteur ${mb} Mo` : '';
}

/** Les n événements qui précèdent le dernier plantage détecté (vide s'il n'y en a pas). */
export function eventsBeforeCrash(n = 15): JournalEntry[] {
  const i = entries.map((x) => x.e.startsWith('⚠ PLANTAGE')).lastIndexOf(true);
  return i < 0 ? [] : entries.slice(Math.max(0, i - n), i);
}

export function clearJournal() {
  entries = [];
  persist();
  journal('journal effacé');
}

export function onJournal(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** « 22:12:58.204 » (avec la date si ce n'est pas aujourd'hui). */
export function journalTime(t: number): string {
  const d = new Date(t);
  const p = (n: number, w = 2) => `${n}`.padStart(w, '0');
  const hms = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
  return d.toDateString() === new Date().toDateString() ? hms : `${d.getDate()}/${d.getMonth() + 1} ${hms}`;
}

if (typeof window !== 'undefined') {
  const crash = crashOnStartup();
  if (crash) journal(`⚠ PLANTAGE : la page a été tuée pendant « ${crash.label} »`);
  journal('— page ouverte —');
  document.addEventListener('visibilitychange', () => journal(document.hidden ? 'page masquée' : 'page visible'));
  window.addEventListener('pagehide', () => journal('page quittée'));
}
