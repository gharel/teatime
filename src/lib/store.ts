/* ------------------------------------------------------------------
 * État global persistant (localStorage) + logique de gamification.
 * Store minimaliste basé sur useSyncExternalStore : zéro dépendance.
 * ------------------------------------------------------------------ */
import { useSyncExternalStore } from 'react';
import type { Level, Skill } from '../types';
import { constrainedDevice, isIOS } from './device';
import { hashString, seeded } from './text';

export type TtsEngine = 'kokoro' | 'piper' | 'system';
export type SttEngine = 'webspeech' | 'whisper';
export type LlmProvider = 'webllm' | 'ollama' | 'chrome' | 'scripted';

export interface Settings {
  ttsEngine: TtsEngine;
  kokoroVoice: string;
  kokoroDevice: 'auto' | 'wasm' | 'webgpu';
  /** Garder la voix neuronale même quand l'appareil la produit plus lentement qu'elle ne se parle. */
  kokoroEvenIfSlow: boolean;
  /** Révision des réglages (migrations). */
  settingsRev: number;
  systemVoice: string;
  speechRate: number; // 0.7 .. 1.2
  sttEngine: SttEngine;
  sttLang: 'en-US' | 'en-GB';
  whisperModel: string;
  silenceMs: number; // temps de réflexion avant fin de tour
  llmProvider: LlmProvider;
  webllmModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  handsFree: boolean;
  /** Analyse de la prononciation pendant les conversations (modèle local). */
  pronAnalysis: boolean;
  subtitles: boolean;
  sfx: boolean;
  theme: 'auto' | 'light' | 'dark';
}

export interface PlacementResult {
  date: string;
  level: Level;
  theta: number; // 0.5 .. 6.5
  nextProgress: number; // 0..1 vers le niveau suivant
  bySkill: Record<Skill, { correct: number; total: number }>;
  correct: number;
  total: number;
}

export interface UnitProgress {
  bestScore: number; // 0..100
  stars: number; // 1..3
  attempts: number;
  completedAt: string;
}

export interface SrsCard {
  id: string;
  kind: 'vocab' | 'mistake' | 'phrase';
  front: string; // anglais (ou exercice)
  back: string; // français / correction
  note?: string;
  box: number; // 1..5
  due: string; // YYYY-MM-DD
  ref?: string; // id d'exercice
}

export interface DayStats {
  xp: number;
  lessons: number;
  games: number;
  tutorTurns: number;
  reviews: number;
  speakOk: number;
  perfect: number;
}

export interface AppState {
  version: 1;
  profile: {
    name: string;
    level: Level | null;
    dailyGoal: number;
    onboarded: boolean;
    placements: PlacementResult[];
  };
  xp: number;
  days: Record<string, DayStats>;
  streak: { current: number; best: number; lastDay: string | null; freezes: number };
  units: Record<string, UnitProgress>;
  srs: Record<string, SrsCard>;
  badges: Record<string, string>;
  bests: Record<string, number>;
  questsClaimed: Record<string, string[]>; // jour -> ids
  totals: {
    lessons: number;
    perfect: number;
    exercises: number;
    correct: number;
    games: number;
    reviews: number;
    speakOk: number;
    tutorTurns: number;
    tutorSeconds: number;
    corrections: number;
    topics: Record<string, number>;
  };
  settings: Settings;
}

const KEY = 'teatime-english:v1';

export const DEFAULT_SETTINGS: Settings = {
  ttsEngine: 'kokoro',
  kokoroVoice: 'af_heart',
  kokoroDevice: 'auto',
  kokoroEvenIfSlow: false,
  settingsRev: 5,
  systemVoice: '',
  speechRate: 1,
  // iPhone : la reconnaissance du navigateur n'entend que la première réponse (voir stt.ts).
  sttEngine: isIOS() ? 'whisper' : 'webspeech',
  sttLang: 'en-US',
  // Multilingue (pas « .en ») : il reconnaît le français au lieu de le traduire en anglais.
  whisperModel: 'onnx-community/whisper-base',
  silenceMs: 2200,
  llmProvider: 'webllm',
  webllmModel: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2:3b',
  handsFree: true,
  // Modèle lourd (≈ 320 Mo, ~1 Go en mémoire) : désactivé par défaut sur téléphone, activable à la main.
  pronAnalysis: !constrainedDevice(),
  subtitles: true,
  sfx: true,
  theme: 'auto',
};

function initialState(): AppState {
  return {
    version: 1,
    profile: { name: '', level: null, dailyGoal: 50, onboarded: false, placements: [] },
    xp: 0,
    days: {},
    streak: { current: 0, best: 0, lastDay: null, freezes: 1 },
    units: {},
    srs: {},
    badges: {},
    bests: {},
    questsClaimed: {},
    totals: {
      lessons: 0,
      perfect: 0,
      exercises: 0,
      correct: 0,
      games: 0,
      reviews: 0,
      speakOk: 0,
      tutorTurns: 0,
      tutorSeconds: 0,
      corrections: 0,
      topics: {},
    },
    settings: { ...DEFAULT_SETTINGS },
  };
}

function migrateSettings(st: Settings): Settings {
  let s = st;
  // v2 : la voix neuronale choisit automatiquement le GPU (bien plus fluide) quand il est disponible.
  if ((s.settingsRev ?? 1) < 2) s = { ...s, kokoroDevice: 'auto', settingsRev: 2 };
  // v3 : sur téléphone, l'analyse de prononciation (gros modèle) saturait la mémoire avec la voix et
  // Whisper : l'onglet plantait et se rechargeait en boucle. Désactivée par défaut, activable à la main.
  if (s.settingsRev < 3) s = { ...s, pronAnalysis: s.pronAnalysis && !constrainedDevice(), settingsRev: 3 };
  // v4 : les modèles Whisper « .en » traduisaient en anglais ce que l'apprenant disait en français.
  if (s.settingsRev < 4) s = { ...s, whisperModel: s.whisperModel.replace(/\.en$/, ''), settingsRev: 4 };
  // v5 : sur iPhone, la reconnaissance du navigateur relancée peu après la précédente reste sourde
  // (bug WebKit 321436) : Emma n'entendait jamais la 2e réponse. Whisper (sur l'appareil) d'office.
  if (s.settingsRev < 5) s = { ...s, sttEngine: isIOS() ? 'whisper' : s.sttEngine, settingsRev: 5 };
  return s;
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const base = initialState();
    return {
      ...base,
      ...parsed,
      profile: { ...base.profile, ...parsed.profile },
      streak: { ...base.streak, ...parsed.streak },
      totals: { ...base.totals, ...parsed.totals },
      settings: migrateSettings({ ...base.settings, ...parsed.settings }),
    } as AppState;
  } catch {
    return initialState();
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* quota / navigation privée : on continue en mémoire */
    }
  }, 150);
}

export function getState(): AppState {
  return state;
}

export function setState(updater: (s: AppState) => AppState) {
  state = updater(state);
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function resetAll() {
  state = initialState();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function exportData(): string {
  return JSON.stringify(state, null, 2);
}

export function importData(json: string) {
  const parsed = JSON.parse(json) as AppState;
  if (parsed?.version !== 1) throw new Error('Fichier non reconnu');
  state = { ...initialState(), ...parsed };
  persist();
  listeners.forEach((l) => l());
}

/* ------------------------------ Dates ------------------------------ */

export function dayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dayKey(dt);
}

function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

const emptyDay = (): DayStats => ({ xp: 0, lessons: 0, games: 0, tutorTurns: 0, reviews: 0, speakOk: 0, perfect: 0 });

export function today(s: AppState = state): DayStats {
  return s.days[dayKey()] ?? emptyDay();
}

/* --------------------------- Niveaux joueur --------------------------- */

/** XP requis pour atteindre le niveau n (n >= 1). */
export function xpForLevel(n: number): number {
  return 50 * n * (n - 1);
}

export function playerLevel(xp: number): { level: number; progress: number; current: number; next: number } {
  let n = 1;
  while (xp >= xpForLevel(n + 1)) n++;
  const cur = xpForLevel(n);
  const next = xpForLevel(n + 1);
  return { level: n, progress: (xp - cur) / (next - cur), current: xp - cur, next: next - cur };
}

/* ------------------------------ Événements ------------------------------ */

/** Signale l'activité du jour : met à jour la série (avec jokers). */
function touchStreak(s: AppState): AppState {
  const t = dayKey();
  const st = { ...s.streak };
  if (st.lastDay === t) return s;
  if (!st.lastDay) {
    st.current = 1;
  } else {
    const gap = daysBetween(st.lastDay, t);
    if (gap === 1) st.current += 1;
    else if (gap > 1 && gap - 1 <= st.freezes) {
      // Les jokers couvrent les jours manqués.
      st.freezes -= gap - 1;
      st.current += 1;
    } else st.current = 1;
  }
  st.lastDay = t;
  // Un joker gagné tous les 7 jours de série (max 2).
  if (st.current > 0 && st.current % 7 === 0) st.freezes = Math.min(2, st.freezes + 1);
  st.best = Math.max(st.best, st.current);
  return { ...s, streak: st };
}

/** Série « effective » affichée : retombe à 0 si un jour a été manqué sans joker. */
export function displayedStreak(s: AppState): number {
  const st = s.streak;
  if (!st.lastDay) return 0;
  const gap = daysBetween(st.lastDay, dayKey());
  if (gap <= 1) return st.current;
  if (gap - 1 <= st.freezes) return st.current;
  return 0;
}

type DayField = Exclude<keyof DayStats, 'xp'>;

export interface XpEvent {
  xp: number;
  day?: Partial<Record<DayField, number>>;
  totals?: Partial<Omit<AppState['totals'], 'topics'>>;
  topic?: string;
}

/** Point d'entrée unique pour récompenser l'apprenant. Retourne les badges débloqués. */
export function reward(ev: XpEvent): Badge[] {
  const before = new Set(Object.keys(state.badges));
  setState((s0) => {
    let s = touchStreak(s0);
    const k = dayKey();
    const d = { ...(s.days[k] ?? emptyDay()) };
    d.xp += ev.xp;
    for (const [f, v] of Object.entries(ev.day ?? {})) d[f as DayField] += v ?? 0;
    const totals = { ...s.totals, topics: { ...s.totals.topics } };
    for (const [f, v] of Object.entries(ev.totals ?? {})) {
      (totals as unknown as Record<string, number>)[f] += v ?? 0;
    }
    if (ev.topic) totals.topics[ev.topic] = (totals.topics[ev.topic] ?? 0) + 1;
    s = { ...s, xp: s.xp + ev.xp, days: { ...s.days, [k]: d }, totals };
    return checkBadges(s);
  });
  return BADGES.filter((b) => state.badges[b.id] && !before.has(b.id));
}

/* ------------------------------ Badges ------------------------------ */

export interface Badge {
  id: string;
  title: string;
  desc: string;
  test: (s: AppState) => boolean;
}

export const BADGES: Badge[] = [
  { id: 'placement', title: 'Boussole', desc: 'Passer le test de niveau', test: (s) => s.profile.placements.length > 0 },
  { id: 'first-lesson', title: 'Premier pas', desc: 'Terminer une première leçon', test: (s) => s.totals.lessons >= 1 },
  { id: 'perfect', title: 'Sans-faute', desc: 'Réussir une leçon sans erreur', test: (s) => s.totals.perfect >= 1 },
  { id: 'streak-3', title: 'Ça chauffe', desc: '3 jours de série', test: (s) => s.streak.best >= 3 },
  { id: 'streak-7', title: 'Une semaine !', desc: '7 jours de série', test: (s) => s.streak.best >= 7 },
  { id: 'streak-30', title: 'Habitude ancrée', desc: '30 jours de série', test: (s) => s.streak.best >= 30 },
  { id: 'xp-100', title: 'Centurion', desc: 'Gagner 100 XP', test: (s) => s.xp >= 100 },
  { id: 'xp-1000', title: 'Mille mercis', desc: 'Gagner 1 000 XP', test: (s) => s.xp >= 1000 },
  { id: 'xp-5000', title: 'Fusée', desc: 'Gagner 5 000 XP', test: (s) => s.xp >= 5000 },
  { id: 'chat-10', title: 'Bavard·e', desc: '10 échanges avec Emma', test: (s) => s.totals.tutorTurns >= 10 },
  { id: 'chat-100', title: 'Moulin à paroles', desc: '100 échanges avec Emma', test: (s) => s.totals.tutorTurns >= 100 },
  { id: 'travel', title: 'Globe-trotter', desc: 'Parler voyages avec Emma', test: (s) => (s.totals.topics['travel'] ?? 0) >= 3 },
  { id: 'topics-5', title: 'Curieux·se', desc: 'Aborder 5 thèmes différents', test: (s) => Object.keys(s.totals.topics).length >= 5 },
  { id: 'games-5', title: 'Joueur·se', desc: 'Jouer 5 parties', test: (s) => s.totals.games >= 5 },
  { id: 'speed-20', title: 'Éclair', desc: '20 points au Chrono-Vocab', test: (s) => (s.bests['chrono'] ?? 0) >= 20 },
  { id: 'reviews-50', title: 'Mémoire d’éléphant', desc: '50 révisions', test: (s) => s.totals.reviews >= 50 },
  { id: 'speak-10', title: 'Belle voix', desc: '10 phrases bien prononcées', test: (s) => s.totals.speakOk >= 10 },
  { id: 'level-done', title: 'Diplômé·e', desc: 'Terminer les 4 unités d’un niveau', test: (s) => levelCompleted(s) },
];

function levelCompleted(s: AppState): boolean {
  const byLevel: Record<string, number> = {};
  for (const id of Object.keys(s.units)) {
    const lv = id.slice(0, 2);
    byLevel[lv] = (byLevel[lv] ?? 0) + 1;
  }
  return Object.values(byLevel).some((n) => n >= 4);
}

function checkBadges(s: AppState): AppState {
  let badges = s.badges;
  for (const b of BADGES) {
    if (!badges[b.id] && b.test(s)) badges = { ...badges, [b.id]: dayKey() };
  }
  return badges === s.badges ? s : { ...s, badges };
}

export function refreshBadges() {
  setState(checkBadges);
}

/* ------------------------------ Quêtes ------------------------------ */

export interface Quest {
  id: string;
  label: string;
  target: number;
  metric: (d: DayStats, s: AppState) => number;
  reward: number;
}

const QUEST_POOL: Quest[] = [
  { id: 'goal', label: 'Atteindre votre objectif du jour', target: 1, metric: (d, s) => (d.xp >= s.profile.dailyGoal ? 1 : 0), reward: 20 },
  { id: 'lesson-1', label: 'Terminer 1 leçon', target: 1, metric: (d) => d.lessons, reward: 15 },
  { id: 'lesson-2', label: 'Terminer 2 leçons', target: 2, metric: (d) => d.lessons, reward: 25 },
  { id: 'tutor-3', label: 'Échanger 3 fois avec Emma', target: 3, metric: (d) => d.tutorTurns, reward: 20 },
  { id: 'tutor-6', label: 'Échanger 6 fois avec Emma', target: 6, metric: (d) => d.tutorTurns, reward: 30 },
  { id: 'game-1', label: 'Jouer à un mini-jeu', target: 1, metric: (d) => d.games, reward: 10 },
  { id: 'game-3', label: 'Jouer 3 parties', target: 3, metric: (d) => d.games, reward: 20 },
  { id: 'review-10', label: 'Réviser 10 cartes', target: 10, metric: (d) => d.reviews, reward: 15 },
  { id: 'speak-3', label: 'Bien prononcer 3 phrases', target: 3, metric: (d) => d.speakOk, reward: 15 },
  { id: 'perfect-1', label: 'Faire une leçon sans faute', target: 1, metric: (d) => d.perfect, reward: 25 },
];

export function questsOfDay(key = dayKey()): Quest[] {
  const rand = seeded(hashString(key));
  const pool = QUEST_POOL.slice(1);
  const picked: Quest[] = [QUEST_POOL[0]];
  while (picked.length < 3) {
    const q = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    // évite deux quêtes de la même famille
    if (!picked.some((p) => p.id.split('-')[0] === q.id.split('-')[0])) picked.push(q);
  }
  return picked;
}

/** Réclame automatiquement les quêtes terminées. Retourne celles qui viennent d'être validées. */
export function claimQuests(): Quest[] {
  const k = dayKey();
  const done: Quest[] = [];
  const s = state;
  const d = today(s);
  const claimed = s.questsClaimed[k] ?? [];
  for (const q of questsOfDay(k)) {
    if (!claimed.includes(q.id) && q.metric(d, s) >= q.target) done.push(q);
  }
  if (done.length) {
    const bonus = done.reduce((a, q) => a + q.reward, 0);
    setState((st) => {
      const days = { ...st.days, [k]: { ...(st.days[k] ?? emptyDay()) } };
      days[k].xp += bonus;
      return checkBadges({
        ...st,
        xp: st.xp + bonus,
        days,
        questsClaimed: { ...st.questsClaimed, [k]: [...claimed, ...done.map((q) => q.id)] },
      });
    });
  }
  return done;
}

/* ------------------------- Répétition espacée ------------------------- */

const INTERVALS = [0, 1, 3, 7, 16, 35]; // jours, par boîte de Leitner

export function addSrsCards(cards: Omit<SrsCard, 'box' | 'due'>[]) {
  setState((s) => {
    const srs = { ...s.srs };
    for (const c of cards) {
      if (!srs[c.id]) srs[c.id] = { ...c, box: 1, due: dayKey() };
      else if (c.kind === 'mistake') srs[c.id] = { ...srs[c.id], box: 1, due: dayKey() };
    }
    return { ...s, srs };
  });
}

export function gradeSrs(id: string, ok: boolean) {
  setState((s) => {
    const c = s.srs[id];
    if (!c) return s;
    const box = ok ? Math.min(5, c.box + 1) : 1;
    const due = addDays(dayKey(), ok ? INTERVALS[box] : 0);
    return { ...s, srs: { ...s.srs, [id]: { ...c, box, due } } };
  });
}

export function dueCards(s: AppState = state): SrsCard[] {
  const t = dayKey();
  return Object.values(s.srs)
    .filter((c) => c.due <= t)
    .sort((a, b) => a.box - b.box || a.due.localeCompare(b.due));
}

/* ------------------------------ Divers ------------------------------ */

export function updateDailyGoal(dailyGoal: number) {
  setState((s) => ({ ...s, profile: { ...s.profile, dailyGoal } }));
}

export function setName(name: string) {
  setState((s) => ({ ...s, profile: { ...s.profile, name } }));
}

export function setLevel(level: Level) {
  setState((s) => ({ ...s, profile: { ...s.profile, level, onboarded: true } }));
}

export function savePlacement(r: PlacementResult) {
  setState((s) =>
    checkBadges({
      ...s,
      profile: { ...s.profile, level: r.level, onboarded: true, placements: [...s.profile.placements, r] },
    }),
  );
}

export function saveUnitProgress(unitId: string, score: number) {
  const stars = score >= 90 ? 3 : score >= 70 ? 2 : 1;
  setState((s) => {
    const prev = s.units[unitId];
    return {
      ...s,
      units: {
        ...s.units,
        [unitId]: {
          bestScore: Math.max(prev?.bestScore ?? 0, score),
          stars: Math.max(prev?.stars ?? 0, stars),
          attempts: (prev?.attempts ?? 0) + 1,
          completedAt: dayKey(),
        },
      },
    };
  });
}

export function saveBest(game: string, score: number): boolean {
  const prev = state.bests[game] ?? 0;
  if (score > prev) {
    setState((s) => checkBadges({ ...s, bests: { ...s.bests, [game]: score } }));
    return true;
  }
  return false;
}

export function lastDays(n: number, s: AppState = state): { key: string; xp: number }[] {
  const out: { key: string; xp: number }[] = [];
  const t = dayKey();
  for (let i = n - 1; i >= 0; i--) {
    const k = addDays(t, -i);
    out.push({ key: k, xp: s.days[k]?.xp ?? 0 });
  }
  return out;
}
