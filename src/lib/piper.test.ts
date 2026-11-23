import { describe, expect, it } from 'vitest';
import { normalizePeak, piperPhonemeIds, piperPunctuation, piperText, splitForPhonemes, splitSentences } from './piper';

const MAP: Record<string, number[]> = {
  _: [0],
  '^': [1],
  $: [2],
  ' ': [3],
  '!': [4],
  ',': [8],
  '.': [10],
  '?': [13],
  h: [20],
  a: [14],
  ɪ: [74],
  ˈ: [120],
  ç: [40],
};

describe('Piper : phonèmes -> identifiants', () => {
  it('encadre par ^ et $ et intercale la pause _ après chaque phonème', () => {
    expect(piperPhonemeIds('hˈaɪ!', MAP)).toEqual({ ids: [1, 0, 20, 0, 120, 0, 14, 0, 74, 0, 4, 0, 2], unknown: 0 });
  });

  it('ignore les caractères inconnus du modèle', () => {
    expect(piperPhonemeIds('h"a', MAP)).toEqual({ ids: [1, 0, 20, 0, 14, 0, 2], unknown: 1 });
  });

  it('décompose les caractères accentués (NFD), comme piper-phonemize', () => {
    // « ç » précomposé devient « c » + cédille combinante : ni l'un ni l'autre ne sont dans MAP ici.
    expect(piperPhonemeIds('ç', MAP).unknown).toBe(2);
  });
});

describe('Piper : préparation du texte', () => {
  it('sépare la ponctuation des morceaux à phonémiser', () => {
    expect(splitForPhonemes("Hi! I'm Emma, nice to meet you.")).toEqual([
      { text: 'Hi', punct: false },
      { text: '! ', punct: true },
      { text: "I'm Emma", punct: false },
      { text: ', ', punct: true },
      { text: 'nice to meet you', punct: false },
      { text: '.', punct: true },
    ]);
  });

  it('ramène tirets, points de suspension et guillemets au vocabulaire du modèle', () => {
    expect(piperPunctuation(' — ')).toBe(', ');
    expect(piperPunctuation('…')).toBe('.');
    expect(piperPunctuation(' "')).toBe('');
    expect(piperPunctuation('?" ')).toBe('? ');
  });

  it('normalise apostrophes typographiques et espaces', () => {
    expect(piperText('  I’m   fine ')).toBe("I'm fine");
  });

  it('normalise le pic du signal', () => {
    const a = normalizePeak(Float32Array.from([0.1, -0.2, 0.05]), 0.9);
    expect(Math.max(...Array.from(a, Math.abs))).toBeCloseTo(0.9, 5);
    // Silence : laissé tel quel (pas de division par zéro).
    expect(Array.from(normalizePeak(new Float32Array(3)))).toEqual([0, 0, 0]);
  });
});

describe('Piper : découpage en phrases', () => {
  it('coupe aux fins de phrase', () => {
    expect(splitSentences('Hello Tom! How are you? I am fine.')).toEqual(['Hello Tom!', 'How are you?', 'I am fine.']);
  });
  it('garde les nombres, abréviations et suites en minuscule', () => {
    expect(splitSentences('It costs 3.50 pounds. Ask Mr. Smith, e.g. tomorrow.')).toEqual([
      'It costs 3.50 pounds.',
      'Ask Mr. Smith, e.g. tomorrow.',
    ]);
    expect(splitSentences('Well… maybe. "Really?" she asked.')).toEqual(['Well… maybe.', '"Really?" she asked.']);
  });
  it('garde un texte sans ponctuation finale', () => {
    expect(splitSentences('  Nice to meet you  ')).toEqual(['Nice to meet you']);
    expect(splitSentences('')).toEqual([]);
  });
});
