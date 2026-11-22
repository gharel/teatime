/* ------------------------------------------------------------------
 * Récupération automatique.
 *
 *  - Rechargement automatique, une fois : quand un élément essentiel ne
 *    se charge pas (module d'une page périmé après une mise à jour,
 *    worker introuvable, voix en erreur ou bloquée), la page se recharge
 *    d'elle-même au lieu d'attendre que l'apprenant le fasse.
 *  - Trace de l'activité : un onglet tué faute de mémoire ne reçoit pas
 *    « pagehide ». Si la trace est encore là au démarrage suivant, la
 *    page a planté pendant cette activité (affiché dans le diagnostic).
 * ------------------------------------------------------------------ */

export interface Trace {
  label: string;
  t: number;
}

const ACTIVITY_KEY = 'teatime:activity';
const CRASH_KEY = 'teatime:last-crash';
const RELOAD_KEY = 'teatime:auto-reload';
const LAST_RELOAD_KEY = 'teatime:last-auto-reload';
/** Au plus un rechargement automatique par onglet dans cet intervalle (pas de boucle). */
const RELOAD_EVERY_MS = 3 * 60_000;

function readTrace(storage: Storage | undefined, key: string): Trace | null {
  try {
    const v = JSON.parse(storage?.getItem(key) || 'null');
    return v && typeof v.label === 'string' && typeof v.t === 'number' ? v : null;
  } catch {
    return null;
  }
}

function writeTrace(storage: Storage | undefined, key: string, v: Trace | null) {
  try {
    if (v) storage?.setItem(key, JSON.stringify(v));
    else storage?.removeItem(key);
  } catch {
    /* navigation privée : pas de trace */
  }
}

const hasWindow = typeof window !== 'undefined';
const local = hasWindow ? window.localStorage : undefined;
const session = hasWindow ? window.sessionStorage : undefined;

/** Activité interrompue par un plantage de la visite précédente (relevée au démarrage). */
const crashedAtStartup: Trace | null = (() => {
  const t = readTrace(local, ACTIVITY_KEY);
  if (t) {
    writeTrace(local, ACTIVITY_KEY, null);
    writeTrace(local, CRASH_KEY, t);
  }
  return t;
})();

let current: string | null = null;

/** Note l'activité en cours (null : plus rien de risqué). */
export function setActivity(label: string | null) {
  if (label === current) return;
  current = label;
  writeTrace(local, ACTIVITY_KEY, label ? { label, t: Date.now() } : null);
}

if (hasWindow) {
  // Page quittée normalement (rechargement, navigation, fermeture) : ce n'est pas un plantage.
  window.addEventListener('pagehide', () => writeTrace(local, ACTIVITY_KEY, null));
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && current) writeTrace(local, ACTIVITY_KEY, { label: current, t: Date.now() });
  });
}

/** Plantage détecté à l'ouverture de cette page (sinon null). */
export function crashOnStartup(): Trace | null {
  return crashedAtStartup;
}

/** Dernier plantage connu (diagnostic). */
export function lastCrash(): Trace | null {
  return readTrace(local, CRASH_KEY);
}

/** Dernier rechargement automatique (diagnostic). */
export function lastAutoReload(): Trace | null {
  return readTrace(local, LAST_RELOAD_KEY);
}

/**
 * Recharge la page pour réparer un chargement raté. Refusé pendant une conversation, et au plus
 * une fois toutes les 3 minutes par onglet : si le rechargement ne suffit pas, l'erreur reste
 * affichée avec son bouton « Réessayer ». Renvoie true si la page se recharge.
 */
export function autoReload(reason: string): boolean {
  if (!hasWindow || current?.startsWith('conversation')) return false;
  try {
    const last = Number(session?.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_EVERY_MS) return false;
    session?.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  writeTrace(local, LAST_RELOAD_KEY, { label: reason, t: Date.now() });
  window.location.reload();
  return true;
}

/** Heure lisible d'une trace (« 14:32 », ou « 21/11 14:32 » si ce n'est pas aujourd'hui). */
export function traceTime(t: Trace): string {
  const d = new Date(t.t);
  const hm = `${d.getHours()}`.padStart(2, '0') + ':' + `${d.getMinutes()}`.padStart(2, '0');
  return d.toDateString() === new Date().toDateString() ? hm : `${d.getDate()}/${d.getMonth() + 1} ${hm}`;
}
