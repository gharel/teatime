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

import { journal } from './journal';

/* ------------------------------ Options de dépannage ------------------------------
 * Interrupteurs du diagnostic audio (Réglages), pour isoler sur l'appareil ce qui fait
 * planter ou taire l'audio sans nouvelle version de l'appli.
 */

export type DebugFlag = 'keepMicOpen' | 'noAudioSession' | 'noContextRelaunch' | 'separateSfx';

export const DEBUG_FLAGS: { id: DebugFlag; label: string; hint: string }[] = [
  {
    id: 'keepMicOpen',
    label: 'Garder le micro ouvert pendant qu’Emma parle',
    hint: 'iPhone : par défaut le micro se referme pendant qu’elle parle, puis se rouvre.',
  },
  {
    id: 'noAudioSession',
    label: 'Ne pas changer la session audio iOS',
    hint: 'Par défaut : « playback » pour la voix, « play-and-record » pour la reconnaissance du navigateur, « auto » pour Whisper.',
  },
  {
    id: 'noContextRelaunch',
    label: 'Ne pas mettre le lecteur audio en pause pour le micro',
    hint: 'Par défaut : lecteur en pause pendant l’écoute, repris quand Emma parle (sinon relancé après le micro).',
  },
  {
    id: 'separateSfx',
    label: 'Effets sonores sur un lecteur séparé',
    hint: 'Comportement d’avant : un deuxième lecteur audio, créé à la première réponse.',
  },
];

const DEBUG_KEY = 'teatime:debug';

export function debugFlags(): Partial<Record<DebugFlag, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(DEBUG_KEY) || '{}') ?? {};
  } catch {
    return {};
  }
}

export function debugFlag(flag: DebugFlag): boolean {
  return !!debugFlags()[flag];
}

export function setDebugFlag(flag: DebugFlag, on: boolean) {
  const f = debugFlags();
  if (on) f[flag] = true;
  else delete f[flag];
  try {
    if (Object.keys(f).length) localStorage.setItem(DEBUG_KEY, JSON.stringify(f));
    else localStorage.removeItem(DEBUG_KEY);
  } catch {
    /* navigation privée */
  }
  journal(`option de dépannage « ${flag} » ${on ? 'activée' : 'désactivée'}`);
}

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
 * permet de demander la catégorie « playback ». Avant l'écoute :
 *  - reconnaissance du navigateur seule : « play-and-record ». En « auto », WebKit ne compte
 *    pas sa capture : la reconnaissance démarrait sans rien entendre (iPhone, 23/11) ;
 *  - capture par la page (Whisper) : « auto », WebKit passe seul en enregistrement.
 * Sans cette API (autres navigateurs), ces fonctions ne font rien.
 */

let activeCaptures = 0;
/** Fermetures du micro (toutes captures confondues) et instant de la dernière. */
let captureEpoch = 0;
let lastCaptureEnd = -Infinity;

function audioSession(): { type: string } | undefined {
  return (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
}

type SessionType = 'playback' | 'auto' | 'play-and-record';

function setAudioSessionType(type: SessionType) {
  try {
    const session = audioSession();
    if (!session || session.type === type) return;
    if (debugFlag('noAudioSession')) {
      journal(`session audio iOS laissée à « ${session.type} » (option de dépannage)`);
      return;
    }
    const before = session.type;
    session.type = type;
    journal(`session audio iOS : ${before} → ${session.type}`);
  } catch (err) {
    journal(`session audio iOS : erreur ${String(err).slice(0, 60)}`);
  }
}

/** Catégorie audio iOS actuelle (diagnostic), ou null sans l'API. */
export function audioSessionType(): string | null {
  try {
    return audioSession()?.type ?? null;
  } catch {
    return null;
  }
}

/** Avant de jouer la voix : le son sort même en mode silencieux. */
export function setPlaybackAudioSession() {
  if (activeCaptures === 0) setAudioSessionType('playback');
}

/**
 * Avant d'ouvrir le micro : « auto » pour une capture de la page (WebKit passe seul en
 * enregistrement), « play-and-record » pour la reconnaissance du navigateur seule.
 */
export function beginCaptureAudioSession(type: 'auto' | 'play-and-record' = 'auto') {
  activeCaptures++;
  setAudioSessionType(type);
}

/** Micro refermé. */
export function endCaptureAudioSession() {
  activeCaptures = Math.max(0, activeCaptures - 1);
  if (activeCaptures === 0) {
    setAudioSessionType('playback');
    captureEpoch++;
    lastCaptureEnd = performance.now();
  }
}

/** Le micro est-il ouvert en ce moment (au sens de la session audio) ? */
export function captureActive(): boolean {
  return activeCaptures > 0;
}

/** Compteur de fermetures du micro : change à chaque fois que la dernière capture se termine. */
export function captureEndCount(): number {
  return captureEpoch;
}

/** Millisecondes écoulées depuis la fermeture du micro (Infinity s'il n'a jamais été ouvert). */
export function msSinceCaptureEnd(): number {
  return performance.now() - lastCaptureEnd;
}

/**
 * iPhone / iPad : tant que le micro est ouvert, iOS garde la session audio en « play-and-record »
 * (catégorie d'appel) — la voix d'Emma part dans l'écouteur du haut, à très bas volume, ou est
 * coupée ; la voix du système interrompt même la capture (iOS 27, bug WebKit 218815). On referme
 * donc réellement le micro pendant qu'Emma parle, et on le rouvre ensuite.
 */
export function releaseMicWhileSpeaking(): boolean {
  return isIOS() && !debugFlag('keepMicOpen');
}

/** Appareil à mémoire limitée : on y évite le GPU pour les modèles et les chargements superflus. */
export function constrainedDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return isMobileDevice() || (typeof mem === 'number' && mem > 0 && mem <= 4);
}

/* ------------------------------ Garde de chargement ------------------------------ */

export type GuardedEngine = 'kokoro' | 'piper' | 'whisper' | 'webllm' | 'pron';

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
