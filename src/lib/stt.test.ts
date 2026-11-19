import { describe, expect, it } from 'vitest';
import { cleanWhisperText, collapseRepeats, mergeTranscript, resampleTo16k, webSpeechText } from './stt';

function sine(freq: number, rate: number, seconds: number): Float32Array {
  const n = Math.round(rate * seconds);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.sin((2 * Math.PI * freq * i) / rate);
  return a;
}

/** Valeur efficace en ignorant les bords (effets de fenêtre). */
function rms(a: Float32Array): number {
  const from = Math.floor(a.length * 0.1);
  const to = Math.floor(a.length * 0.9);
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / (to - from));
}

describe('ré-échantillonnage vers 16 kHz', () => {
  it.each([48000, 44100])('garde la voix intacte depuis %i Hz', (rate) => {
    const out = resampleTo16k([sine(1000, rate, 0.5)], rate);
    expect(out.length).toBe(8000);
    expect(rms(out)).toBeGreaterThan(0.68);
    expect(rms(out)).toBeLessThan(0.73);
  });
  it.each([48000, 44100])('supprime les aigus au-delà de 8 kHz (pas de repliement) depuis %i Hz', (rate) => {
    // Une interpolation linéaire replie ce 12 kHz vers 4 kHz avec une amplitude d'environ 0,2.
    expect(rms(resampleTo16k([sine(12000, rate, 0.5)], rate))).toBeLessThan(0.03);
  });
  it('accepte des blocs de tailles variées', () => {
    const s = sine(500, 48000, 0.3);
    const out = resampleTo16k([s.subarray(0, 1000), s.subarray(1000, 5000), s.subarray(5000)], 48000);
    expect(out.length).toBe(4800);
    expect(rms(out)).toBeGreaterThan(0.68);
  });
});

describe('transcriptions', () => {
  it('fusionne les résultats cumulatifs de Chrome Android sans doublons', () => {
    expect(mergeTranscript('I like', 'I like cats')).toBe('I like cats');
    expect(mergeTranscript('I like cats', 'like cats')).toBe('I like cats');
    expect(mergeTranscript('I like cats', 'and dogs')).toBe('I like cats and dogs');
    expect(mergeTranscript('hello', 'Hello')).toBe('Hello');
    expect(mergeTranscript('I went to the shop', 'the shop to buy bread')).toBe('I went to the shop to buy bread');
  });

  it('reconstruit le texte depuis la liste complète des résultats', () => {
    const r = (transcript: string, isFinal: boolean) => Object.assign([{ transcript }], { isFinal });
    // Android : résultats cumulatifs, tous finaux
    expect(webSpeechText([r('I', true), r('I like', true), r('I like cats', true)])).toBe('I like cats');
    // Ordinateur : morceaux successifs + résultat intermédiaire
    expect(webSpeechText([r('I like cats', true), r('and dogs', true), r('they are', false)])).toBe('I like cats and dogs they are');
    // Android : l'intermédiaire reprend le final
    expect(webSpeechText([r('I usually go', true), r('I usually go to Spain', false)])).toBe('I usually go to Spain');
  });

  it('nettoie les boucles et hallucinations de Whisper', () => {
    expect(collapseRepeats('I like it. I like it. I like it.')).toBe('I like it.');
    expect(collapseRepeats('It is very very good')).toBe('It is very very good');
    expect(cleanWhisperText(' Thank you. ')).toBe('');
    expect(cleanWhisperText('[MUSIC] I go to the beach. I go to the beach. I go to the beach.')).toBe('I go to the beach.');
  });
});
