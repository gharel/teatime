/* ------------------------------------------------------------------
 * Piper (VITS, MIT) — voix « LJSpeech » (données du domaine public) :
 * voix neuronale légère, ≈ 4× moins de paramètres que Kokoro. Elle se
 * calcule plus vite qu'elle ne se parle même sur un vieux téléphone, et
 * sa sortie passe par Web Audio : contrairement à la voix du système,
 * elle reste audible en mode silencieux sur iPhone.
 *
 * Fonctions pures (testées) : texte -> phonèmes eSpeak -> identifiants.
 * ------------------------------------------------------------------ */

const PIPER_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/medium/en_US-ljspeech-medium';

export const PIPER_VOICE = {
  id: 'en_US-ljspeech-medium',
  label: 'Linda (américaine)',
  model: `${PIPER_BASE}.onnx`,
  config: `${PIPER_BASE}.onnx.json`,
  /** Taille du modèle, pour l'affichage. */
  mb: 64,
};

export const PIPER_CACHE = 'teatime-piper';

export interface PiperConfig {
  audio: { sample_rate: number };
  espeak?: { voice?: string };
  inference?: { noise_scale?: number; length_scale?: number; noise_w?: number };
  phoneme_id_map: Record<string, number[]>;
  num_speakers?: number;
}

/** Ponctuation gardée telle quelle (Piper l'a apprise : pauses, intonation des questions). */
const PUNCT_RUN = /(\s*[;:,.!?¡¿—–…"«»“”(){}[\]]+\s*)+/g;

/** Normalise la ponctuation d'un segment pour le vocabulaire de Piper. */
export function piperPunctuation(seg: string): string {
  const out = seg
    .replace(/[—–]/g, ',')
    .replace(/…/g, '.')
    .replace(/[¡¿"«»“”(){}[\]]/g, '')
    .replace(/\s+/g, ' ');
  // Pas d'espace avant une ponctuation, une espace après (sauf en fin de phrase).
  return out.replace(/^\s+/, '');
}

/** Découpe un texte en morceaux à phonémiser et en ponctuation (gardée telle quelle). */
export function splitForPhonemes(text: string): { text: string; punct: boolean }[] {
  const parts: { text: string; punct: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(PUNCT_RUN)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i), punct: false });
    if (m[0].length) parts.push({ text: m[0], punct: true });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), punct: false });
  return parts;
}

/** Nettoyage du texte avant phonémisation (guillemets typographiques, espaces). */
export function piperText(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phonèmes (chaîne IPA d'eSpeak) -> identifiants du modèle, comme piper-phonemize :
 * « ^ » au début, « _ » (pause) après chaque phonème, « $ » à la fin. Les caractères
 * inconnus du modèle sont ignorés.
 */
export function piperPhonemeIds(phonemes: string, map: Record<string, number[]>): { ids: number[]; unknown: number } {
  const pad = map['_']?.[0] ?? 0;
  const ids: number[] = [...(map['^'] ?? [1]), pad];
  let unknown = 0;
  for (const ch of phonemes.normalize('NFD')) {
    const v = map[ch];
    if (!v) {
      unknown++;
      continue;
    }
    ids.push(...v, pad);
  }
  ids.push(...(map['$'] ?? [2]));
  return { ids, unknown };
}

/** Ramène le pic du signal à `peak` (Piper normalise ainsi chaque phrase). */
export function normalizePeak(audio: Float32Array, peak = 0.9): Float32Array {
  let max = 0;
  for (let i = 0; i < audio.length; i++) {
    const a = Math.abs(audio[i]);
    if (a > max) max = a;
  }
  if (max < 1e-4) return audio;
  const g = peak / max;
  for (let i = 0; i < audio.length; i++) audio[i] *= g;
  return audio;
}

/** Abréviations suivies d'un point qui ne terminent pas la phrase. */
const ABBREVIATION = /(?:^|[\s(])(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|approx|e\.g|i\.e|a\.m|p\.m|U\.S|U\.K|No)\.$/i;

/**
 * Découpe un texte en phrases (Piper calcule une phrase à la fois : moins de mémoire, et Emma
 * commence à parler dès la première). Les points des nombres (3.5), des abréviations (Mr., e.g.)
 * et toute ponctuation suivie d'une minuscule ne coupent pas.
 */
export function splitSentences(text: string): string[] {
  const s = text.replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '.' && c !== '!' && c !== '?' && c !== '…') continue;
    let j = i + 1;
    while (j < s.length && /[.!?…"'”’)\]]/.test(s[j])) j++;
    // Pas d'espace après : nombre (3.5), sigle (U.S.A) ou fin de texte.
    if (j < s.length && s[j] !== ' ') continue;
    const sentence = s.slice(start, j).trim();
    if (j < s.length) {
      if (c === '.' && ABBREVIATION.test(sentence)) continue;
      // Suite en minuscule : la phrase continue (« approx. ten », « well… maybe », « "Really?" she asked »).
      if (/^[a-z]/.test(s.slice(j + 1))) continue;
    }
    if (sentence) out.push(sentence);
    start = j;
    i = j - 1;
  }
  const rest = s.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * Découpe une phrase longue à la ponctuation intérieure (virgule, point-virgule, deux-points, tiret) :
 * chaque morceau est une inférence Piper plus courte, donc un tas WASM qui grandit moins (sur iPhone,
 * une phrase de 58 caractères le faisait passer de 172 à 207 Mo juste avant que la page soit tuée).
 * Les morceaux trop courts (< `min`) sont recollés à leur voisin ; sans ponctuation, la phrase reste entière.
 */
export function splitLongSentence(sentence: string, max = 40, min = 12): string[] {
  const s = sentence.trim();
  if (!s) return [];
  if (s.length <= max) return [s];
  const parts = s
    .replace(/([,;:—–])\s+/g, '$1\u0000')
    .split('\u0000')
    .filter(Boolean);
  if (parts.length < 2) return [s];
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (!cur) cur = p;
    else if (cur.length < min || cur.length + 1 + p.length <= max) cur += ` ${p}`;
    else {
      out.push(cur);
      cur = p;
    }
  }
  if (cur.length < min && out.length) out[out.length - 1] += ` ${cur}`;
  else if (cur) out.push(cur);
  return out;
}
