/* Normalisation et comparaison de réponses (saisie et reconnaissance vocale). */

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, 'can not'],
  [/\bcannot\b/g, 'can not'],
  [/\bwon't\b/g, 'will not'],
  [/\bshan't\b/g, 'shall not'],
  [/\bain't\b/g, 'is not'],
  [/\blet's\b/g, 'let us'],
  [/\bi'm\b/g, 'i am'],
  [/\b(it|he|she|that|there|what|who|where|here|how)'s\b/g, '$1 is'],
  [/n't\b/g, ' not'],
  [/'re\b/g, ' are'],
  [/'ve\b/g, ' have'],
  [/'ll\b/g, ' will'],
  [/'d\b/g, ' would'],
];

const SMALL_NUMBERS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberToWords(n: number): string {
  if (n < 20) return SMALL_NUMBERS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + SMALL_NUMBERS[n % 10] : '');
  if (n < 1000) {
    const rest = n % 100;
    return SMALL_NUMBERS[Math.floor(n / 100)] + ' hundred' + (rest ? ' and ' + numberToWords(rest) : '');
  }
  return String(n);
}

/** Minuscules, apostrophes droites, contractions développées, ponctuation retirée, nombres en lettres. */
export function normalize(s: string): string {
  let t = s
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/-/g, ' ');
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  t = t
    .replace(/\b(\d{1,3})\b/g, (_, d: string) => numberToWords(parseInt(d, 10)))
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/'(?![a-z])|(?<![a-z])'/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

export function words(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

export function levenshtein<T>(a: ArrayLike<T>, b: ArrayLike<T>): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

export type MatchResult = 'correct' | 'typo' | 'wrong';

/** Compare une saisie à une liste de réponses acceptées, avec tolérance aux fautes de frappe. */
export function checkAnswer(input: string, answers: string[]): { result: MatchResult; best: string } {
  const ni = normalize(input);
  if (!ni) return { result: 'wrong', best: answers[0] ?? '' };
  let best = answers[0] ?? '';
  let bestDist = Infinity;
  for (const a of answers) {
    const na = normalize(a);
    if (na === ni) return { result: 'correct', best: a };
    const d = levenshtein(ni, na);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  const len = normalize(best).length;
  // 1 faute pour 8 caractères, max 2 ; jamais de tolérance sur les mots très courts.
  const tolerance = len >= 16 ? 2 : len >= 6 ? 1 : 0;
  if (bestDist <= tolerance) {
    // Une faute qui change un mot grammatical (is/are, a/an, has/have) n'est pas une faute de frappe.
    const wi = ni.split(' ');
    const wa = normalize(best).split(' ');
    if (wi.length === wa.length) {
      const diffs = wi.filter((w, i) => w !== wa[i]);
      const grammatical = new Set(['a', 'an', 'is', 'are', 'was', 'were', 'has', 'have', 'do', 'does', 'did', 'in', 'on', 'at', 'to', 'for', 'of', 'the', 'he', 'she', 'his', 'her']);
      if (diffs.some((w) => grammatical.has(w) || w.length <= 2)) return { result: 'wrong', best };
    }
    return { result: 'typo', best };
  }
  return { result: 'wrong', best };
}

export interface WordDiff {
  word: string;
  ok: boolean;
}

/**
 * Score de similarité 0..1 entre une phrase cible et une transcription (prononciation).
 * Retourne aussi, pour chaque mot de la cible, s'il a été reconnu.
 */
export function speechScore(target: string, heard: string): { score: number; diff: WordDiff[] } {
  const t = words(target);
  const h = words(heard);
  if (!t.length) return { score: 0, diff: [] };
  // Alignement LCS mot à mot, avec tolérance d'1 lettre sur les mots longs.
  const eq = (a: string, b: string) => a === b || (a.length > 6 && levenshtein(a, b) <= 1);
  const dp: number[][] = Array.from({ length: t.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = t.length - 1; i >= 0; i--)
    for (let j = h.length - 1; j >= 0; j--)
      dp[i][j] = eq(t[i], h[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ok = new Array(t.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < t.length && j < h.length) {
    if (eq(t[i], h[j])) {
      ok[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const matched = ok.filter(Boolean).length;
  const extra = Math.max(0, h.length - matched);
  const score = Math.max(0, (matched - extra * 0.25) / t.length);
  // Re-découpe la cible d'origine (avec ponctuation) pour l'affichage.
  const display = target.split(/\s+/).filter(Boolean);
  const diff: WordDiff[] =
    display.length === t.length ? display.map((w, k) => ({ word: w, ok: ok[k] })) : t.map((w, k) => ({ word: w, ok: ok[k] }));
  return { score: Math.min(1, score), diff };
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick<T>(arr: T[], rand: () => number = Math.random): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** PRNG déterministe (mulberry32) pour les quêtes du jour. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Découpe un texte en phrases (pour la synthèse vocale en flux). */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]+["')\]]*|[^.!?…]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}
