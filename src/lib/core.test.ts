import { describe, expect, it } from 'vitest';
import { checkText } from './corrector';
import { checkAnswer, normalize, speechScore } from './text';
import { finalLevel, initCat, nextQuestion, pCorrect, TEST_LENGTH, update, levelIndex } from './placement';
import { ipaToVisemes, textToVisemes } from './lipsync';
import { PLACEMENT_BANK } from '../data/placement';
import { ALL_UNITS } from '../data/lessons';
import { TOPICS } from '../data/topics';
import { seeded } from './text';

describe('normalisation des réponses', () => {
  it('développe les contractions et ignore la ponctuation', () => {
    expect(normalize("I'm  happy!")).toBe('i am happy');
    expect(normalize("She doesn't know.")).toBe('she does not know');
    expect(normalize('I can’t')).toBe('i can not');
    expect(normalize('I am 25')).toBe('i am twenty five');
  });
  it('accepte une faute de frappe mais pas une faute de grammaire', () => {
    expect(checkAnswer('beautifull', ['beautiful']).result).toBe('typo');
    expect(checkAnswer('She are happy', ['She is happy']).result).toBe('wrong');
    expect(checkAnswer("I'm happy", ['I am happy']).result).toBe('correct');
    expect(checkAnswer("my father's car", ["my father's car"]).result).toBe('correct');
  });
  it('score de prononciation', () => {
    expect(speechScore('I think it is three', 'i think it is three').score).toBe(1);
    const r = speechScore('I think it is three', 'I sink it is tree');
    expect(r.score).toBeLessThan(0.8);
    expect(r.diff.filter((d) => !d.ok).map((d) => d.word)).toEqual(['think', 'three']);
  });
});

describe('correcteur des fautes de francophones', () => {
  const fix = (s: string) => checkText(s).corrected;
  it.each([
    ['I have 25 years.', 'I am 25 years old.'],
    ['My son has five years old.', 'My son is five years old.'],
    ['I live here since three years.', 'I live here for three years.'],
    ['I am agree with you.', 'I agree with you.'],
    ["I'm not agree.", "I don't agree."],
    ['It depends of the weather.', 'It depends on the weather.'],
    ['Can you explain me?', 'Can you explain to me?'],
    ['I must to go.', 'I must go.'],
    ['She work in a bank.', 'She works in a bank.'],
    ['He have a car.', 'He has a car.'],
    ["He don't like it.", "He doesn't like it."],
    ['I need some informations.', 'I need some information.'],
    ['People is nice.', 'People are nice.'],
    ['It is more better.', 'It is better.'],
    ['My car is more big than yours.', 'My car is bigger than yours.'],
    ['If I will have time, I call you.', 'If I have time, I call you.'],
    ['I want that you come.', 'I want you to come.'],
    ['I made a photo.', 'I took a photo.'],
    ['I like to make sport.', 'I like to do sport.'],
    ['I listen music.', 'I listen to music.'],
    ['Did you went there?', 'Did you go there?'],
    ['I have been to London yesterday.', 'I went to London yesterday.'],
    ['Yesterday I have went to Rome with my wife.', 'Yesterday I went to Rome with my wife.'],
    ['I have never saw this film.', 'I have never seen this film.'],
    ["I haven't went there.", "I haven't gone there."],
    ['I would like to go in Japan.', 'I would like to go to Japan.'],
    ['She has wrote a book.', 'She has written a book.'],
    ['Last week, we have visited a museum.', 'Last week, we visited a museum.'],
    ['I have hungry.', 'I am hungry.'],
    ['I am interesting in art.', 'I am interested in art.'],
    ['The life is beautiful.', 'Life is beautiful.'],
    ['I go to the work by foot.', 'I go to work on foot.'],
    ['i think so', 'I think so'],
    ['I ate a apple.', 'I ate an apple.'],
  ])('%s → %s', (input, expected) => {
    expect(fix(input)).toBe(expected);
  });
  it.each([
    'Does she like coffee?',
    'I have two years of experience.',
    "I don't know if he will come.",
    'She can speak English.',
    'He likes music.',
    'There is some news.',
    'I went to the school to pick up my son.',
    'The music is too loud.',
    'There are more young people here.',
    'I study at a university.',
    'Let it go.',
    'Explain her idea to me.',
    'What I did was wrong.',
    'I live in Paris.',
    'We went in the morning.',
  ])('ne corrige pas une phrase correcte : %s', (input) => {
    expect(checkText(input).issues).toEqual([]);
  });
});

describe('test de niveau adaptatif', () => {
  it('la banque contient 12 questions par niveau, réponses valides', () => {
    for (const lv of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
      expect(PLACEMENT_BANK.filter((q) => q.level === lv)).toHaveLength(12);
    }
    for (const q of PLACEMENT_BANK) {
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
    }
  });

  // Simule des apprenants « parfaits » de chaque niveau répondant selon le modèle.
  it.each([1, 2, 3, 4, 5, 6])('retrouve le niveau d’un apprenant simulé de niveau %i', (trueLevel) => {
    let hits = 0;
    const runs = 60;
    const rand = seeded(trueLevel * 999);
    for (let r = 0; r < runs; r++) {
      let st = initCat(2.5);
      for (let i = 0; i < TEST_LENGTH; i++) {
        const q = nextQuestion(st, PLACEMENT_BANK, rand)!;
        const p = pCorrect(trueLevel + 0.3, levelIndex(q.level), 1 / q.options.length);
        st = update(st, q, rand() < p);
      }
      const f = finalLevel(st);
      if (Math.abs(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(f.level) + 1 - trueLevel) <= 1) hits++;
    }
    expect(hits / runs).toBeGreaterThan(0.85);
  });
});

describe('contenus', () => {
  it('24 unités, ids uniques, exercices valides', () => {
    expect(ALL_UNITS).toHaveLength(24);
    const ids = new Set<string>();
    for (const u of ALL_UNITS) {
      for (const e of u.exercises) {
        expect(ids.has(e.id)).toBe(false);
        ids.add(e.id);
        if (e.type === 'gap') expect(e.prompt.split('___').length).toBe(2);
        if (e.type === 'mcq') expect(e.answer).toBeLessThan(e.options.length);
        if (e.type === 'listen' && e.options) expect(e.answer!).toBeLessThan(e.options.length);
      }
    }
  });
  it('10 thèmes de conversation × 3 niveaux', () => {
    expect(TOPICS).toHaveLength(10);
    for (const t of TOPICS) for (const b of ['A', 'B', 'C'] as const) expect(t.questions[b].length).toBeGreaterThanOrEqual(6);
  });
});

describe('synchronisation labiale', () => {
  it('convertit les phonèmes IPA en visèmes', () => {
    const v = ipaToVisemes('θɪŋk').map((k) => k.v);
    expect(v).toEqual(['TH', 'EE', 'DT']);
    expect(ipaToVisemes('mˈɑːm')[1].w).toBeGreaterThan(1);
  });
  it('approxime les visèmes depuis le texte', () => {
    const v = textToVisemes('Thank you').map((k) => k.v);
    expect(v[0]).toBe('TH');
    expect(v).toContain('AA');
  });
});

import { assess, tokenizeIpa } from './pronunciation';

describe('analyse de prononciation', () => {
  it('découpe et normalise l’IPA d’eSpeak', () => {
    expect(tokenizeIpa('sˈʌmɚ')).toEqual(['s', 'ʌ', 'm', 'ə', 'ɹ']);
    expect(tokenizeIpa('dʒəpˈæn')).toEqual(['dʒ', 'ə', 'p', 'æ', 'n']);
    expect(tokenizeIpa('θˈɪŋk')).toEqual(['θ', 'ɪ', 'ŋ', 'k']);
  });

  // Cas réel : phrase lue avec un fort accent français, transcrite par Whisper comme correcte.
  const words = ['I', 'would', 'like', 'to', 'travel', 'to', 'Japan', 'next', 'summer.'];
  const expected = 'aɪ wʊd lˈaɪk tə tɹˈævəl tə dʒəpˈæn nˈɛkst sˈʌmɚ'.split(' ');
  const heard = 'i w y l v l a j k t ɔ̃ t ʁ a v y l t ɔ̃ ʒ a p a l n ɛ k s t ə s ə m œ ʁ'.split(' ');
  const r = assess(words, expected, heard);
  const ids = (w: string) => r.words.find((x) => x.word === w)!.issues.map((i) => i.id);

  it('repère les erreurs typiques des francophones', () => {
    expect(ids('travel')).toContain('r');
    expect(ids('summer.')).toEqual(expect.arrayContaining(['r', 'frvowel']));
    expect(ids('to')).toContain('nasal');
    expect(ids('would')).toContain('frvowel');
    expect(ids('Japan')).toContain('dj');
  });

  it('ne signale pas un mot bien prononcé', () => {
    expect(ids('next')).toEqual([]);
    expect(r.score).toBeLessThan(80);
  });

  it('une prononciation native obtient un bon score', () => {
    const native = assess(words, expected, 'aɪ w ʊ d l aɪ k t ə t ɹ æ v əl t ə dʒ ə p æ n n ɛ k s t s ʌ m ɚ'.split(' '));
    expect(native.words.every((w) => w.issues.length === 0)).toBe(true);
    expect(native.score).toBeGreaterThan(90);
  });

  it('TH prononcé S et H muet', () => {
    const t = assess(['I', 'think', 'house'], ['aɪ', 'θˈɪŋk', 'hˈaʊs'], 'aɪ s ɪ ŋ k aʊ s'.split(' '));
    expect(t.words[1].issues.map((i) => i.id)).toContain('th');
    expect(t.words[2].issues.map((i) => i.id)).toContain('h');
  });
});
