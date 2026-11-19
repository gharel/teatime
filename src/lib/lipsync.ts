/* ------------------------------------------------------------------
 * Synchronisation labiale.
 *  - Phonèmes IPA (fournis par Kokoro/eSpeak) -> visèmes.
 *  - Repli graphème -> visème pour les voix système (pas de phonèmes).
 *  - Timeline globale lue par l'avatar à chaque frame, modulée par
 *    l'enveloppe audio réelle (AnalyserNode) quand elle est disponible.
 * ------------------------------------------------------------------ */

export type Viseme =
  | 'rest' | 'MBP' | 'FV' | 'TH' | 'L' | 'DT' | 'SZ' | 'SH' | 'R' | 'W' | 'OH' | 'AA' | 'EE' | 'ER';

export interface MouthShape {
  open: number; // 0..1 ouverture verticale
  wide: number; // 0.6..1.25 largeur relative
  round: number; // 0..1 arrondi (lèvres en O)
  teeth: number; // 0..1 dents du haut visibles
  tongue: number; // 0..1 langue visible
}

export const VISEMES: Record<Viseme, MouthShape> = {
  rest: { open: 0.02, wide: 1, round: 0.1, teeth: 0, tongue: 0 },
  MBP: { open: 0, wide: 0.94, round: 0.05, teeth: 0, tongue: 0 },
  FV: { open: 0.14, wide: 1.02, round: 0.05, teeth: 1, tongue: 0 },
  TH: { open: 0.26, wide: 1, round: 0.1, teeth: 0.9, tongue: 1 },
  L: { open: 0.4, wide: 1, round: 0.15, teeth: 0.6, tongue: 0.8 },
  DT: { open: 0.24, wide: 1.04, round: 0.1, teeth: 0.9, tongue: 0.3 },
  SZ: { open: 0.12, wide: 1.1, round: 0, teeth: 1, tongue: 0 },
  SH: { open: 0.26, wide: 0.82, round: 0.65, teeth: 0.9, tongue: 0 },
  R: { open: 0.26, wide: 0.84, round: 0.55, teeth: 0.4, tongue: 0.1 },
  W: { open: 0.2, wide: 0.62, round: 1, teeth: 0, tongue: 0 },
  OH: { open: 0.56, wide: 0.76, round: 0.85, teeth: 0.2, tongue: 0.1 },
  AA: { open: 0.85, wide: 1.06, round: 0.2, teeth: 0.5, tongue: 0.25 },
  EE: { open: 0.34, wide: 1.2, round: 0, teeth: 0.85, tongue: 0.1 },
  ER: { open: 0.32, wide: 0.92, round: 0.35, teeth: 0.35, tongue: 0.15 },
};

export interface VisemeKey {
  v: Viseme;
  w: number; // poids relatif de durée
}

const IPA_MAP: Record<string, Viseme> = {
  p: 'MBP', b: 'MBP', m: 'MBP',
  f: 'FV', v: 'FV',
  θ: 'TH', ð: 'TH',
  l: 'L', ɫ: 'L',
  t: 'DT', d: 'DT', n: 'DT', ŋ: 'DT', k: 'DT', g: 'DT', ɡ: 'DT', h: 'DT', j: 'DT', x: 'DT', ʔ: 'DT', ɾ: 'DT',
  s: 'SZ', z: 'SZ',
  ʃ: 'SH', ʒ: 'SH', ʧ: 'SH', ʤ: 'SH',
  ɹ: 'R', r: 'R', ɝ: 'R', ɚ: 'ER',
  w: 'W', u: 'W', ʊ: 'W',
  o: 'OH', ɔ: 'OH', ɒ: 'OH', O: 'OH', Q: 'OH', Y: 'OH',
  a: 'AA', ɑ: 'AA', æ: 'AA', ʌ: 'AA', ɐ: 'AA', I: 'AA', W: 'AA',
  e: 'EE', ɛ: 'EE', ɪ: 'EE', i: 'EE', ᵻ: 'EE', A: 'EE',
  ə: 'ER', ɜ: 'ER', ᵊ: 'ER',
};

const VOWELS = new Set<Viseme>(['AA', 'EE', 'OH', 'W', 'ER']);

function weightOf(v: Viseme): number {
  if (VOWELS.has(v)) return 1;
  if (v === 'MBP' || v === 'DT') return 0.55;
  return 0.7;
}

/** Convertit une chaîne IPA (Kokoro) en suite de visèmes pondérés. */
export function ipaToVisemes(ipa: string): VisemeKey[] {
  const out: VisemeKey[] = [];
  for (const ch of ipa) {
    if (ch === 'ː') {
      const last = out[out.length - 1];
      if (last) last.w += 0.6;
      continue;
    }
    if (ch === ' ') {
      out.push({ v: 'rest', w: 0.15 });
      continue;
    }
    if (/[.,!?;:—…]/.test(ch)) {
      out.push({ v: 'rest', w: ch === ',' ? 0.9 : 1.4 });
      continue;
    }
    const v = IPA_MAP[ch];
    if (!v) continue; // accents ˈˌ, liaisons, etc.
    const last = out[out.length - 1];
    if (last && last.v === v) last.w += weightOf(v) * 0.6;
    else out.push({ v, w: weightOf(v) });
  }
  return out;
}

/** Approximation graphème -> visème pour les voix système (texte anglais). */
export function textToVisemes(text: string): VisemeKey[] {
  const out: VisemeKey[] = [];
  const push = (v: Viseme, w = weightOf(v)) => {
    const last = out[out.length - 1];
    if (last && last.v === v) last.w += w * 0.5;
    else out.push({ v, w });
  };
  const tokens = text.toLowerCase().split(/(\s+|[.,!?;:]+)/);
  for (const tok of tokens) {
    if (!tok) continue;
    if (/^\s+$/.test(tok)) {
      push('rest', 0.15);
      continue;
    }
    if (/^[.,!?;:]+$/.test(tok)) {
      push('rest', tok.includes(',') ? 0.9 : 1.4);
      continue;
    }
    let w = tok.replace(/[^a-z']/g, '');
    if (w.length > 3 && w.endsWith('e') && !/[aeiou]e$/.test(w)) w = w.slice(0, -1); // e muet
    w = w.replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/gh/g, '');
    for (let i = 0; i < w.length; i++) {
      const c = w[i];
      const d = w.slice(i, i + 2);
      if (d === 'th') { push('TH'); i++; continue; }
      if (d === 'sh' || d === 'ch') { push('SH'); i++; continue; }
      if (d === 'ph') { push('FV'); i++; continue; }
      if (d === 'wh') { push('W'); i++; continue; }
      if (d === 'oo') { push('W', 1.2); i++; continue; }
      if (d === 'ee' || d === 'ea' || d === 'ie' || d === 'ey' || d === 'ai' || d === 'ay') { push('EE', 1.2); i++; continue; }
      if (d === 'ou' || d === 'ow' || d === 'oa' || d === 'oe') { push('OH', 1.2); i++; continue; }
      if (d === 'ng' || d === 'ck') { push('DT'); i++; continue; }
      if (d === 'qu') { push('DT'); push('W'); i++; continue; }
      if (i > 0 && c === w[i - 1]) continue; // lettres doublées
      switch (c) {
        case 'a': push('AA'); break;
        case 'e': push('EE'); break;
        case 'i': push('EE'); break;
        case 'o': push('OH'); break;
        case 'u': push('ER'); break;
        case 'y': push(i === w.length - 1 ? 'EE' : 'DT'); break;
        case 'b': case 'm': case 'p': push('MBP'); break;
        case 'f': case 'v': push('FV'); break;
        case 'l': push('L'); break;
        case 'r': push('R'); break;
        case 'w': push('W'); break;
        case 's': case 'z': case 'x': push('SZ'); break;
        case 'c': push('eiy'.includes(w[i + 1] ?? '') ? 'SZ' : 'DT'); break;
        case 'j': push('SH'); break;
        case "'": break;
        default: push('DT');
      }
    }
  }
  return out;
}

/* ------------------------------ Timeline ------------------------------ */

interface Segment {
  start: number; // performance.now() ms
  end: number;
  keys: { v: Viseme; t0: number; t1: number }[];
}

class LipSyncBus {
  private segments: Segment[] = [];
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  /** Lissage de l'enveloppe audio. */
  private env = 0;

  /** Ajoute un segment (phrase) à jouer de `start` à `start + durationMs`. */
  schedule(keys: VisemeKey[], start: number, durationMs: number, leadMs = 40) {
    const total = keys.reduce((a, k) => a + k.w, 0) || 1;
    const usable = Math.max(50, durationMs - leadMs * 2);
    let t = start + leadMs;
    const out = keys.map((k) => {
      const d = (k.w / total) * usable;
      const seg = { v: k.v, t0: t, t1: t + d };
      t += d;
      return seg;
    });
    this.segments.push({ start, end: start + durationMs, keys: out });
    // purge des vieux segments
    const now = performance.now();
    this.segments = this.segments.filter((s) => s.end > now - 2000);
  }

  setAnalyser(a: AnalyserNode | null) {
    this.analyser = a;
    this.buf = a ? new Float32Array(new ArrayBuffer(a.fftSize * 4)) : null;
  }

  clear() {
    this.segments = [];
  }

  isSpeaking(now = performance.now()): boolean {
    return this.segments.some((s) => now >= s.start && now <= s.end);
  }

  /** Visème courant + intensité (0..1.2). */
  sample(now = performance.now()): { v: Viseme; next: Viseme; mix: number; intensity: number } {
    const seg = this.segments.find((s) => now >= s.start && now <= s.end);
    let intensity = 1;
    if (this.analyser && this.buf) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const rms = Math.sqrt(sum / this.buf.length);
      const target = Math.min(1.25, rms * 9);
      this.env += (target - this.env) * (target > this.env ? 0.6 : 0.25);
      intensity = this.env < 0.04 ? 0 : 0.45 + this.env * 0.7;
    }
    if (!seg) return { v: 'rest', next: 'rest', mix: 0, intensity: 0 };
    const i = seg.keys.findIndex((k) => now >= k.t0 && now < k.t1);
    if (i < 0) return { v: 'rest', next: 'rest', mix: 0, intensity };
    const k = seg.keys[i];
    const nxt = seg.keys[i + 1]?.v ?? 'rest';
    const p = (now - k.t0) / Math.max(1, k.t1 - k.t0);
    // co-articulation : on commence à aller vers le visème suivant sur le dernier tiers
    const mix = p > 0.66 ? (p - 0.66) / 0.34 : 0;
    return { v: k.v, next: nxt, mix, intensity };
  }
}

export const lipsync = new LipSyncBus();
if ((globalThis as { __ttsDebug?: boolean }).__ttsDebug) (globalThis as { __lipsync?: LipSyncBus }).__lipsync = lipsync;

export function lerpShape(a: MouthShape, b: MouthShape, t: number): MouthShape {
  return {
    open: a.open + (b.open - a.open) * t,
    wide: a.wide + (b.wide - a.wide) * t,
    round: a.round + (b.round - a.round) * t,
    teeth: a.teeth + (b.teeth - a.teeth) * t,
    tongue: a.tongue + (b.tongue - a.tongue) * t,
  };
}

/** Durée estimée (ms) d'un texte lu par une voix système, à vitesse `rate`. */
export function estimateSpeechMs(text: string, rate = 1): number {
  const chars = text.replace(/\s+/g, ' ').length;
  const pauses = (text.match(/[.,!?;:]/g) ?? []).length;
  return ((chars * 62 + pauses * 180) / rate) | 0;
}
