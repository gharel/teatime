/* ------------------------------------------------------------------
 * Moteur pédagogique de la prof Emma.
 *  - Ouverture et plan de conversation à partir des questions du thème.
 *  - Correction : règles « francophones » (instantané) + LLM (si dispo).
 *  - Stratégie de correction de prof : reformulation (recast) orale
 *    courte + explication écrite en français.
 *  - Sortie en flux : chaque phrase de la réponse est envoyée à la
 *    synthèse vocale dès qu'elle est complète (latence minimale).
 * ------------------------------------------------------------------ */
import type { Level, TopicQuestion, TutorTopic } from '../types';
import { checkText, type Issue } from '../lib/corrector';
import { llm, type ChatMessage } from '../lib/llm';
import { normalize, pick, speechScore, splitSentences } from '../lib/text';

export type Band = 'A' | 'B' | 'C';

export function bandOf(level: Level): Band {
  return level[0] as Band;
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
  issues: Issue[];
}

export interface TutorReply {
  correction: Correction | null;
  /** Ce que la prof dit (correction orale + réponse). */
  spoken: string[];
  /** Réponse affichée (sans la phrase de correction). */
  reply: string;
  ended?: boolean;
}

const TOPIC_EN: Record<string, string> = {
  travel: 'travel and holidays',
  work: 'work and professional life',
  personal: 'personal life, family and friends',
  food: 'food, cooking and restaurants',
  hobbies: 'hobbies and free time',
  health: 'health and well-being',
  shopping: 'shopping and money',
  tech: 'technology and social media',
  interview: 'a job interview in English (you play the recruiter)',
  society: 'culture, society and current issues',
};

const LEVEL_STYLE: Record<Band, string> = {
  A: 'Use very simple, common words and short sentences (present simple, past simple, can, going to). Never use idioms. Keep each sentence under 12 words.',
  B: 'Use clear, everyday English with a few useful expressions. Keep sentences reasonably short.',
  C: 'Use rich, natural and idiomatic English, as you would with a fluent speaker. You may challenge their ideas.',
};

const ACKS: Record<Band, string[]> = {
  A: ['Great!', 'Very good!', 'Nice!', 'Oh, nice!', 'Cool!', 'Thank you!', 'Interesting!', 'Good answer!'],
  B: ['That’s interesting!', 'I see what you mean.', 'Thanks for sharing that.', 'Oh, really? Nice.', 'Good point!', 'That makes sense.'],
  C: ['That’s a thoughtful answer.', 'Fair point.', 'I hadn’t thought of it that way.', 'That’s a nuanced view.', 'Fascinating.', 'Well put.'],
};

const CORRECTION_INTRO: Record<Band, string[]> = {
  A: ['Good try, we say:', 'Nearly, we say:', 'Small correction, we say:'],
  B: ['Just a small correction, you can say:', 'Nearly! A more natural way is:', 'Quick correction:'],
  C: ['One small thing, you could say:', 'Just to polish that:', 'A more accurate way to put it:'],
};

const REPEAT_RE = /\b(repeat|again|pardon|sorry\??$|slow(er|ly)?|didn'?t (understand|get)|don'?t (understand|get)|what did you say|come again)\b/i;
const DONT_KNOW_RE = /^(i )?(don'?t|do not) know\.?$|^no idea|^i'?m not sure\.?$|^i have no idea/i;

export class TutorSession {
  readonly band: Band;
  readonly questions: TopicQuestion[];
  qIndex = 0;
  history: ChatMessage[] = [];
  private askedFollowUp = false;
  lastSpoken = '';

  constructor(
    readonly topic: TutorTopic,
    readonly level: Level,
    readonly learnerName: string,
  ) {
    this.band = bandOf(level);
    this.questions = topic.questions[this.band];
  }

  get currentQuestion(): TopicQuestion | undefined {
    return this.questions[Math.min(this.qIndex, this.questions.length - 1)];
  }

  get finished(): boolean {
    return this.qIndex >= this.questions.length;
  }

  systemPrompt(): string {
    const plan = this.questions.map((q, i) => `${i + 1}. ${q.q}`).join('\n');
    const maxWords = this.band === 'A' ? 30 : this.band === 'B' ? 45 : 55;
    return [
      `You are Emma, a warm, encouraging and patient English teacher from London. You are having a spoken (voice) conversation with ${this.learnerName || 'a learner'}, a native French speaker whose English level is ${this.level} (CEFR).`,
      `Topic: ${TOPIC_EN[this.topic.id] ?? this.topic.title}. ${this.topic.scenario}`,
      '',
      'How to speak:',
      `- This is a voice conversation: reply in 1 to 3 short sentences (maximum ${maxWords} words). No lists, no emojis, no markdown, no stage directions.`,
      `- ${LEVEL_STYLE[this.band]}`,
      '- First react briefly and naturally to what the learner said (show interest, add a short personal comment), then ask exactly ONE question to keep them talking.',
      '- Stay on the topic. If the learner is stuck or speaks French, encourage them kindly in simple English and rephrase your question.',
      '',
      'Correcting:',
      '- Check ONLY the learner’s last message for real mistakes: grammar, vocabulary, word choice, word order, typical French-speaker errors.',
      '- Ignore punctuation, capital letters and small speech-recognition glitches. Do not correct style if the sentence is already correct.',
      '- If there is a mistake, rewrite the learner’s whole sentence correctly, keeping their meaning and words as much as possible.',
      '',
      'Answer EXACTLY in this format (three lines):',
      'CORRECTION: <the corrected learner sentence, or NONE>',
      'EXPLICATION: <one short explanation in French of the main mistake, or NONE>',
      'REPLY: <your spoken reply in English>',
      '',
      'Conversation plan (questions you can ask, in order, adapting to the conversation):',
      plan,
    ].join('\n');
  }

  /** Message d'ouverture (instantané, sans IA). */
  opening(): TutorReply {
    const q = this.questions[0];
    const name = this.learnerName ? ` ${this.learnerName}` : '';
    const intro: Record<Band, string> = {
      A: `Hello${name}! I'm Emma, your English teacher. Let's talk about ${simpleTopic(this.topic.id)}.`,
      B: `Hi${name}, I'm Emma! Let's chat about ${simpleTopic(this.topic.id)} today.`,
      C: `Hi${name}, I'm Emma. Let's talk about ${simpleTopic(this.topic.id)}.`,
    };
    const reply = `${intro[this.band]} ${q.q}`;
    this.history.push({ role: 'assistant', content: reply });
    this.qIndex = 1;
    this.lastSpoken = reply;
    return { correction: null, spoken: [reply], reply };
  }

  /** Correction par règles (toujours disponible). */
  ruleCheck(text: string): Correction | null {
    const r = checkText(text);
    if (!r.issues.length) return null;
    return {
      original: text,
      corrected: r.corrected,
      explanation: r.issues.map((i) => i.explanation).join(' '),
      issues: r.issues,
    };
  }

  async respond(userText: string, onSentence: (s: string) => void, signal?: AbortSignal): Promise<TutorReply> {
    const text = userText.trim();
    this.history.push({ role: 'user', content: text });

    // Demande de répétition : on répète plus lentement, sans IA.
    if (REPEAT_RE.test(text) && text.split(/\s+/).length <= 8) {
      const again = `Of course! ${this.lastQuestionText()}`;
      onSentence(again);
      this.history.push({ role: 'assistant', content: again });
      return { correction: null, spoken: [again], reply: again };
    }

    const rules = this.ruleCheck(text);
    if (llm.ready) {
      try {
        return await this.respondLLM(text, rules, onSentence, signal);
      } catch (err) {
        console.warn('LLM indisponible, repli sur le mode scripté', err);
      }
    }
    return this.respondScripted(text, rules, onSentence);
  }

  private lastQuestionText(): string {
    const lastTutor = [...this.history].reverse().find((m) => m.role === 'assistant')?.content ?? '';
    const qs = splitSentences(lastTutor).filter((s) => s.endsWith('?'));
    return qs[qs.length - 1] ?? this.currentQuestion?.q ?? lastTutor;
  }

  private correctionSpeech(c: Correction): string {
    return `${pick(CORRECTION_INTRO[this.band])} "${c.corrected.replace(/^["']|["']$/g, '')}".`;
  }

  private respondScripted(text: string, rules: Correction | null, onSentence: (s: string) => void): TutorReply {
    const spoken: string[] = [];
    if (rules) {
      const s = this.correctionSpeech(rules);
      spoken.push(s);
      onSentence(s);
    }
    let reply: string;
    let ended = false;
    const wordsCount = normalize(text).split(' ').filter(Boolean).length;

    if (DONT_KNOW_RE.test(text)) {
      const q = this.currentQuestionForHelp();
      reply = `No problem! You can start like this: "${q.starters[0]}" Give it a try!`;
    } else if (wordsCount <= 3 && !this.askedFollowUp && this.band !== 'A') {
      this.askedFollowUp = true;
      reply = pick(['Can you tell me a little more?', 'Why is that?', 'Interesting! Can you give me an example?']);
    } else if (this.finished) {
      ended = true;
      reply =
        this.band === 'A'
          ? 'Thank you! You did a great job today. See you soon!'
          : 'That was a lovely conversation, thank you! You did really well today. See you next time!';
    } else {
      this.askedFollowUp = false;
      const q = this.questions[this.qIndex++];
      reply = `${pick(ACKS[this.band])} ${q.q}`;
    }
    spoken.push(reply);
    onSentence(reply);
    this.history.push({ role: 'assistant', content: reply });
    this.lastSpoken = spoken.join(' ');
    return { correction: rules, spoken, reply, ended };
  }

  private currentQuestionForHelp(): TopicQuestion {
    return this.questions[Math.max(0, this.qIndex - 1)] ?? this.questions[0];
  }

  private async respondLLM(
    text: string,
    rules: Correction | null,
    onSentence: (s: string) => void,
    signal?: AbortSignal,
  ): Promise<TutorReply> {
    const next = this.questions[this.qIndex];
    const notes: string[] = [];
    if (rules) {
      notes.push(
        `[Automatic checker detected: ${rules.issues.map((i) => `"${i.original}" -> "${i.suggestion}"`).join('; ')}. Include these fixes in CORRECTION.]`,
      );
    }
    if (next) notes.push(`[If the learner has answered your question, move on to: "${next.q}"]`);
    else notes.push('[The plan is complete: thank the learner warmly and ask one last light question.]');

    const recent = this.history.slice(-11, -1);
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt() },
      ...recent,
      { role: 'user', content: `${text}\n\n${notes.join('\n')}` },
    ];

    const stream = new StreamParser();
    let spokenCorrection = false;
    const spoken: string[] = [];
    let correction: Correction | null = null;

    const emitCorrectionIfAny = () => {
      if (spokenCorrection) return;
      spokenCorrection = true;
      correction = this.mergeCorrection(text, stream.correction, stream.explanation, rules);
      if (correction) {
        const s = this.correctionSpeech(correction);
        spoken.push(s);
        onSentence(s);
      }
    };

    const raw = await llm.generate(messages, {
      signal,
      temperature: 0.6,
      maxTokens: 230,
      onToken: (_d, full) => {
        stream.feed(full);
        if (stream.replyStarted) {
          emitCorrectionIfAny();
          for (const s of stream.takeSentences()) {
            spoken.push(s);
            onSentence(s);
          }
        }
      },
    });
    stream.feed(raw, true);
    if (!stream.reply.trim() && !spokenCorrection) {
      // Le modèle n'a pas respecté le format : on se rabat sur le scripté.
      return this.respondScripted(text, rules, onSentence);
    }
    emitCorrectionIfAny();
    for (const s of stream.takeSentences(true)) {
      spoken.push(s);
      onSentence(s);
    }
    let reply = stream.reply.trim() || this.lastQuestionText();
    if (next && /\?/.test(reply) && similarQuestion(reply, next.q)) this.qIndex++;
    else if (next && this.history.filter((m) => m.role === 'user').length % 2 === 0) this.qIndex++;
    reply = reply.replace(/\s+/g, ' ');
    this.history.push({ role: 'assistant', content: reply });
    this.lastSpoken = spoken.join(' ');
    return { correction, spoken, reply };
  }

  /** Combine la correction du LLM et celle des règles en filtrant les hallucinations. */
  private mergeCorrection(text: string, llmCorr: string | null, llmExpl: string | null, rules: Correction | null): Correction | null {
    let corrected = llmCorr && !/^none\b/i.test(llmCorr.trim()) ? llmCorr.trim().replace(/^["“]|["”]$/g, '') : null;
    if (corrected) {
      const same = normalize(corrected) === normalize(text);
      const overlap = speechScore(text, corrected).score;
      if (same || overlap < 0.45) corrected = null;
    }
    const expl = llmExpl && !/^none\b/i.test(llmExpl.trim()) ? llmExpl.trim() : '';
    if (!corrected && !rules) return null;
    if (!corrected && rules) return rules;
    // Les explications des règles sont vérifiées ; celles d'un petit LLM peuvent être approximatives.
    const ruleExpl = rules?.issues.map((i) => i.explanation).filter(uniq) ?? [];
    return {
      original: text,
      corrected: corrected!,
      explanation: ruleExpl.length ? ruleExpl.join(' ') : expl ? `(IA) ${expl}` : '',
      issues: rules?.issues ?? [],
    };
  }
}

function uniq<T>(v: T, i: number, a: T[]) {
  return a.indexOf(v) === i;
}

function simpleTopic(id: string): string {
  const m: Record<string, string> = {
    travel: 'travel',
    work: 'work',
    personal: 'you and your life',
    food: 'food',
    hobbies: 'hobbies',
    health: 'health',
    shopping: 'shopping',
    tech: 'technology',
    interview: 'a job interview. I am the recruiter',
    society: 'culture and society',
  };
  return m[id] ?? id;
}

function similarQuestion(a: string, b: string): boolean {
  return speechScore(b, a).score > 0.5;
}

/** Analyse incrémentale de la sortie « CORRECTION / EXPLICATION / REPLY ». */
export class StreamParser {
  correction: string | null = null;
  explanation: string | null = null;
  reply = '';
  replyStarted = false;
  private emitted = 0;

  feed(full: string, final = false) {
    const text = full.replace(/\*\*/g, '');
    const rIdx = text.search(/\bREPLY\s*:/i);
    const head = rIdx >= 0 ? text.slice(0, rIdx) : text;
    const c = head.match(/CORRECTION\s*:\s*([^\n]*)/i);
    const e = head.match(/EXPLICATION|EXPLANATION/i) ? head.match(/(?:EXPLICATION|EXPLANATION)\s*:\s*([^\n]*)/i) : null;
    if (c) this.correction = c[1].trim();
    if (e) this.explanation = e[1].trim();
    if (rIdx >= 0) {
      this.replyStarted = true;
      this.reply = text.slice(rIdx).replace(/^REPLY\s*:\s*/i, '');
    } else if (final && !/CORRECTION\s*:/i.test(text)) {
      // Format non respecté : tout le texte est la réponse.
      this.replyStarted = true;
      this.reply = text;
    }
    this.reply = this.reply.replace(/\n+(CORRECTION|EXPLICATION|EXPLANATION)\s*:[\s\S]*$/i, '');
  }

  /** Phrases complètes non encore émises. */
  takeSentences(final = false): string[] {
    const sentences = splitSentences(this.reply);
    const complete = final ? sentences : sentences.filter((s, i) => i < sentences.length - 1 || /[.!?…]["')\]]*$/.test(s));
    const out = complete.slice(this.emitted).filter((s) => s.trim().length > 0);
    this.emitted = Math.max(this.emitted, complete.length);
    return out;
  }
}
