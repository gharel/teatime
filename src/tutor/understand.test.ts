import { afterEach, describe, expect, it, vi } from 'vitest';
import { emmaAnswer, extractDetail, looksFrench, tenseIssue, understand } from './understand';
import { TutorSession } from './engine';
import { semantic } from '../lib/semantic';
import { TOPICS } from '../data/topics';
import type { TopicQuestion } from '../types';

const travel = TOPICS.find((t) => t.id === 'travel')!;
const q = (text: string, starters: string[] = []): TopicQuestion => ({ q: text, starters });
const ctx = (text: string, starters: string[] = []) => ({ question: q(text, starters), topicId: 'travel' });
const WHERE = ctx('Where do you usually go on holiday?', ['I usually go to…', 'I often visit…']);

describe('compréhension : intentions', () => {
  it.each([
    ['Sorry, can you repeat?', 'repeat'],
    ["I don't understand", 'repeat'],
    ['What did you say?', 'repeat'],
    ["I don't know", 'dont-know'],
    ['Je ne sais pas', 'dont-know'],
    ["J'aime beaucoup la montagne avec mes enfants", 'french'],
    ['Bye Emma!', 'goodbye'],
    ['I have to go now', 'goodbye'],
    ['Hello!', 'greeting'],
    ['Thank you', 'thanks'],
    ['And you?', 'question'],
    ["What's your name?", 'question'],
    ['Hi Emma, how are you?', 'question'],
  ])('« %s » → %s', (text, intent) => {
    expect(understand(text, WHERE).intent).toBe(intent);
  });

  it("« again » dans une vraie réponse n'est pas une demande de répétition", () => {
    expect(understand('I want to go to Spain again next summer', WHERE).intent).toBe('answer');
  });

  it('repère la question retournée à Emma à la fin d’une réponse', () => {
    const u = understand('I usually go to Spain with my family, and you?', WHERE);
    expect(u.intent).toBe('answer');
    expect(u.asksBack).toBe(true);
    expect(u.detail).toBe('Spain with your family');
  });

  it('ne détecte pas le français dans une phrase anglaise', () => {
    expect(looksFrench('I like AI and robots')).toBe(false);
    expect(looksFrench('Je suis allé à Paris')).toBe(true);
  });
});

describe('compréhension : pertinence (signal sémantique)', () => {
  it('hors sujet quand la réponse est éloignée de la question', () => {
    const u = understand('I like pizza and my dog is called Max.', WHERE, { sim: 0.18 });
    expect(u.intent).toBe('off-topic');
    expect(u.otherTopic).toBeUndefined();
  });
  it("repère l'autre thème évoqué quand il est net", () => {
    const u = understand('My favourite food is pasta with tomato sauce', WHERE, { sim: 0.17, other: { topicId: 'food', sim: 0.68 } });
    expect(u.intent).toBe('off-topic');
    expect(u.otherTopic).toBe('food');
  });
  it('accepte une réponse pertinente', () => {
    expect(understand('I usually go to Spain with my family.', WHERE, { sim: 0.53 }).intent).toBe('answer');
    expect(understand('I stay at home, I do not have money', WHERE, { sim: 0.3 }).intent).toBe('answer');
  });
  it('accepte les réponses courtes du bon type malgré une similarité faible', () => {
    expect(understand('Japan', WHERE, { sim: 0.11 }).intent).toBe('answer');
    expect(understand('By train', ctx('How did you travel there?'), { sim: 0.2 }).intent).toBe('answer');
    expect(understand('Yes!', ctx('Do you like travelling?'), { sim: 0.05 }).intent).toBe('answer');
  });
  it('rejette une réponse courte sans rapport', () => {
    expect(understand('I like blue', ctx('How did you travel there?'), { sim: -0.03 }).intent).toBe('off-topic');
  });
  it('sans modèle sémantique, ne conclut jamais « hors sujet »', () => {
    expect(understand('My computer is broken and I need a new one', WHERE).intent).toBe('answer');
  });
  it('repère une réponse négative', () => {
    expect(understand('No, not really.', ctx('Do you like travelling?')).negative).toBe(true);
  });
});

describe('compréhension : détails et temps', () => {
  it.each([
    ['I love playing football with my friends.', 'playing football with your friends'],
    ['Last summer I went to Barcelona.', 'Barcelona'],
    ['My favourite dish is lasagna.', 'lasagna'],
    ['I am a nurse.', 'a nurse'],
    ['It was great, we stayed near Lyon.', 'Lyon'],
  ])('détail de « %s »', (text, detail) => {
    expect(extractDetail(text)).toBe(detail);
  });

  it('propose le prétérit quand la question porte sur le passé', () => {
    expect(tenseIssue('I go to Spain with my friends', 'Where did you go on your last holiday?')?.suggestion).toBe('I went');
    expect(tenseIssue('It is very beautiful', 'How was your trip last summer?')?.suggestion).toBe('It was');
    expect(tenseIssue('I usually go to Spain', 'Where did you go on your last holiday?')).toBeNull();
    expect(tenseIssue('I am going to Spain', 'Where did you go last summer?')).toBeNull();
    expect(tenseIssue('I go to Spain', 'Where do you usually go on holiday?')).toBeNull();
  });

  it('Emma répond aux questions qu’on lui pose', () => {
    expect(emmaAnswer('what is your name', 'travel')).toMatch(/Emma/);
    expect(emmaAnswer('and you', 'food')).toMatch(/curry/);
    expect(emmaAnswer('do you like your city', 'travel')).toBe('Yes, I really like my city!');
    expect(emmaAnswer('what do you do', 'travel')).toMatch(/English teacher/);
  });
});

/* ------------------------------ Conversation (mode scripté) ------------------------------ */

/** Simule le modèle sémantique : chaque phrase reçoit le vecteur indiqué (2 dimensions suffisent). */
function fakeSemantic(vectors: Record<string, number[]>, fallback = [0, 1]) {
  semantic.status = { status: 'ready', progress: 1 };
  const vec = (t: string) => Float32Array.from(vectors[t] ?? fallback);
  vi.spyOn(semantic, 'embed').mockImplementation(async (texts: string[]) => texts.map(vec));
  vi.spyOn(semantic, 'vector').mockImplementation((t: string) => (vectors[t] ? Float32Array.from(vectors[t]) : undefined));
}

async function say(s: TutorSession, text: string) {
  const r = await s.respond(text, () => undefined);
  return r;
}

describe('Emma comprend ce que dit l’apprenant (mode scripté)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    semantic.status = { status: 'idle', progress: 0 };
  });

  it('dit ce qu’elle a entendu puis repose sa question si la réponse est hors sujet, et change de question la 2e fois', async () => {
    fakeSemantic({ 'My computer is broken': [1, 0], 'I need a new phone': [1, 0] });
    const s = new TutorSession(travel, 'A2', '');
    const first = s.opening().reply;
    expect(first).toMatch(/Do you like travelling\?/);
    const r1 = await say(s, 'My computer is broken');
    expect(r1.reply).toMatch(/I heard: "My computer is broken"/);
    expect(r1.reply).toMatch(/Do you like travelling\?/);
    expect(s.qIndex).toBe(1);
    const r2 = await say(s, 'I need a new phone');
    expect(r2.reply).toMatch(/another question|something else/);
    expect(r2.reply).toMatch(/Where do you usually go on holiday\?/);
  });

  it('suit l’apprenant qui parle d’un autre thème, puis revient au plan', async () => {
    const food = TOPICS.find((t) => t.id === 'food')!;
    const vectors: Record<string, number[]> = { 'My favourite food is pasta with tomato sauce': [1, 0, 0] };
    // Une question « nourriture » proche de ce qu'il dit, les autres pas : Emma pose la plus proche non répondue.
    // (la question 0 est celle à laquelle il vient de répondre : Emma ne la pose pas)
    food.questions.A.forEach((fq, i) => (vectors[fq.q] = i === 0 ? [1, 0, 0] : i === 1 ? [0.4, Math.sqrt(0.84), 0] : [0, 0, 1]));
    fakeSemantic(vectors, [0, 0, 1]);
    const s = new TutorSession(travel, 'A2', '');
    s.opening();
    const r1 = await say(s, 'My favourite food is pasta with tomato sauce');
    expect(r1.reply).toMatch(/talking about food/);
    expect(r1.reply).toContain(food.questions.A[1].q);
    expect(s.awaitingQuestion().q).toBe(food.questions.A[1].q);
    vectors['I eat at home'] = [0.4, Math.sqrt(0.84), 0];
    const r2 = await say(s, 'I eat at home');
    expect(r2.reply).toMatch(/back to travel\. Do you like travelling\?/);
  });

  it('répond quand on lui pose une question, puis repose la sienne', async () => {
    const s = new TutorSession(travel, 'A2', '');
    s.opening();
    const r = await say(s, "What's your name?");
    expect(r.reply).toMatch(/I'm Emma/);
    expect(r.reply).toMatch(/Do you like travelling\?$/);
  });

  it('reprend un détail de la réponse et corrige le temps du verbe', async () => {
    const s = new TutorSession(travel, 'A2', '');
    s.opening();
    await say(s, 'Yes, I love it!'); // → Where do you usually go on holiday?
    await say(s, 'I usually go to the mountains.'); // → Do you prefer the sea or the mountains?
    await say(s, 'I prefer the sea.'); // → Where did you go on your last holiday?
    expect(s.lastQuestionText()).toBe('Where did you go on your last holiday?');
    const r = await say(s, 'I go to Italy with my sister.');
    expect(r.correction?.corrected).toBe('I went to Italy with my sister.');
    expect(r.reply).toMatch(/^Italy with your sister\?/);
  });

  it('répète la question, en français ou en anglais', async () => {
    const s = new TutorSession(travel, 'A2', '');
    s.opening();
    expect((await say(s, 'Sorry, can you repeat?')).reply).toBe('Of course! Do you like travelling?');
    expect((await say(s, 'Je ne comprends pas')).reply).toBe('Of course! Do you like travelling?');
    expect(s.qIndex).toBe(1);
  });

  it('termine la conversation quand l’apprenant dit au revoir', async () => {
    const s = new TutorSession(travel, 'B1', '');
    s.opening();
    expect((await say(s, 'Goodbye Emma')).ended).toBe(true);
  });

  it('ne pose pas une question à laquelle l’apprenant a déjà répondu', async () => {
    const plan = travel.questions.A;
    // Un axe par question du plan ; les questions 3 et 4 partagent l'axe 9.
    const axis = (...idx: number[]) => Array.from({ length: 10 }, (_, k) => (idx.includes(k) ? 1 / Math.sqrt(idx.length) : 0));
    const vectors: Record<string, number[]> = {};
    plan.forEach((pq, i) => (vectors[pq.q] = axis(i === 3 || i === 4 ? 9 : i)));
    // Répond un peu à 0 (0,45) et surtout à 3 (« last holiday ») et 4 (« how did you travel ») : 0,89.
    vectors['Last summer I went to Italy by plane'] = axis().map((_, k) => (k === 0 ? 0.45 : k === 9 ? Math.sqrt(1 - 0.45 ** 2) : 0));
    vectors['I go to the seaside'] = axis(1, 8);
    vectors['The sea'] = axis(2, 8);
    fakeSemantic(vectors, axis());
    const s = new TutorSession(travel, 'A2', '');
    s.opening();
    await say(s, 'Last summer I went to Italy by plane');
    expect(s.awaitingQuestion().q).toBe(plan[1].q);
    await say(s, 'I go to the seaside');
    const r = await say(s, 'The sea');
    expect(r.reply).toContain(plan[5].q);
  });

  it('ne saute pas une question simplement voisine de la réponse donnée', async () => {
    const plan = travel.questions.A;
    // « Yes, I love travelling » colle à 0 (0,81) et ressemble à 6 (« photos when you travel », ≈ 0,74).
    const v6 = [0.2, Math.sqrt(1 - 0.2 ** 2), 0];
    fakeSemantic({ [plan[0].q]: [1, 0, 0], [plan[6].q]: v6, 'Yes, I love travelling a lot': [0.81, 0.586, 0] }, [0, 0, 1]);
    const s = new TutorSession(travel, 'A2', '');
    s.opening();
    for (const t of ['Yes, I love travelling a lot', 'Brittany', 'The sea', 'Italy', 'By car', 'Pizza']) await say(s, t);
    expect(s.awaitingQuestion().q).toBe(plan[6].q);
  });
});
