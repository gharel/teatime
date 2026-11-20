import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanTranslation, ReplyGuard, TutorSession } from './engine';
import { looksFrench, understand } from './understand';
import { llm, type ChatMessage, type GenerateOptions } from '../lib/llm';
import { semantic } from '../lib/semantic';
import { TOPICS } from '../data/topics';

const food = TOPICS.find((t) => t.id === 'food')!;

/** Monologue réellement produit par le modèle local quand l'apprenant a changé de sujet. */
const MONOLOGUE =
  'A new person is in the conversation! I think you meant to name the male in the conversation, not a different name. ' +
  'Who is in the conversation, and who is in the "k" (kITCHEN) I can ask. Is it you, or the other boy? ' +
  'As for you, I heard you said a boy is in the kitchn. Is that true? Are you going to the k? ' +
  '(If the learner is not in the k, I will ask a different, more appropriate, and simpler, question, for an A2 learner) ' +
  '(If the kid is in the k, I will ask the next, more appropriate, and simpler, 2nd level, 3A1, 1st level, 2nd level or 2nd level, question)';

/** Simule le LLM : renvoie `out` mot par mot (en flux), et retient les messages reçus. */
function fakeLLM(...outs: string[]) {
  llm.status = { status: 'ready', progress: 1 };
  const calls: ChatMessage[][] = [];
  vi.spyOn(llm, 'generate').mockImplementation(async (messages: ChatMessage[], opts: GenerateOptions = {}) => {
    calls.push(messages);
    const out = outs[Math.min(calls.length - 1, outs.length - 1)];
    let full = '';
    for (const tok of out.split(/(?<= )/)) {
      if (opts.signal?.aborted) break;
      full += tok;
      opts.onToken?.(tok, full);
    }
    return full;
  });
  return calls;
}

/** L'apprenant ne répond pas à la question (similarité nulle avec elle). */
function offTopicSemantic() {
  semantic.status = { status: 'ready', progress: 1 };
  vi.spyOn(semantic, 'embed').mockImplementation(async (texts: string[]) => texts.map((_, i) => Float32Array.from(i === 0 ? [1, 0] : [0, 1])));
  vi.spyOn(semantic, 'vector').mockImplementation(() => undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
  llm.status = { status: 'idle', progress: 0 };
  semantic.status = { status: 'idle', progress: 0 };
});

describe('garde-fou des réponses du modèle', () => {
  it('coupe le monologue : quelques phrases, sans apartés ni méta-discours', () => {
    const g = new ReplyGuard('A', true);
    const said = MONOLOGUE.match(/[^.!?]+[.!?]+|[^.!?]+$/g)!.map((s) => g.push(s.trim())).filter(Boolean);
    expect(said.length).toBeLessThanOrEqual(2);
    expect(g.stopped).toBe(true);
    expect(g.text).not.toMatch(/learner|A2|level|\(/i);
  });

  it('s’arrête après la question qui relance, mais pas après un simple « Really? »', () => {
    const g = new ReplyGuard('B');
    expect(g.push('Oh, really?')).toBe('Oh, really?');
    expect(g.stopped).toBe(false);
    expect(g.push('What do you like to cook?')).toBe('What do you like to cook?');
    expect(g.stopped).toBe(true);
    expect(g.push('And do you like pizza?')).toBeNull();
  });

  it('écarte une phrase qui commente la conversation et retire les parenthèses', () => {
    const g = new ReplyGuard('B');
    expect(g.push('The learner is talking about pasta.')).toBeNull();
    expect(g.push('Pasta is great (I love it).')).toBe('Pasta is great.');
  });
});

describe('Emma avec le modèle local', () => {
  it('changement de sujet : réponse courte qui repose sa question, même si le modèle part en monologue', async () => {
    offTopicSemantic();
    const calls = fakeLLM(`CORRECTION: NONE\nEXPLICATION: NONE\nREPLY: ${MONOLOGUE}`);
    const s = new TutorSession(food, 'A2', 'Guillaume');
    s.opening();
    const said: string[] = [];
    const r = await s.respond('Brian is in the kitchen.', (x) => said.push(x));
    expect(r.reply.split(/\s+/).length).toBeLessThanOrEqual(45);
    expect(r.reply).not.toMatch(/learner|A2|level|\(/i);
    expect(r.reply).toMatch(/What is your favourite food\?$/);
    expect(said.join(' ')).toBe(r.reply);
    // Consigne simple et sans alternative, séparée du message de l'apprenant
    const last = calls[0].at(-1)!.content;
    expect(last).toMatch(/^Brian is in the kitchen\./);
    expect(last).toMatch(/ask your question again: "What is your favourite food\?"/);
  });

  it('réponse inutilisable : Emma dit ce qu’elle a entendu et repose sa question', async () => {
    offTopicSemantic();
    fakeLLM('(If the learner is not in the kitchen, I will ask a simpler question for an A2 learner)');
    const s = new TutorSession(food, 'A2', '');
    s.opening();
    const r = await s.respond('Brian is in the kitchen.', () => undefined);
    expect(r.reply).toMatch(/I heard: "Brian is in the kitchen"/);
    expect(r.reply).toMatch(/What is your favourite food\?/);
  });

  it('en français : Emma donne la phrase en anglais à redire', async () => {
    const calls = fakeLLM("I'm not sure I understand the question.");
    const s = new TutorSession(food, 'A2', '');
    s.opening();
    const r = await s.respond('Je ne suis pas sûr de bien comprendre la question.', () => undefined);
    expect(calls[0][0].content).toMatch(/Translate/);
    expect(r.correction).toMatchObject({ translation: true, corrected: "I'm not sure I understand the question." });
    expect(r.reply).toMatch(/In English, (you can|we) say: "I'm not sure I understand the question\."/);
    // La question en attente reste celle d'Emma : la phrase redite en anglais y sera comparée.
    expect(s.lastQuestionText()).toBe('What is your favourite food?');
  });

  it('« Comment on dit… ? » : Emma répond puis repose sa question', async () => {
    fakeLLM('kitchen');
    const s = new TutorSession(food, 'A2', '');
    s.opening();
    const r = await s.respond('Comment on dit cuisine en anglais ?', () => undefined);
    expect(r.reply).toMatch(/say: "kitchen" What is your favourite food\?$/);
  });

  it('traduction inutilisable : Emma demande de dire la phrase en anglais (mode scripté)', async () => {
    fakeLLM('Je ne sais pas.');
    const s = new TutorSession(food, 'A2', '');
    s.opening();
    const r = await s.respond('J’aime beaucoup les pâtes avec ma famille', () => undefined);
    expect(r.correction).toBeNull();
    expect(r.reply).toMatch(/English/);
  });
});

describe('français ou anglais ?', () => {
  it.each([
    'Je ne suis pas sûr de bien comprendre',
    'Brian est dans la cuisine',
    "C'est un plat de ma grand-mère",
    'Oui, je veux bien',
  ])('« %s » est du français', (t) => expect(looksFrench(t)).toBe(true));

  it.each(['Brian is in the kitchen.', "I'd like to go to La Rochelle", "It's a nice day, isn't it?", "I don't know what to say"])(
    '« %s » est de l’anglais',
    (t) => expect(looksFrench(t)).toBe(false),
  );

  it('repère « comment on dit… en anglais »', () => {
    const ctx = { question: { q: 'What is your favourite food?', starters: [] }, topicId: 'food' };
    expect(understand('Comment on dit cuisine en anglais ?', ctx).howToSay).toBe(true);
    expect(understand('Ça veut dire quoi ?', ctx).howToSay).toBe(true);
    expect(understand("J'aime les pâtes", ctx).howToSay).toBeUndefined();
  });

  it('nettoie la traduction du modèle', () => {
    expect(cleanTranslation('Translation: "I love pasta."')).toBe('I love pasta.');
    expect(cleanTranslation("Here is the translation: I'm hungry.\nNote: informal.")).toBe("I'm hungry.");
    expect(cleanTranslation('Je ne sais pas.')).toBe('');
    expect(cleanTranslation('')).toBe('');
  });
});
