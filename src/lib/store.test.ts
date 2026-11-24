import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stockage du navigateur simulé : le store lit et écrit localStorage.
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
});
const store = await import('./store');

/** Un apprenant qui a déjà tout utilisé : test de niveau, leçon, révisions, Emma, jeux, réglages. */
function learner() {
  store.resetAll();
  store.setName('Tom');
  store.savePlacement({
    date: '2026-11-20',
    level: 'B1',
    theta: 3.2,
    nextProgress: 0.4,
    bySkill: { grammar: { correct: 5, total: 8 }, vocabulary: { correct: 6, total: 8 }, reading: { correct: 4, total: 7 }, listening: { correct: 5, total: 7 } },
    correct: 20,
    total: 30,
  });
  store.saveUnitProgress('a1-u1', 95);
  store.addSrsCards([
    { id: 'v:a1-u1:cat', kind: 'vocab', front: 'cat', back: 'chat' },
    { id: 'p:went', kind: 'phrase', front: 'I go yesterday', back: 'I went yesterday' },
  ]);
  store.saveBest('chrono', 25);
  store.reward({
    xp: 120,
    day: { lessons: 1, perfect: 1, reviews: 60, tutorTurns: 12, games: 6, speakOk: 11 },
    totals: { lessons: 1, perfect: 1, exercises: 10, correct: 9, reviews: 60, tutorTurns: 12, tutorSeconds: 600, corrections: 3, games: 6, speakOk: 11 },
    topic: 'travel',
  });
  store.updateSettings({ theme: 'dark', speechRate: 1.1 });
}

const today = () => store.getState().days[store.dayKey()];
const badges = () => Object.keys(store.getState().badges).sort();

describe('effacement par rubrique', () => {
  beforeEach(learner);

  it('efface les révisions et Emma, garde le prénom, le niveau et le reste', () => {
    expect(badges()).toEqual(['chat-10', 'first-lesson', 'games-5', 'perfect', 'placement', 'reviews-50', 'speak-10', 'speed-20', 'xp-100']);
    store.resetSections(['reviews', 'tutor']);
    const s = store.getState();
    expect(s.profile).toMatchObject({ name: 'Tom', level: 'B1', onboarded: true });
    expect(s.profile.placements).toHaveLength(1);
    expect(s.srs).toEqual({});
    expect(s.totals).toMatchObject({ reviews: 0, tutorTurns: 0, tutorSeconds: 0, corrections: 0, speakOk: 0, topics: {} });
    expect(today()).toMatchObject({ reviews: 0, tutorTurns: 0, speakOk: 0, lessons: 1, games: 6, xp: 120 });
    // Gardé : parcours, jeux, points, réglages.
    expect(Object.keys(s.units)).toEqual(['a1-u1']);
    expect(s.totals).toMatchObject({ lessons: 1, games: 6 });
    expect(s.bests).toEqual({ chrono: 25 });
    expect(s.xp).toBe(120);
    expect(s.settings).toMatchObject({ theme: 'dark', speechRate: 1.1 });
    // Badges des données effacées retirés, les autres gardés.
    expect(badges()).toEqual(['first-lesson', 'games-5', 'perfect', 'placement', 'speed-20', 'xp-100']);
  });

  it('profil et niveau : retour au test de départ, le reste gardé', () => {
    store.resetSections(['profile']);
    const s = store.getState();
    expect(s.profile).toEqual({ name: '', level: null, dailyGoal: 50, onboarded: false, placements: [] });
    expect(Object.keys(s.srs)).toHaveLength(2);
    expect(s.totals.tutorTurns).toBe(12);
    expect(badges()).not.toContain('placement');
    expect(badges()).toContain('chat-10');
  });

  it('parcours, jeux, points, réglages', () => {
    store.resetSections(['path', 'games']);
    let s = store.getState();
    expect(s.units).toEqual({});
    expect(s.bests).toEqual({});
    expect(s.totals).toMatchObject({ lessons: 0, perfect: 0, exercises: 0, correct: 0, games: 0, reviews: 60 });
    expect(badges()).toEqual(['chat-10', 'placement', 'reviews-50', 'speak-10', 'xp-100']);

    store.resetSections(['rewards', 'settings']);
    s = store.getState();
    expect(s.xp).toBe(0);
    expect(s.days).toEqual({});
    expect(s.streak).toEqual({ current: 0, best: 0, lastDay: null, freezes: 1 });
    expect(s.badges).toEqual({});
    expect(s.settings).toEqual(store.DEFAULT_SETTINGS);
    expect(s.profile.name).toBe('Tom');
  });

  it('sans rubrique choisie : rien ne change', () => {
    const before = store.getState();
    store.resetSections([]);
    expect(store.getState()).toBe(before);
  });
});
