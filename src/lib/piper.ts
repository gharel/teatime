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
