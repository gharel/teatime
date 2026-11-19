/* ------------------------------------------------------------------
 * Test de positionnement adaptatif (CAT simplifié, modèle IRT 3PL).
 *  - Aptitude θ sur une grille 0.5..6.5 (1 = A1 … 6 = C2).
 *  - Après chaque réponse : mise à jour bayésienne de la distribution.
 *  - Question suivante : niveau le plus proche de la moyenne a posteriori,
 *    en alternant les compétences (grammaire, vocabulaire, lecture, écoute).
 * ------------------------------------------------------------------ */
import type { Level, PlacementQuestion, Skill } from '../types';
import { LEVELS } from '../types';

export const TEST_LENGTH = 20;
const GRID: number[] = Array.from({ length: 61 }, (_, i) => 0.5 + i * 0.1);
const DISCRIMINATION = 1.7;

export interface CatState {
  posterior: number[];
  asked: string[];
  answers: { id: string; level: Level; skill: Skill; correct: boolean; skipped: boolean }[];
}

export function levelIndex(l: Level): number {
  return LEVELS.indexOf(l) + 1; // 1..6
}

export function initCat(startLevel: number): CatState {
  const prior = GRID.map((t) => Math.exp(-((t - startLevel) ** 2) / (2 * 1.6 ** 2)));
  const z = prior.reduce((a, b) => a + b, 0);
  return { posterior: prior.map((p) => p / z), asked: [], answers: [] };
}

export function pCorrect(theta: number, difficulty: number, guess: number): number {
  return guess + (1 - guess) / (1 + Math.exp(-DISCRIMINATION * (theta - difficulty)));
}

export function thetaMean(st: CatState): number {
  return GRID.reduce((a, t, i) => a + t * st.posterior[i], 0);
}

export function thetaSd(st: CatState): number {
  const m = thetaMean(st);
  return Math.sqrt(GRID.reduce((a, t, i) => a + (t - m) ** 2 * st.posterior[i], 0));
}

export function update(st: CatState, q: PlacementQuestion, correct: boolean, skipped = false): CatState {
  const b = levelIndex(q.level);
  // « Je ne sais pas » : pas de chance de deviner => c = 0
  const c = skipped ? 0 : 1 / q.options.length;
  const post = st.posterior.map((p, i) => {
    const pc = pCorrect(GRID[i], b, c);
    return p * (correct ? pc : 1 - pc);
  });
  const z = post.reduce((a, x) => a + x, 0) || 1;
  return {
    posterior: post.map((x) => x / z),
    asked: [...st.asked, q.id],
    answers: [...st.answers, { id: q.id, level: q.level, skill: q.skill, correct, skipped }],
  };
}

const SKILL_ROTATION: Skill[] = ['grammar', 'vocabulary', 'grammar', 'reading', 'grammar', 'listening', 'vocabulary', 'grammar', 'reading', 'vocabulary'];

/** Choisit la prochaine question. */
export function nextQuestion(st: CatState, bank: PlacementQuestion[], rand: () => number = Math.random): PlacementQuestion | null {
  if (st.asked.length >= TEST_LENGTH) return null;
  const m = thetaMean(st);
  // On vise légèrement au-dessus pour départager les niveaux voisins.
  const targetLevel = Math.min(6, Math.max(1, Math.round(m + 0.15)));
  const wantedSkill = SKILL_ROTATION[st.asked.length % SKILL_ROTATION.length];
  const unused = bank.filter((q) => !st.asked.includes(q.id));
  if (!unused.length) return null;
  const score = (q: PlacementQuestion) => {
    const d = Math.abs(levelIndex(q.level) - targetLevel);
    return d * 10 + (q.skill === wantedSkill ? 0 : 3) + rand();
  };
  return unused.slice().sort((a, b) => score(a) - score(b))[0];
}

export function finalLevel(st: CatState): { level: Level; theta: number; nextProgress: number } {
  const theta = thetaMean(st);
  const idx = Math.min(6, Math.max(1, Math.floor(theta + 0.25)));
  const nextProgress = idx === 6 ? 1 : Math.min(1, Math.max(0, theta + 0.25 - idx));
  return { level: LEVELS[idx - 1], theta, nextProgress };
}

export const CEFR_INFO: Record<Level, { name: string; summary: string; canDo: string[] }> = {
  A1: {
    name: 'Débutant',
    summary: 'Vous comprenez et utilisez des expressions familières et quotidiennes très simples.',
    canDo: ['Vous présenter et poser des questions simples', 'Comprendre des mots et phrases très courants', 'Commander, acheter, demander votre chemin avec des phrases simples'],
  },
  A2: {
    name: 'Élémentaire',
    summary: 'Vous communiquez lors de tâches simples et habituelles sur des sujets familiers.',
    canDo: ['Parler de votre famille, votre travail, votre passé récent', 'Comprendre des annonces et messages simples', 'Échanger des informations simples en voyage'],
  },
  B1: {
    name: 'Intermédiaire seuil',
    summary: 'Vous vous débrouillez dans la plupart des situations de voyage et sur des sujets familiers.',
    canDo: ['Raconter une expérience, un projet, donner votre avis', 'Comprendre l’essentiel d’une conversation claire', 'Écrire un texte simple et cohérent'],
  },
  B2: {
    name: 'Intermédiaire avancé',
    summary: 'Vous communiquez avec spontanéité et aisance avec des natifs, sur des sujets variés.',
    canDo: ['Argumenter et défendre un point de vue', 'Comprendre des textes complexes et l’actualité', 'Participer à une réunion professionnelle'],
  },
  C1: {
    name: 'Autonome',
    summary: 'Vous vous exprimez couramment, de façon souple et efficace, y compris au travail.',
    canDo: ['Comprendre des textes longs et exigeants, et l’implicite', 'Vous exprimer spontanément sans chercher vos mots', 'Rédiger des textes clairs, structurés et détaillés'],
  },
  C2: {
    name: 'Maîtrise',
    summary: 'Vous comprenez presque tout sans effort et nuancez finement votre pensée.',
    canDo: ['Saisir les nuances les plus fines', 'Reformuler et résumer des sources variées', 'Vous exprimer avec précision dans tous les registres'],
  },
};

export const SKILL_LABELS: Record<Skill, string> = {
  grammar: 'Grammaire',
  vocabulary: 'Vocabulaire',
  reading: 'Compréhension écrite',
  listening: 'Compréhension orale',
};
