/* ------------------------------------------------------------------
 * Capacités de l'appareil et garde anti-boucle de plantage.
 *
 * Sur téléphone, charger un gros modèle (voix GPU, LLM, analyse de
 * prononciation) peut faire planter l'onglet faute de mémoire. Le
 * navigateur recharge alors la page, qui relance le même chargement…
 * et ainsi de suite. On note donc chaque chargement en cours dans
 * localStorage : s'il est encore là au démarrage suivant, le chargement
 * n'est jamais arrivé au bout, et on change de stratégie.
 * ------------------------------------------------------------------ */

/** Téléphone ou tablette (y compris iPadOS, qui se présente comme un Mac). */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uad = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uad?.mobile) return true;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true;
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/** iPhone / iPad : tous les navigateurs y utilisent WebKit (Safari, Brave, Chrome, Firefox…). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

/* ------------------------------ Session audio (iOS) ------------------------------
 * Par défaut, iOS range le son Web Audio dans la catégorie « ambient » : il est coupé
 * quand l'iPhone est en mode silencieux (bouton latéral) — la voix d'Emma devient
 * muette alors que le reste fonctionne. L'API Audio Session (WebKit, iOS 16.4+)
 * permet de demander la catégorie « playback ». Pendant l'écoute, il faut
 * « play-and-record », posé AVANT getUserMedia (sinon iOS baisse le volume).
 * Sans cette API (autres navigateurs), ces fonctions ne font rien.
 */

let activeCaptures = 0;

function setAudioSessionType(type: 'playback' | 'play-and-record') {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== type) session.type = type;
  } catch {
    /* API absente ou refusée */
  }
}

/** Avant de jouer la voix : le son sort même en mode silencieux. */
export function setPlaybackAudioSession() {
  if (activeCaptures === 0) setAudioSessionType('playback');
}

/** Avant d'ouvrir le micro. */
export function beginCaptureAudioSession() {
  activeCaptures++;
  setAudioSessionType('play-and-record');
}

/** Micro refermé. */
export function endCaptureAudioSession() {
  activeCaptures = Math.max(0, activeCaptures - 1);
  if (activeCaptures === 0) setAudioSessionType('playback');
}

/** Appareil à mémoire limitée : on y évite le GPU pour les modèles et les chargements superflus. */
export function constrainedDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return isMobileDevice() || (typeof mem === 'number' && mem > 0 && mem <= 4);
}

/* ------------------------------ Garde de chargement ------------------------------ */

export type GuardedEngine = 'kokoro' | 'whisper' | 'webllm' | 'pron';

interface GuardEntry {
  device?: string;
  /** Chargements successifs jamais terminés (page rechargée, plantée ou fermée pendant le chargement). */
  count: number;
  t: number;
}

const GUARD_KEY = 'teatime:model-loads';

function readGuard(): Partial<Record<GuardedEngine, GuardEntry>> {
  try {
    return JSON.parse(localStorage.getItem(GUARD_KEY) || '{}') ?? {};
  } catch {
    return {};
  }
}

function writeGuard(g: Partial<Record<GuardedEngine, GuardEntry>>) {
  try {
    if (Object.keys(g).length) localStorage.setItem(GUARD_KEY, JSON.stringify(g));
    else localStorage.removeItem(GUARD_KEY);
  } catch {
    /* navigation privée : pas de garde, tant pis */
  }
}

/** État relevé à l'ouverture de la page (avant tout chargement de cette session). */
const atStartup = typeof localStorage === 'undefined' ? {} : readGuard();

/** Chargements de ce moteur interrompus lors des sessions précédentes. */
export function interruptedLoads(engine: GuardedEngine): { count: number; device?: string } {
  const e = atStartup[engine];
  return e ? { count: e.count, device: e.device } : { count: 0 };
}

/** Chargements en cours dans cette page (moteur → appareil). */
const inProgress = new Map<GuardedEngine, string | undefined>();

function markInProgress(engine: GuardedEngine, device?: string) {
  const g = readGuard();
  g[engine] = { device, count: (atStartup[engine]?.count ?? 0) + 1, t: Date.now() };
  writeGuard(g);
}

/** À appeler juste avant de lancer un chargement. */
export function beginLoad(engine: GuardedEngine, device?: string) {
  inProgress.set(engine, device);
  markInProgress(engine, device);
}

/** Chargement terminé (succès ou erreur propre) : la page n'a pas planté. */
export function endLoad(engine: GuardedEngine) {
  inProgress.delete(engine);
  delete atStartup[engine];
  const g = readGuard();
  if (!g[engine]) return;
  delete g[engine];
  writeGuard(g);
}

if (typeof window !== 'undefined') {
  // Page quittée normalement pendant un chargement (rechargement du service worker d'isolation,
  // rechargement manuel, navigation) : ce n'est pas un plantage, on ne le compte pas. Un onglet tué
  // faute de mémoire ne reçoit pas cet événement : il reste compté.
  window.addEventListener('pagehide', () => {
    if (!inProgress.size) return;
    const g = readGuard();
    inProgress.forEach((_, engine) => {
      const before = atStartup[engine];
      if (before) g[engine] = before;
      else delete g[engine];
    });
    writeGuard(g);
  });
  // Retour depuis le cache avant/arrière : les chargements reprennent, on les surveille de nouveau.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) inProgress.forEach((device, engine) => markInProgress(engine, device));
  });
}
