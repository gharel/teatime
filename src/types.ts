/* ------------------------------------------------------------------
 * Types partagés — contenus pédagogiques, progression, tuteur.
 * Tous les textes destinés à l'apprenant sont en français (consignes,
 * explications) ; le contenu cible est en anglais.
 * ------------------------------------------------------------------ */

export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export type Skill = 'grammar' | 'vocabulary' | 'reading' | 'listening';

/* ---------------------------- Test de niveau ---------------------------- */

export interface PlacementQuestion {
  id: string; // ex. "pq-a1-01"
  level: Level;
  skill: Skill;
  /** Consigne courte en français, ex. "Choisissez la bonne réponse". */
  instruction: string;
  /** Texte de la question en anglais. Utiliser "___" pour un trou. */
  prompt: string;
  /** Pour skill = 'reading' : court texte à lire (anglais). */
  passage?: string;
  /** Pour skill = 'listening' : phrase/texte lu par la synthèse vocale (anglais). Non affiché. */
  audio?: string;
  /** 3 ou 4 options (anglais). */
  options: string[];
  /** Index de la bonne réponse dans options. */
  answer: number;
  /** Explication en français, 1-2 phrases. */
  explanation: string;
}

/* ------------------------------ Exercices ------------------------------- */

interface ExerciseBase {
  id: string;
  /** Consigne en français. */
  instruction?: string;
  /** Explication / astuce affichée après la réponse (français). */
  explanation: string;
}

/** QCM. */
export interface McqExercise extends ExerciseBase {
  type: 'mcq';
  prompt: string;
  options: string[];
  answer: number;
}

/** Texte à trous (saisie). La phrase contient exactement un "___". */
export interface GapExercise extends ExerciseBase {
  type: 'gap';
  prompt: string;
  /** Réponses acceptées (comparaison insensible à la casse/ponctuation). */
  answers: string[];
  /** Indice facultatif affiché entre parenthèses, ex. verbe à l'infinitif "(go)". */
  hint?: string;
}

/** Remettre les mots dans l'ordre. */
export interface OrderExercise extends ExerciseBase {
  type: 'order';
  /** Traduction française de la phrase (aide). */
  translation: string;
  /** Phrase anglaise correcte ; découpée en tuiles sur les espaces. */
  answer: string;
  /** Autres ordres acceptés (facultatif). */
  alternatives?: string[];
  /** Mots pièges en plus (facultatif). */
  distractors?: string[];
}

/** Traduire du français vers l'anglais (saisie libre, tolérance aux fautes de frappe). */
export interface TranslateExercise extends ExerciseBase {
  type: 'translate';
  /** Phrase française. */
  prompt: string;
  /** Traductions acceptées. */
  answers: string[];
}

/** Écouter (TTS) puis choisir ou écrire. */
export interface ListenExercise extends ExerciseBase {
  type: 'listen';
  /** Texte lu à voix haute (anglais). */
  audio: string;
  /** Si options présentes : QCM sur ce qui a été entendu ; sinon dictée de `audio`. */
  question?: string;
  options?: string[];
  answer?: number;
}

/** Répéter une phrase à voix haute (reconnaissance vocale). */
export interface SpeakExercise extends ExerciseBase {
  type: 'speak';
  /** Phrase à prononcer. */
  text: string;
  /** Traduction française. */
  translation: string;
  /** Point de prononciation travaillé (français), ex. "Le son TH". */
  focus?: string;
}

export type Exercise =
  | McqExercise
  | GapExercise
  | OrderExercise
  | TranslateExercise
  | ListenExercise
  | SpeakExercise;

export interface VocabItem {
  en: string;
  fr: string;
  /** Exemple en anglais utilisant le mot. */
  example: string;
  /** Prononciation simplifiée facultative, ex. "/ˈθɜːzdeɪ/". */
  ipa?: string;
}

export interface GrammarPoint {
  title: string; // en français
  /** Explication en français, paragraphes séparés par "\n\n". Peut contenir **gras**. */
  explanation: string;
  /** Exemples : anglais + traduction française. */
  examples: { en: string; fr: string }[];
  /** Piège typique des francophones (français). */
  frenchTrap?: string;
}

export interface Unit {
  id: string; // ex. "a1-u1"
  level: Level;
  title: string; // en français
  /** Emoji illustratif. */
  icon: string;
  /** Objectif actionnable CECRL : "Je peux ..." */
  canDo: string;
  grammar: GrammarPoint;
  vocab: VocabItem[]; // 8 à 10 mots
  exercises: Exercise[]; // 10 à 12 exercices, types variés
}

/* ------------------------------- Tuteur -------------------------------- */

export interface TopicQuestion {
  /** Question posée par la prof (anglais), adaptée au niveau. */
  q: string;
  /** Débuts de réponse pour aider l'apprenant (anglais). */
  starters: string[];
  /** Mots utiles (anglais = français). */
  words?: string[];
}

export interface TutorTopic {
  id: string; // ex. "travel"
  title: string; // français
  icon: string;
  description: string; // français
  /** Scénario/rôle pour le LLM (anglais), ex. "You are at a hotel reception…". */
  scenario: string;
  /** Questions par bande de niveau. */
  questions: Record<'A' | 'B' | 'C', TopicQuestion[]>;
}

/* ------------------------------ Faux amis ------------------------------ */

export interface FalseFriend {
  en: string; // "actually"
  looksLike: string; // "actuellement"
  realMeaning: string; // "en fait"
  frWordInEnglish: string; // "currently"
  example: string; // phrase anglaise
}

/* --------------------------- Prononciation ---------------------------- */

export interface MinimalPair {
  a: string;
  b: string;
  focus: string; // français : "i court /ɪ/ vs i long /iː/"
}
