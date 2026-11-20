/* ------------------------------------------------------------------
 * Compréhension de ce que dit l'apprenant, pour qu'Emma réagisse à ce
 * qui a vraiment été dit au lieu d'enchaîner ses questions :
 *  - intention : réponse, question posée à Emma, demande de répétition,
 *    « je ne sais pas », français, salutation, au revoir, hors sujet ;
 *  - pertinence : similarité sémantique question ↔ réponse (petit modèle
 *    local) complétée par le type de réponse attendu (lieu, moment,
 *    oui/non, raison…) pour les réponses très courtes ;
 *  - détail à reprendre (« Spain? Lovely! ») et temps du verbe attendu.
 * Fonctions pures (testables) ; le calcul sémantique est fait par le moteur.
 * ------------------------------------------------------------------ */
import type { TopicQuestion } from '../types';
import type { Issue } from '../lib/corrector';
import { normalize } from '../lib/text';

export type Intent =
  | 'answer'
  | 'short'
  | 'off-topic'
  | 'question'
  | 'repeat'
  | 'dont-know'
  | 'french'
  | 'greeting'
  | 'thanks'
  | 'goodbye';

/** Résultat sémantique (calculé par le moteur quand le modèle est prêt). */
export interface SemanticSignal {
  /** Similarité réponse ↔ question posée (−1..1). */
  sim: number;
  /** Thème dont une question correspond le mieux à la réponse (hors thème courant). */
  other?: { topicId: string; sim: number };
}

export interface Understanding {
  intent: Intent;
  /** L'apprenant pose (aussi) une question à Emma. */
  asksBack: boolean;
  /** Sa question, normalisée. */
  question?: string;
  /** La réponse évoque surtout un autre thème (id) : Emma peut suivre son idée. */
  otherTopic?: string;
  /** Détail à reprendre dans la réaction d'Emma. */
  detail?: string;
  /** Réponse négative (« No, I don't… ») : pas de « Great! » enthousiaste. */
  negative: boolean;
  /** Nombre de mots. */
  words: number;
  /** Similarité sémantique avec la question (si calculée). */
  sim?: number;
  /** En français, l'apprenant demande comment dire quelque chose en anglais. */
  howToSay?: boolean;
}

/* Seuils calibrés sur le modèle multi-qa-MiniLM-L6 (réponses pertinentes ≥ 0,2 ; hors sujet ≤ 0,18). */
export const OFF_TOPIC_SIM = 0.19;
export const SHORT_OFF_TOPIC_SIM = 0.08;
export const OTHER_TOPIC_SIM = 0.45;

const FILLERS = /^((um|uh|er|erm|hmm|mm|well|so|oh|ah|ok|okay|euh|ben|bah)\s+)+/;

const REPEAT_PATTERNS = [
  /^(sorry|pardon|excuse me|what|huh|eh|again)$/,
  /\b(can|could|would) you (please )?(repeat|say (that|it) again|speak (more )?slowly|slow down|speak slower)\b/,
  /^(please )?(repeat|say (that|it) again|again please|one more time|more slowly|slower|slowly please)\b/,
  /\bi (do|did) not (understand|get it|catch (that|it)|hear( you)?)\b/,
  /\bi am not sure i understand\b/,
  /\bwhat did you say\b/,
  /\bcome again\b/,
  /\bwhat do you mean\b/,
  /\bwhat does [a-z']+( [a-z']+)? mean\b/,
];

const DONT_KNOW =
  /^(i do not know|i have no idea|no idea|i am not sure|i do not remember|i can not remember|i have nothing to say|nothing|i do not know what to say|i do not know how to say( it| that)?|not sure)( sorry)?$/;

const GOODBYE =
  /^(bye|bye bye|goodbye|good bye|see you( later| soon| next time)?|i have to go( now)?|i must go( now)?|i need to go( now)?|i want to stop|let us stop|stop( please)?|that is all( for today)?)( emma)?( thank you| thanks)?( bye| goodbye)?$/;

const GREETING = /^(hi|hello|hey|good morning|good afternoon|good evening)( there)?( emma)?$/;
const THANKS = /^(thank you|thanks|thank you very much|thanks a lot)( emma)?$/;

const ASK_TAIL = /\b(and you|what about you|how about you|and yourself|and what about you|and you emma)$/;
const ASK_START =
  /^(and |so |but )?((do|does|did|are|were|have|has|can|could|would|will|is|was) you|(what|where|when|why|how|who|which)( (kind|sort|type) of [a-z']+)? (do|does|did|are|is|was|were|have|has|can|could|would|will) (you|your)|(how|what) about you|what is your|how old are you|who are you)\b/;

/** Mots français fréquents (sans accents), absents de l'anglais courant. */
const FR_WORDS = new Set(
  'je j tu il elle nous vous ils elles le la les un de des du au aux une et est sont suis etait ai avons avez ont mais donc ou ne n pas tres bien beaucoup avec dans sur sous par que qu qui quoi quand comment pourquoi oui non merci bonjour salut bonsoir aime adore deteste fait faire vais vas allons allez voudrais veux veut peux peut faut sais connais dit dire ca cela ceci ce c cette ces mon ma mes ton ta tes sa ses notre votre leur leurs chez ici voila alors aussi toujours jamais rien tout tous toute moi toi lui eux parce quelque chose euh ben bah anglais francais'.split(
    ' ',
  ),
);
const FR_REPEAT = /\b(repete|repeter|repetez|comprends pas|compris|lentement|redis|redire)\b/;
const FR_DONT_KNOW = /\b(sais pas|ne sais|aucune idee|sais plus|je sais pas)\b/;
/** « Comment on dit cuisine en anglais ? », « Ça veut dire quoi ? » */
const FR_HOW_TO_SAY =
  /\b(comment (est ce qu )?(on )?(dit|dire|traduit|traduire|se dit|ca se dit)|(ca|cela) se dit comment|on dit comment|(que|qu est ce que) veut dire|(ca|cela) veut dire quoi|qu est ce que (ca|cela) veut dire|c est quoi en anglais|en anglais c est|en anglais on dit)\b/;

/** Minuscules sans accents (pour le français). */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function looksFrench(text: string): boolean {
  const toks = fold(text).split(' ').filter(Boolean);
  if (!toks.length) return false;
  const fr = toks.filter((t) => FR_WORDS.has(t)).length;
  const accents = /[éèêàçùâîôûœ]/i.test(text);
  return (fr >= 2 && fr / toks.length >= 0.4) || (accents && fr >= 1) || (toks.length === 1 && fr === 1 && toks[0].length > 2);
}

/* ------------------------------ Type de réponse attendu ------------------------------ */

type AnswerType = 'yesno' | 'place' | 'time' | 'reason' | 'transport' | 'person' | 'opinion';

export function expectedTypes(question: string): AnswerType[] {
  const n = normalize(question);
  const t: AnswerType[] = [];
  const wh = /^(.*? )?(what|where|when|why|how|who|which)\b/.test(n);
  if (/^(and |so )?(do|does|did|are|is|was|were|have|has|can|could|would|will|should)\b/.test(n) || (!wh && /\b(do|did|are|have|can|would) you\b/.test(n)))
    t.push('yesno');
  if (/\bwhere\b/.test(n)) t.push('place');
  if (/\b(when|what time|how long|how often|how many|how much)\b/.test(n)) t.push('time');
  if (/\bwhy\b/.test(n)) t.push('reason');
  if (/\bhow (do|did|does|will|would) you (get|go|travel|come)\b/.test(n)) t.push('transport');
  if (/\bwho\b/.test(n)) t.push('person');
  if (/\b(think|opinion|agree|believe|should|to what extent|is it|do you prefer|better|worse)\b/.test(n)) t.push('opinion');
  return t;
}

const SATISFIES: Record<AnswerType, (n: string, raw: string) => boolean> = {
  yesno: (n) =>
    /^(yes|yeah|yep|no|nope|not really|of course|sure|absolutely|definitely|sometimes|never|always|often|rarely|a little|a bit|not much|it depends|maybe|i (do|did|am|was|have|can|could|would|will|like|love|hate|prefer|think|usually|often|always|never|really|sometimes))\b/.test(
      n,
    ),
  place: (n, raw) =>
    /\b(home|abroad|here|there|city|town|village|country|countryside|seaside|beach|mountains?|sea|lake|island|office|school|north|south|east|west|centre|center|street|hotel|camping|place)\b/.test(n) ||
    /\b(in|at|to|from|near|around|visit|visited)\s+(the\s+)?[A-Z][a-z]+/.test(raw) ||
    /^[A-Z][a-z]+(\s+[A-Z][a-z]+)?[.!]?$/.test(raw.trim()),
  time: (n) =>
    /\b(o'?clock|am|pm|morning|afternoon|evening|night|noon|midnight|today|yesterday|tomorrow|day|days|week|weeks|weekend|month|months|year|years|summer|winter|spring|autumn|ago|last|next|every|usually|always|sometimes|never|often|once|twice|times|early|late|soon|minutes?|hours?|half|quarter|monday|tuesday|wednesday|thursday|friday|saturday|sunday|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred)\b/.test(
      n,
    ),
  reason: (n) => /\b(because|since|so that|that is why|reason|due to|thanks to|in order to|as a result)\b/.test(n),
  transport: (n) => /\b(by|on foot|walk|walked|drive|drove|car|bus|train|plane|flight|flew|fly|bike|bicycle|cycle|boat|ferry|metro|subway|tram|taxi|motorbike|scooter)\b/.test(n),
  person: (n, raw) =>
    /\b(alone|myself|friend|friends|family|wife|husband|partner|mother|mum|mom|father|dad|parents|brother|sister|son|daughter|children|kids|colleague|colleagues|boss|team|nobody|everybody|everyone|people|someone)\b/.test(
      n,
    ) || /\b[A-Z][a-z]+\b/.test(raw.replace(/^\S+\s*/, '').replace(/\bI\b/g, '')),
  opinion: (n) =>
    /\b(i think|in my opinion|i believe|i agree|i disagree|i do not agree|it depends|i feel|personally|for me|i would say|i guess|i suppose|yes|no|definitely|absolutely|not really|of course|i am not sure|i prefer)\b/.test(
      n,
    ),
};

export function satisfiesType(question: string, answer: string): boolean {
  const n = normalize(answer);
  return expectedTypes(question).some((t) => SATISFIES[t](n, answer));
}

/** L'apprenant reprend un des débuts de réponse proposés (« I usually go to… »). */
function usesStarter(q: TopicQuestion, answer: string): boolean {
  const n = normalize(answer);
  return q.starters.some((s) => {
    const head = normalize(s.replace(/…|\.\.\./g, ''))
      .split(' ')
      .slice(0, 3)
      .join(' ');
    return head.split(' ').length >= 2 && n.includes(head);
  });
}

/* ------------------------------ Détail à reprendre ------------------------------ */

const SWAP: Record<string, string> = {
  my: 'your',
  me: 'you',
  mine: 'yours',
  myself: 'yourself',
  our: 'your',
  ours: 'yours',
  us: 'you',
  we: 'you',
  i: 'you',
  am: 'are',
  "i'm": "you're",
};

/** « my friends » → « your friends » (pour reprendre les mots de l'apprenant). */
export function swapPronouns(s: string): string {
  return s.replace(/\b(i'm|my|me|mine|myself|our|ours|us|we|i|am)\b/gi, (w) => SWAP[w.toLowerCase()] ?? w);
}

const CUT = /\s+(?:because|but|so|when|if|since|which|who|that|although|though|cause|and then|but)\b.*$/i;

function clip(fragment: string): string | undefined {
  const f = fragment.replace(CUT, '').replace(/\s+/g, ' ').trim();
  const words = f.split(' ');
  if (!f || words.length > 6) return undefined;
  if (/\b(it|this|that|them|there|one|ones)$/i.test(f) && words.length <= 1) return undefined;
  return swapPronouns(f);
}

/** Élément concret de la réponse que la prof peut reprendre (« Spain », « playing tennis »). */
export function extractDetail(text: string): string | undefined {
  const t = text.replace(/[“”"«»]/g, '').trim();
  const patterns = [
    /\bmy fav(?:ou)?rite\s+[a-z]+\s+(?:is|was)\s+([^,.;!?]+)/i,
    /\b(?:I|we)\s+(?:really\s+|usually\s+|often\s+|also\s+)?(?:like|love|enjoy|adore|prefer)\s+([^,.;!?]+)/i,
    /\b(?:go|went|travel(?:l?ed)?|fly|flew|moved?|drove|drive)\s+to\s+([^,.;!?]+)/i,
    /\b(?:live|lived|work|worked|stay|stayed|was born|grew up)\s+(?:in|at|for)\s+([^,.;!?]+)/i,
    /\b(?:I am|I'm|I work as|I was)\s+(an?\s+[^,.;!?]+)/i,
    /\b(?:visit|visited)\s+([^,.;!?]+)/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const d = clip(m[1]);
      if (d && !/^(it|that|this|them|to|a lot|so much|very much|much)$/i.test(d)) return d;
    }
  }
  // Nom propre au milieu d'une phrase (« … in Barcelona with … »)
  const toks = t.split(/\s+/);
  for (let i = 1; i < toks.length; i++) {
    const prevEnds = /[.!?]$/.test(toks[i - 1]);
    const w = toks[i].replace(/[^A-Za-z'-]/g, '');
    if (!prevEnds && /^[A-Z][a-z]{2,}/.test(w) && !/^(I|I'm|I've|I'd|I'll|OK|Okay|Emma)$/.test(w)) {
      const group = [w];
      for (let j = i + 1; j < toks.length; j++) {
        const x = toks[j].replace(/[^A-Za-z'-]/g, '');
        if (/^[A-Z][a-z]+/.test(x)) group.push(x);
        else break;
        if (/[,.!?;]$/.test(toks[j])) break;
      }
      return group.join(' ');
    }
  }
  return undefined;
}

function isNegative(n: string): boolean {
  return /^(no|nope|not really|never|not at all|not much|not very|i do not|i am not|i have not|i can not|i did not|i would not|i hate|i really do not)\b/.test(n);
}

/* ------------------------------ Question posée à Emma ------------------------------ */

/** Sépare la question posée à Emma du reste (« I go to Spain. And you? »). */
function splitQuestion(text: string): { asks: boolean; question?: string; rest: string } {
  const n = normalize(text);
  const tail = n.match(ASK_TAIL);
  if (tail) return { asks: true, question: tail[0], rest: n.slice(0, tail.index).trim() };
  if (ASK_START.test(n)) return { asks: true, question: n, rest: '' };
  if (/\?\s*$/.test(text) && /\byou(r)?\b/.test(n)) {
    // Dernière phrase interrogative
    const parts = text.split(/(?<=[.!?])\s+/);
    const q = parts.pop() ?? text;
    return { asks: true, question: normalize(q), rest: normalize(parts.join(' ')) };
  }
  return { asks: false, rest: n };
}

const EMMA_FACTS: [RegExp, string][] = [
  [/\byour name\b|\bwho are you\b/, "I'm Emma, your English teacher."],
  [/\bwhere (are you from|do you come from|do you live)\b/, "I'm from London, and I still live there."],
  [/\bhow are you\b|\bhow is it going\b|\bhow are things\b|\bhow do you do\b/, "I'm very well, thank you!"],
  [/\bhow old are you\b|\byour age\b/, "Ha! That's a secret."],
  [/\b(are you|you are) (a robot|real|human|an ai|a machine|a computer|a person)\b/, "I'm a virtual teacher, but I really enjoy our chats!"],
  [/\bwhat do you do\b|\byour job\b|\bdo you work\b|\bare you a teacher\b/, "I'm an English teacher, and I love my job."],
  [/\bdo you have (any )?(children|kids)\b/, "No, I don't, but I have a lovely cat called Biscuit."],
  [/\bdo you have (a |any )?(pets?|dogs?|cats?|animals?)\b/, 'Yes, I have a cat called Biscuit.'],
  [/\b(are you married|do you have a (boyfriend|girlfriend|husband|wife|partner))\b/, "Ha, that's a bit personal!"],
  [/\bwhat time is it\b/, 'Time for English, of course!'],
];

/** Ce qu'Emma raconte d'elle quand on lui retourne la question, par thème. */
const PERSONA: Record<string, string> = {
  travel: 'I love travelling, especially by train. Last summer, I went to Scotland, and it was beautiful.',
  work: "I'm an English teacher, and I really enjoy my job.",
  personal: 'I live in London with my partner and our cat, Biscuit.',
  food: 'I love cooking, and my favourite dish is a good curry.',
  hobbies: 'In my free time, I like reading, cycling and going to the cinema.',
  health: 'I try to stay healthy: I cycle to work and I drink a lot of water… and tea!',
  shopping: "I'm not a big fan of shopping, but I love little markets.",
  tech: 'I use my phone a lot, but I try to switch it off in the evening.',
  interview: "Good question! But today I'm the recruiter, so let's focus on you.",
  society: "I'm very interested in culture, especially museums and the theatre.",
};

/** Réponse d'Emma à une question de l'apprenant (« And you? », « What's your name? »). */
export function emmaAnswer(question: string | undefined, topicId: string): string {
  const q = question ?? '';
  for (const [re, a] of EMMA_FACTS) if (re.test(q)) return a;
  const like = q.match(/\bdo you (like|love|enjoy) ([a-z' ]{2,40})$/);
  if (like && !/\b(me|this|that|it)$/.test(like[2])) {
    const what = like[2].replace(/\byour\b/g, 'my').trim();
    return `Yes, I really ${like[1]} ${what}!`;
  }
  return PERSONA[topicId] ?? "That's a good question!";
}

/* ------------------------------ Temps du verbe ------------------------------ */

const PAST_Q = /\b(did you|last (week|weekend|year|summer|winter|month|night|time|holiday|holidays|trip|sunday|saturday)|yesterday|ago|when you were)\b/;
const PRESENT_MARKERS = /\b(usually|every|always|often|sometimes|never|now|today|nowadays|generally|normally|still|these days)\b/;
const PAST_OF: Record<string, string> = {
  go: 'went', eat: 'ate', take: 'took', see: 'saw', have: 'had', do: 'did', make: 'made', buy: 'bought', meet: 'met',
  drink: 'drank', come: 'came', leave: 'left', fly: 'flew', drive: 'drove', swim: 'swam', spend: 'spent', find: 'found',
  get: 'got', feel: 'felt', visit: 'visited', travel: 'travelled', stay: 'stayed', play: 'played', watch: 'watched',
  work: 'worked', live: 'lived', like: 'liked', love: 'loved', enjoy: 'enjoyed', try: 'tried', rent: 'rented',
  walk: 'walked', cook: 'cooked', study: 'studied', am: 'was', are: 'were', is: 'was', goes: 'went', has: 'had',
};

/**
 * La question porte sur le passé (« Where did you go last summer? ») mais l'apprenant répond
 * au présent (« I go to Spain ») : on propose le prétérit.
 */
export function tenseIssue(answer: string, question: string): Issue | null {
  if (!PAST_Q.test(normalize(question))) return null;
  if (PRESENT_MARKERS.test(normalize(answer))) return null;
  const re =
    /\b(I|we|they|you)\s+(go|eat|take|see|have|do|make|buy|meet|drink|come|leave|fly|drive|swim|spend|find|get|feel|visit|travel|stay|play|watch|work|live|like|love|enjoy|try|rent|walk|cook|study|am|are)\b(?!\s+(been|gone|seen|done|eaten|taken|had|got|visited|travelled|traveled|going|to\s+\w+ing|\w+ing\b))|\b(it|he|she|that|this|there)\s+(is|has|goes)\b(?!\s+(been|gone|had|got|\w+ing\b))/i;
  const m = answer.match(re);
  if (!m) return null;
  const subj = m[1] ?? m[4];
  const verb = (m[2] ?? m[5]).toLowerCase();
  const past = PAST_OF[verb];
  if (!past) return null;
  return {
    rule: 'past-tense',
    original: `${subj} ${m[2] ?? m[5]}`,
    suggestion: `${subj} ${past}`,
    explanation: 'La question porte sur le passé (*did*, *last…*, *ago*) : on répond au **prétérit** (I went, I ate, it was…).',
  };
}

/* ------------------------------ Analyse ------------------------------ */

export interface UnderstandContext {
  /** Question du plan en attente de réponse (débuts de réponse, vocabulaire). */
  question: TopicQuestion;
  /** Question réellement posée, si différente (le LLM formule les siennes). */
  asked?: string;
  topicId: string;
}

export function understand(text: string, ctx: UnderstandContext, sem?: SemanticSignal | null): Understanding {
  const raw = text.trim();
  const n = normalize(raw).replace(FILLERS, '').trim();
  const words = n ? n.split(' ').length : 0;
  const base = { asksBack: false, negative: isNegative(n), words, sim: sem?.sim } satisfies Partial<Understanding>;
  if (!n) return { ...base, intent: 'short' };

  const folded = fold(raw);
  if (looksFrench(raw)) {
    if (FR_DONT_KNOW.test(folded)) return { ...base, intent: 'dont-know' };
    if (FR_HOW_TO_SAY.test(folded)) return { ...base, intent: 'french', howToSay: true };
    if (FR_REPEAT.test(folded)) return { ...base, intent: 'repeat' };
    return { ...base, intent: 'french' };
  }
  if (words <= 8 && REPEAT_PATTERNS.some((re) => re.test(n))) return { ...base, intent: 'repeat' };
  if (DONT_KNOW.test(n)) return { ...base, intent: 'dont-know' };
  if (GOODBYE.test(n)) return { ...base, intent: 'goodbye' };
  if (GREETING.test(n)) return { ...base, intent: 'greeting' };
  if (THANKS.test(n)) return { ...base, intent: 'thanks' };

  const q = splitQuestion(raw);
  const restWords = q.rest ? q.rest.split(' ').filter(Boolean).length : 0;
  if (q.asks && restWords < 3) return { ...base, intent: 'question', asksBack: true, question: q.question };

  const askedText = ctx.asked ?? ctx.question.q;
  const typed = satisfiesType(askedText, raw) || satisfiesType(ctx.question.q, raw);
  const starter = usesStarter(ctx.question, raw);
  const detail = extractDetail(raw);
  const common = { ...base, asksBack: q.asks, question: q.question, detail };

  if (sem) {
    const short = words <= 3;
    const related = sem.sim >= OFF_TOPIC_SIM || starter || (short && (typed || sem.sim >= SHORT_OFF_TOPIC_SIM));
    if (!related) {
      const other =
        sem.other && sem.other.sim >= OTHER_TOPIC_SIM && sem.other.sim >= sem.sim + 0.2 ? sem.other.topicId : undefined;
      return { ...common, intent: 'off-topic', otherTopic: other };
    }
  }
  if (words <= 3 && !typed && !starter) return { ...common, intent: 'short' };
  return { ...common, intent: 'answer' };
}
