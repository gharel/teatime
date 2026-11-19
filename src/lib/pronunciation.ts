/* ------------------------------------------------------------------
 * Analyse de prononciation (logique pure, sans modèle) :
 *  - phonèmes ATTENDUS : transcription du texte reconnu (eSpeak, en-US) ;
 *  - phonèmes ENTENDUS : modèle acoustique wav2vec2 « espeak » (sans
 *    modèle de langue, il ne « corrige » pas : il entend vraiment l'accent) ;
 *  - alignement pondéré (distance phonétique) puis repérage des erreurs
 *    typiques des francophones, mot par mot, avec un conseil en français.
 * ------------------------------------------------------------------ */

export type Severity = 'major' | 'minor';

export interface PronIssue {
  id: string; // ex. 'th', 'h', 'r'
  label: string; // ex. « Le son TH /θ/ »
  tip: string; // conseil en français
  severity: Severity;
}

export interface WordAssessment {
  word: string;
  expected: string; // IPA attendu (lisible)
  heard: string; // IPA entendu
  issues: PronIssue[];
  /** 0..1, 1 = conforme */
  score: number;
}

export interface PronResult {
  words: WordAssessment[];
  /** Score global 0..100 */
  score: number;
  heard: string;
}

/* ------------------------------ Tokenisation ------------------------------ */

const VOWEL_CHARS = 'aeiouyæɑɒɔəɚɛɜɝɪʊʌøœɐɨʉɯɤ';
const MULTI = ['aɪɚ', 'aɪə', 'ɑːɹ', 'ɔːɹ', 'oːɹ', 'iː', 'uː', 'ɑː', 'ɔː', 'ɜː', 'oː', 'eː', 'aː', 'yː', 'øː', 'ɛː', 'aɪ', 'eɪ', 'oʊ', 'əʊ', 'aʊ', 'ɔɪ', 'dʒ', 'tʃ', 'ɛɹ', 'ɪɹ', 'ʊɹ', 'əl', 'ɔ̃', 'ɑ̃', 'ɛ̃', 'œ̃', 'ɐ̃', 'l̩', 'n̩'];

/** Décompose / normalise un symbole en phonèmes comparables. */
function normalizeToken(t: string): string[] {
  switch (t) {
    case 'ɚ':
    case 'ɝ':
      return ['ə', 'ɹ'];
    case 'aɪɚ':
      return ['aɪ', 'ə', 'ɹ'];
    case 'aɪə':
      return ['aɪ', 'ə'];
    case 'ɑːɹ':
      return ['ɑː', 'ɹ'];
    case 'ɔːɹ':
      return ['ɔː', 'ɹ'];
    case 'oːɹ':
      return ['oː', 'ɹ'];
    case 'ɛɹ':
      return ['ɛ', 'ɹ'];
    case 'ɪɹ':
      return ['ɪ', 'ɹ'];
    case 'ʊɹ':
      return ['ʊ', 'ɹ'];
    case 'əl':
    case 'l̩':
      return ['ə', 'l'];
    case 'n̩':
      return ['ə', 'n'];
    case 'əʊ':
      return ['oʊ'];
    case 'ᵻ':
      return ['ɪ'];
    case 'ɐ':
      return ['ə'];
    case 'g':
      return ['ɡ'];
    case 'ɫ':
      return ['l'];
    case 'ɜ':
      return ['ɜː'];
    default:
      return [t];
  }
}

/** Découpe une transcription IPA eSpeak (sans espaces) en phonèmes normalisés. */
export function tokenizeIpa(ipa: string): string[] {
  const s = ipa.replace(/[ˈˌ‿\-.]/g, '').trim();
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === ' ') {
      i++;
      continue;
    }
    const m = MULTI.find((x) => s.startsWith(x, i));
    let tok: string;
    if (m) tok = m;
    else {
      // caractère + diacritiques combinants éventuels (ex. nasalisation ̃)
      tok = s[i];
      while (i + tok.length < s.length && /[̀-ͯ]/.test(s[i + tok.length])) tok += s[i + tok.length];
    }
    i += tok.length;
    out.push(...normalizeToken(tok));
  }
  return out;
}

/** Normalise une suite de symboles sortie par le modèle (déjà séparés). */
export function normalizeHeard(tokens: string[]): string[] {
  return tokens.flatMap((t) => (t.length > 1 && !MULTI.includes(t) && !/[̀-ͯ]/.test(t) ? tokenizeIpa(t) : normalizeToken(t)));
}

export function isVowel(p: string): boolean {
  return VOWEL_CHARS.includes(p[0]);
}

const NASAL_VOWELS = new Set(['ɔ̃', 'ɑ̃', 'ɛ̃', 'œ̃', 'ɐ̃']);
const FRENCH_VOWELS = new Set(['y', 'yː', 'ø', 'øː', 'œ']);
const R_FRENCH = new Set(['ʁ', 'r', 'ʀ', 'χ', 'ɣ', 'ɾ̃']);

/* Variantes d'accent jugées équivalentes (coût faible, pas d'erreur). */
const EQUIV: string[][] = [
  ['ə', 'ʌ', 'ɜː', 'ɪ', 'ʊ'], // voyelles réduites
  ['ɑ', 'ɑː', 'ɒ', 'ɔ', 'ɔː', 'a', 'aː'],
  ['t', 'ɾ', 'ʔ', 'd'],
  ['oʊ', 'oː', 'o'],
  ['eɪ', 'eː', 'e'],
  ['i', 'iː'],
  ['u', 'uː'],
  ['ɛ', 'e', 'ɛː'],
  ['ɹ', 'ɻ'],
];
function equivalent(a: string, b: string): boolean {
  return EQUIV.some((g) => g.includes(a) && g.includes(b));
}

function subCost(a: string, b: string): number {
  if (a === b) return 0;
  if (equivalent(a, b)) return 0.25;
  const va = isVowel(a);
  const vb = isVowel(b);
  if (va && vb) return 0.6;
  if (!va && !vb) return 0.75;
  return 1.3;
}

interface Op {
  e: number | null; // index attendu
  h: number | null; // index entendu
}

/** Alignement de Needleman-Wunsch pondéré. */
export function alignPhonemes(exp: string[], heard: string[]): Op[] {
  const n = exp.length;
  const m = heard.length;
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const del = (p: string) => (isVowel(p) ? 0.7 : 0.85);
  for (let i = 1; i <= n; i++) D[i][0] = D[i - 1][0] + del(exp[i - 1]);
  for (let j = 1; j <= m; j++) D[0][j] = D[0][j - 1] + del(heard[j - 1]);
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      D[i][j] = Math.min(D[i - 1][j - 1] + subCost(exp[i - 1], heard[j - 1]), D[i - 1][j] + del(exp[i - 1]), D[i][j - 1] + del(heard[j - 1]));
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(D[i][j] - (D[i - 1][j - 1] + subCost(exp[i - 1], heard[j - 1]))) < 1e-9) {
      ops.push({ e: i - 1, h: j - 1 });
      i--;
      j--;
    } else if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + del(exp[i - 1]))) < 1e-9) {
      ops.push({ e: i - 1, h: null });
      i--;
    } else {
      ops.push({ e: null, h: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}

/* ------------------------------ Diagnostic ------------------------------ */

export const ISSUES: Record<string, Omit<PronIssue, 'severity'> & { severity: Severity }> = {
  th: { id: 'th', label: 'Le son TH /θ/', tip: 'Placez la pointe de la langue entre les dents et soufflez (think, three).', severity: 'major' },
  dh: { id: 'dh', label: 'Le TH voisé /ð/', tip: 'Langue entre les dents en faisant vibrer la voix (the, this, mother) — ni « z » ni « d ».', severity: 'major' },
  h: { id: 'h', label: 'Le H aspiré', tip: 'Expirez comme pour faire de la buée sur une vitre (house, have, hello).', severity: 'major' },
  r: { id: 'r', label: 'Le R anglais', tip: 'Pas de R de gorge : la langue recule sans rien toucher, lèvres légèrement arrondies (red, very).', severity: 'major' },
  nasal: { id: 'nasal', label: 'Voyelle nasale', tip: 'L’anglais n’a pas de « on/an/in » : prononcez la voyelle puis le N ou le M séparément (to, going, man).', severity: 'major' },
  frvowel: { id: 'frvowel', label: 'Voyelle française (u, eu)', tip: 'Les sons « u » et « eu » n’existent pas en anglais : visez /uː/ (food), /ʌ/ (but) ou /ɜː/ (bird).', severity: 'major' },
  ih: { id: 'ih', label: 'Le i court /ɪ/', tip: 'Plus bref et plus relâché que le « i » français : ship ≠ sheep, live ≠ leave.', severity: 'minor' },
  ii: { id: 'ii', label: 'Le i long /iː/', tip: 'Étirez les lèvres et allongez le son : sheep, leave, see.', severity: 'minor' },
  ae: { id: 'ae', label: 'Le son /æ/', tip: 'Entre « a » et « è », bouche bien ouverte : cat, bad, Japan.', severity: 'minor' },
  uh: { id: 'uh', label: 'Le son /ʌ/', tip: 'Un « a » bref et neutre, bouche détendue : but, summer, love.', severity: 'minor' },
  w: { id: 'w', label: 'Le son /w/', tip: 'Arrondissez les lèvres comme pour « ou » : would, water — pas de « v ».', severity: 'major' },
  dj: { id: 'dj', label: 'Le son /dʒ/', tip: 'Un « d » collé au « j » : job, Japan, enjoy.', severity: 'minor' },
  ch: { id: 'ch', label: 'Le son /tʃ/', tip: '« tch » : cheese, watch, teacher.', severity: 'minor' },
  ng: { id: 'ng', label: 'Le son -ing /ŋ/', tip: 'Son nasal au fond de la bouche, sans faire entendre de « g » : singing, long.', severity: 'minor' },
  diph: { id: 'diph', label: 'Diphtongue', tip: 'Faites glisser la voyelle : day = « dé-i », go = « gô-ou », my = « ma-i ».', severity: 'minor' },
  final: { id: 'final', label: 'Consonne finale', tip: 'Faites entendre la dernière consonne du mot (like, five, stop, his).', severity: 'minor' },
  far: { id: 'far', label: 'Prononciation éloignée', tip: 'Écoutez le modèle puis répétez lentement, syllabe par syllabe.', severity: 'major' },
};

const FUNCTION_WORDS = new Set(
  'a an the to of and or for at in on is are was were be been it i you he she we they my your his her our their me him us them do does did have has had can could will would shall should that this these those but so as with from by not there here am im its'.split(
    ' ',
  ),
);

/** Repère le type d'erreur d'une substitution / omission attendu → entendu. */
function classify(exp: string | null, heard: string | null, isLastOfWord: boolean): string | null {
  if (exp === 'θ' && heard !== 'θ') return 'th';
  if (exp === 'ð' && heard !== 'ð' && heard !== 'θ') return 'dh';
  if (exp === 'h' && heard === null) return 'h';
  if (exp === 'ɹ' && heard && R_FRENCH.has(heard)) return 'r';
  if (heard && NASAL_VOWELS.has(heard)) return 'nasal';
  if (heard && FRENCH_VOWELS.has(heard) && exp !== heard) return 'frvowel';
  if (exp === 'w' && (heard === 'v' || heard === 'ɥ')) return 'w';
  if (exp === 'ɪ' && (heard === 'i' || heard === 'iː')) return 'ih';
  if (exp === 'iː' && heard === 'ɪ') return 'ii';
  if (exp === 'æ' && heard && ['a', 'aː', 'ɛ', 'e', 'ɑ'].includes(heard)) return 'ae';
  if (exp === 'ʌ' && heard && ['ɔ', 'o', 'ø', 'œ', 'ɑ'].includes(heard)) return 'uh';
  if (exp === 'dʒ' && heard === 'ʒ') return 'dj';
  if (exp === 'tʃ' && heard === 'ʃ') return 'ch';
  if (exp === 'ŋ' && heard === 'n') return 'ng';
  if (exp && ['eɪ', 'oʊ', 'aɪ', 'aʊ'].includes(exp) && heard && !['eɪ', 'oʊ', 'aɪ', 'aʊ'].includes(heard) && isVowel(heard) && !equivalent(exp, heard))
    return 'diph';
  // t/d finaux souvent non relâchés ou élidés même chez les natifs (next time) : non signalés.
  if (exp && heard === null && isLastOfWord && !isVowel(exp) && !['ɹ', 't', 'd'].includes(exp)) return 'final';
  return null;
}

const MINOR_IDS = new Set(['ih', 'ii', 'ae', 'uh', 'dj', 'ch', 'ng', 'diph', 'final']);

/**
 * Compare mot par mot.
 * @param words       mots affichés (transcription)
 * @param expectedIpa IPA attendu pour chaque mot (même longueur que words)
 * @param heardTokens symboles entendus (sortie du modèle acoustique)
 */
export function assess(words: string[], expectedIpa: string[], heardTokens: string[]): PronResult {
  const exp: { p: string; w: number; last: boolean }[] = [];
  expectedIpa.forEach((ipa, w) => {
    const toks = tokenizeIpa(ipa);
    toks.forEach((p, k) => exp.push({ p, w, last: k === toks.length - 1 }));
  });
  const heard = normalizeHeard(heardTokens);
  const ops = alignPhonemes(
    exp.map((x) => x.p),
    heard,
  );
  const perWord = words.map(() => ({ heard: [] as string[], cost: 0, n: 0, issues: new Map<string, PronIssue>() }));
  let lastW = 0;
  let totalCost = 0;
  for (const op of ops) {
    if (op.e !== null) {
      const x = exp[op.e];
      lastW = x.w;
      const wd = perWord[x.w];
      wd.n++;
      const h = op.h !== null ? heard[op.h] : null;
      if (h) wd.heard.push(h);
      const c = h === null ? (isVowel(x.p) ? 0.7 : 0.85) : subCost(x.p, h);
      wd.cost += c;
      totalCost += c;
      const id = classify(x.p, h, x.last);
      if (id) wd.issues.set(id, ISSUES[id]);
    } else if (op.h !== null) {
      const h = heard[op.h];
      const wd = perWord[lastW];
      wd.heard.push(h);
      const c = isVowel(h) ? 0.5 : 0.6;
      wd.cost += c;
      totalCost += c;
      const id = classify(null, h, false);
      if (id) wd.issues.set(id, ISSUES[id]);
    }
  }
  const result: WordAssessment[] = words.map((word, i) => {
    const wd = perWord[i];
    const norm = word.toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '');
    const fn = FUNCTION_WORDS.has(norm);
    const per = wd.n ? wd.cost / wd.n : 0;
    let issues = [...wd.issues.values()];
    // Mots grammaticaux : prononciation réduite normale, on ne garde que les erreurs de consonnes typiques.
    if (fn) issues = issues.filter((x) => ['th', 'dh', 'h', 'r', 'nasal', 'w', 'frvowel'].includes(x.id));
    if (!fn && per > 0.55 && !issues.some((x) => x.severity === 'major')) issues.push(ISSUES.far);
    // Une seule erreur mineure isolée sur un mot court : tolérée (variation d'accent).
    if (issues.length === 1 && MINOR_IDS.has(issues[0].id) && wd.n <= 3) issues = [];
    return {
      word,
      expected: tokenizeIpa(expectedIpa[i]).join(''),
      heard: wd.heard.join(''),
      issues,
      score: Math.max(0, 1 - per),
    };
  });
  const score = exp.length ? Math.round(Math.max(0, 1 - totalCost / exp.length) * 100) : 100;
  return { words: result, score, heard: heard.join(' ') };
}

/** Découpe une transcription en mots affichables (en gardant la ponctuation collée). */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
}
