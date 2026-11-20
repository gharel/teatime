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
import { TOPICS } from '../data/topics';
import { checkText, type Issue } from '../lib/corrector';
import { llm, type ChatMessage } from '../lib/llm';
import { cosine, semantic } from '../lib/semantic';
import { normalize, pick, speechScore, splitSentences } from '../lib/text';
import { emmaAnswer, looksFrench, tenseIssue, understand, type SemanticSignal, type Understanding } from './understand';

export type Band = 'A' | 'B' | 'C';

export function bandOf(level: Level): Band {
  return level[0] as Band;
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
  issues: Issue[];
  /** L'apprenant a parlé français : « corrected » est la version anglaise à redire. */
  translation?: boolean;
}

/** Conduite d'un tour de conversation avec le LLM. */
interface TurnPlan {
  /** Consigne au modèle : une seule action, sans alternative. */
  task: string;
  /** Question sur laquelle Emma doit finir (ajoutée si le modèle n'en pose pas). */
  ask?: string;
  /** Réponse toute faite si le modèle ne produit rien d'utilisable. */
  fallback: string;
  /** La question demandée est la suivante du plan. */
  advancesPlan?: boolean;
  ended?: boolean;
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

/** Longueur maximale d'une réponse parlée d'Emma (mots). */
const MAX_WORDS: Record<Band, number> = { A: 30, B: 45, C: 55 };

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

/** Réactions quand l'apprenant donne un détail concret (« Spain? Lovely! »). */
const DETAIL_ACKS: Record<Band, string[]> = {
  A: ['Nice!', 'Great!', 'Cool!', 'Lovely!', 'How nice!'],
  B: ['That sounds nice!', 'How interesting!', 'Lovely!', 'Oh, nice!', 'Sounds great!'],
  C: ['How interesting.', 'That sounds great.', 'Lovely.', 'Fascinating.'],
};

/** Réactions neutres à une réponse négative (« No, I don't… ») : pas de « Great! ». */
const NEG_ACKS: Record<Band, string[]> = {
  A: ['OK, I see.', 'Oh, OK.', 'I understand.'],
  B: ['Oh, I see.', 'Fair enough.', 'OK, I understand.'],
  C: ['Fair enough.', 'I see where you’re coming from.', 'That’s understandable.'],
};

/** Sujet d'un autre thème quand l'apprenant change de conversation. */
const OTHER_TOPIC_EN: Record<string, string> = {
  travel: 'travel',
  work: 'work',
  personal: 'your family and friends',
  food: 'food',
  hobbies: 'your hobbies',
  health: 'health',
  shopping: 'shopping',
  tech: 'technology',
  society: 'culture and society',
};

/** Seuil au-delà duquel une réponse couvre aussi une question suivante du plan (on ne la pose pas). */
const ALREADY_ANSWERED_SIM = 0.6;

export class TutorSession {
  readonly band: Band;
  readonly questions: TopicQuestion[];
  qIndex = 0;
  history: ChatMessage[] = [];
  private askedFollowUp = false;
  lastSpoken = '';
  /** Ce qu'Emma a compris du dernier message (affichage, tests). */
  lastUnderstanding: Understanding | null = null;
  /** Question d'un autre thème posée parce que l'apprenant en parlait ; on revient ensuite au plan. */
  private detour: { topicId: string; q: TopicQuestion } | null = null;
  private usedDetours = new Set<string>();
  /** Réponses hors sujet d'affilée à la même question. */
  private offTopicStreak = 0;
  /** Questions du plan auxquelles l'apprenant a déjà répondu spontanément. */
  private answered = new Set<number>();

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

  /** Question qui attend une réponse (celle du plan, ou celle d'un détour). */
  awaitingQuestion(): TopicQuestion {
    return this.detour?.q ?? this.questions[Math.max(0, this.qIndex - 1)] ?? this.questions[0];
  }

  /**
   * Prépare la compréhension (petit modèle local, ≈ 23 Mo) : questions du thème d'abord,
   * puis celles des autres thèmes (pour reconnaître quand l'apprenant change de sujet).
   */
  warmUp() {
    const others = TOPICS.filter((t) => t.id !== this.topic.id && t.id !== 'interview');
    const otherBands = (['A', 'B', 'C'] as const).filter((b) => b !== this.band);
    semantic.load([
      ...this.questions.map((q) => q.q),
      ...others.flatMap((t) => t.questions[this.band].map((q) => q.q)),
      ...others.flatMap((t) => otherBands.flatMap((b) => t.questions[b].map((q) => q.q))),
    ]);
  }

  /**
   * Consignes générales, courtes et sans alternatives : la conduite de chaque tour (question à poser,
   * hors-sujet, détour) est donnée avec le message de l'apprenant (voir planTurn).
   */
  systemPrompt(): string {
    return [
      `You are Emma, a warm, encouraging and patient English teacher from London. You are having a spoken (voice) conversation with ${this.learnerName || 'a learner'}, a French speaker who is learning English.`,
      `Topic: ${TOPIC_EN[this.topic.id] ?? this.topic.title}. ${this.topic.scenario}`,
      '',
      'How to speak:',
      `- Speak English only, in 1 to 3 short sentences (maximum ${MAX_WORDS[this.band]} words), like in a real conversation.`,
      '- Never write lists, emojis, markdown, brackets, notes, or comments about the conversation.',
      `- ${LEVEL_STYLE[this.band]}`,
      '- Always react to what the learner actually said, then ask only ONE question.',
      '- After each learner message, you get a secret plan for your reply: follow it, but never mention it.',
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

  /** Correction par règles (toujours disponible), y compris le temps attendu par la question. */
  ruleCheck(text: string, question = ''): Correction | null {
    const r = checkText(text);
    let corrected = r.corrected;
    const issues = r.issues.slice();
    const tense = question ? tenseIssue(corrected, question) : null;
    if (tense && corrected.includes(tense.original)) {
      corrected = corrected.replace(tense.original, tense.suggestion);
      issues.push(tense);
    }
    if (!issues.length) return null;
    return {
      original: text,
      corrected,
      explanation: issues.map((i) => i.explanation).join(' '),
      issues,
    };
  }

  /** Comprend le message : intention, lien avec la question posée, autre thème évoqué. */
  async understandTurn(text: string): Promise<{ u: Understanding; vec?: Float32Array }> {
    const askedText = this.lastQuestionText();
    const sem = await this.semanticSignal(text, askedText);
    const u = understand(text, { question: this.awaitingQuestion(), asked: askedText, topicId: this.topic.id }, sem?.sig);
    this.lastUnderstanding = u;
    return { u, vec: sem?.vec };
  }

  private async semanticSignal(text: string, askedText: string): Promise<{ sig: SemanticSignal; vec: Float32Array } | null> {
    const vecs = await semantic.embed([text, askedText]).catch(() => null);
    if (!vecs) return null;
    const [a, q] = vecs;
    let other: SemanticSignal['other'];
    for (const t of TOPICS) {
      if (t.id === this.topic.id || t.id === 'interview') continue;
      for (const band of ['A', 'B', 'C'] as const)
        for (const tq of t.questions[band]) {
          const v = semantic.vector(tq.q);
          if (!v) continue;
          const s = cosine(a, v);
          if (!other || s > other.sim) other = { topicId: t.id, sim: s };
        }
    }
    return { sig: { sim: cosine(a, q), other }, vec: a };
  }

  async respond(userText: string, onSentence: (s: string) => void, signal?: AbortSignal): Promise<TutorReply> {
    const text = userText.trim();
    const askedText = this.lastQuestionText();
    const { u, vec } = await this.understandTurn(text);
    this.history.push({ role: 'user', content: text });

    // Demande de répétition : on répète, sans IA.
    if (u.intent === 'repeat') {
      const again = `Of course! ${askedText}`;
      onSentence(again);
      this.history.push({ role: 'assistant', content: again });
      this.lastSpoken = again;
      return { correction: null, spoken: [again], reply: again };
    }
    // Au revoir : on termine la conversation.
    if (u.intent === 'goodbye') {
      const bye =
        this.band === 'A'
          ? 'OK! Thank you, you did a great job today. Goodbye!'
          : 'All right! Thank you for this lovely chat, you did really well. See you next time!';
      onSentence(bye);
      this.history.push({ role: 'assistant', content: bye });
      this.lastSpoken = bye;
      return { correction: null, spoken: [bye], reply: bye, ended: true };
    }

    if (u.intent === 'french') {
      if (llm.ready) {
        try {
          const r = await this.respondFrench(text, u, onSentence, signal);
          if (r) return r;
        } catch (err) {
          console.warn('Traduction indisponible, repli sur le mode scripté', err);
        }
      }
      return this.respondScripted(text, null, onSentence, u, vec);
    }
    const rules = this.ruleCheck(text, askedText);
    if (llm.ready) {
      try {
        return await this.respondLLM(text, rules, onSentence, signal, u, vec);
      } catch (err) {
        console.warn('LLM indisponible, repli sur le mode scripté', err);
      }
    }
    return this.respondScripted(text, rules, onSentence, u, vec);
  }

  /** Dernière question posée par Emma (texte). */
  lastQuestionText(): string {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const m = this.history[i];
      if (m.role !== 'assistant') continue;
      const qs = splitSentences(m.content).filter((s) => s.endsWith('?'));
      if (qs.length) return qs[qs.length - 1];
      break;
    }
    return this.awaitingQuestion().q;
  }

  /** Réaction à une réponse : reprend un détail, reste neutre si la réponse est négative. */
  private reaction(u: Understanding): string {
    if (u.negative) return pick(NEG_ACKS[this.band]);
    if (u.detail) {
      const d = u.detail.charAt(0).toUpperCase() + u.detail.slice(1);
      return `${d}? ${pick(DETAIL_ACKS[this.band])}`;
    }
    return pick(ACKS[this.band]);
  }

  /** Question suivante du plan, en sautant celles auxquelles l'apprenant a déjà répondu. */
  private nextPlanQuestion(): TopicQuestion | null {
    while (this.qIndex < this.questions.length && this.answered.has(this.qIndex)) this.qIndex++;
    if (this.qIndex >= this.questions.length) return null;
    return this.questions[this.qIndex++];
  }

  /**
   * L'apprenant a peut-être déjà répondu à des questions suivantes du plan (« Last summer I went to
   * Italy by plane » couvre « Where did you go…? » et « How did you travel? ») : on ne les posera pas.
   * Il faut que la réponse colle nettement mieux à cette question qu'à celle qui était posée.
   */
  private markAnswered(vec: Float32Array | undefined, ownSim = 1) {
    if (!vec) return;
    for (let i = this.qIndex; i < this.questions.length; i++) {
      const v = semantic.vector(this.questions[i].q);
      const s = v ? cosine(vec, v) : 0;
      if (s >= ALREADY_ANSWERED_SIM && s > ownSim + 0.1) this.answered.add(i);
    }
  }

  /** Question d'un autre thème liée à ce que vient de dire l'apprenant (sans reposer ce qu'il a déjà dit). */
  private detourQuestion(topicId: string, vec?: Float32Array): TopicQuestion | undefined {
    const t = TOPICS.find((x) => x.id === topicId);
    const pool = t?.questions[this.band].filter((q) => !this.usedDetours.has(q.q)) ?? [];
    if (!pool.length) return undefined;
    if (!vec) return pool[0];
    const scored = pool.map((q) => {
      const v = semantic.vector(q.q);
      return { q, s: v ? cosine(vec, v) : 0 };
    });
    const fresh = scored.filter((x) => x.s < 0.5).sort((a, b) => b.s - a.s);
    return (fresh[0] ?? scored.sort((a, b) => a.s - b.s)[0]).q;
  }

  /** Emma ne voit pas le lien avec sa question : elle dit ce qu'elle a entendu et repose la question. */
  private clarify(text: string, q: TopicQuestion): string {
    const heard = text.split(/\s+/).length <= 12 ? text.replace(/[.!?]+$/, '') : '';
    const said = heard ? `I heard: "${heard}". ` : '';
    const starter = q.starters[0] ? ` You can say: "${q.starters[0]}"` : '';
    if (this.band === 'A') return `${said}Hmm, sorry, I don't understand. My question is: ${q.q}${starter}`;
    if (this.band === 'B') return `${said}Hmm, I'm not sure that answers my question. ${pick(['Let me ask again:', 'My question was:'])} ${q.q}`;
    return `${said}Interesting, but I'm not sure that answers my question. ${pick(['Let me rephrase:', 'Let me ask again:'])} ${q.q}`;
  }

  private correctionSpeech(c: Correction): string {
    return `${pick(CORRECTION_INTRO[this.band])} "${c.corrected.replace(/^["']|["']$/g, '')}".`;
  }

  private respondScripted(
    text: string,
    rules: Correction | null,
    onSentence: (s: string) => void,
    u: Understanding = understand(text, { question: this.awaitingQuestion(), topicId: this.topic.id }),
    vec?: Float32Array,
  ): TutorReply {
    const spoken: string[] = [];
    if (rules) {
      const s = this.correctionSpeech(rules);
      spoken.push(s);
      onSentence(s);
    }
    const asked = this.awaitingQuestion();
    let reply: string;
    let ended = false;

    /** Passe à la suite : retour au plan après un détour, question suivante, ou fin. */
    const moveOn = (lead: string): string => {
      this.offTopicStreak = 0;
      this.askedFollowUp = false;
      if (this.detour) {
        this.detour = null;
        return `${lead} Now, let's go back to ${simpleTopic(this.topic.id)}. ${this.awaitingQuestion().q}`;
      }
      const next = this.nextPlanQuestion();
      if (!next) {
        ended = true;
        return this.band === 'A'
          ? `${lead} Thank you! You did a great job today. See you soon!`
          : `${lead} That was a lovely conversation, thank you! You did really well today. See you next time!`;
      }
      return `${lead} ${next.q}`;
    };

    switch (u.intent) {
      case 'french':
        reply = `${pick(['Try to say it in English!', 'In English, please!', "Let's try in English!"])}${
          asked.starters[0] ? ` You can start with: "${asked.starters[0]}"` : ''
        }`;
        break;
      case 'dont-know':
        reply = `No problem! You can start like this: "${asked.starters[0]}" Give it a try!`;
        break;
      case 'greeting':
        reply = `Hello! ${asked.q}`;
        break;
      case 'thanks':
        reply = `You're welcome! ${asked.q}`;
        break;
      case 'question':
        reply = `${emmaAnswer(u.question, this.topic.id)} ${pick(['Now, back to you.', 'But tell me about you.', 'Your turn!'])} ${asked.q}`;
        break;
      case 'off-topic': {
        const q2 = !this.detour && u.otherTopic ? this.detourQuestion(u.otherTopic, vec) : undefined;
        if (q2 && u.otherTopic) {
          // L'apprenant parle d'autre chose : Emma suit son idée, puis reviendra au thème.
          this.detour = { topicId: u.otherTopic, q: q2 };
          this.usedDetours.add(q2.q);
          this.offTopicStreak = 0;
          const about = OTHER_TOPIC_EN[u.otherTopic] ?? 'that';
          reply =
            this.band === 'A'
              ? `Oh, you're talking about ${about}! OK. ${q2.q}`
              : `Oh, you're talking about ${about}! ${pick(['Good idea.', 'Sure, let’s talk about that.', 'Why not?'])} ${q2.q}`;
        } else if (this.offTopicStreak === 0) {
          this.offTopicStreak = 1;
          reply = this.clarify(text, asked);
        } else {
          // Deuxième fois : on n'insiste pas, on change de question.
          reply = moveOn(pick(["No problem, let's try another question.", "OK, let's talk about something else."]));
        }
        break;
      }
      default: {
        this.markAnswered(vec, u.sim);
        const aside = u.asksBack ? emmaAnswer(u.question, this.topic.id) : '';
        // Réponse très courte (B, C) : on encourage une fois à développer.
        if (u.words <= 3 && !this.askedFollowUp && this.band !== 'A' && !this.detour) {
          this.askedFollowUp = true;
          reply = `${aside ? `${aside} ` : ''}${pick(['Can you tell me a little more?', 'Why is that?', 'Interesting! Can you give me an example?'])}`;
        } else {
          reply = moveOn(aside ? `${this.reaction(u)} ${aside}` : this.reaction(u));
        }
      }
    }
    spoken.push(reply);
    onSentence(reply);
    this.history.push({ role: 'assistant', content: reply });
    this.lastSpoken = spoken.join(' ');
    return { correction: rules, spoken, reply, ended };
  }

  /**
   * Ce qu'Emma fait à ce tour, décidé ici et non par le modèle : les petits modèles locaux suivent mal
   * les consignes à tiroirs (« si…, sinon… ») et finissent par les recopier en monologue.
   * Met à jour l'état (détour, hors-sujet, plan) comme le mode scripté.
   */
  private planTurn(text: string, u: Understanding, vec?: Float32Array): TurnPlan {
    const asked = this.lastQuestionText();
    switch (u.intent) {
      case 'question':
        return {
          task: `The learner asked you a question. Answer it briefly as Emma, then ask again: "${asked}"`,
          ask: asked,
          fallback: `${emmaAnswer(u.question, this.topic.id)} ${pick(['Now, back to you.', 'But tell me about you.', 'Your turn!'])} ${asked}`,
        };
      case 'dont-know': {
        const starter = this.awaitingQuestion().starters[0];
        return {
          task: `The learner does not know what to say. Give a very short example answer to your question, then encourage them to try.${starter ? ` They can start with: "${starter}"` : ''}`,
          fallback: starter ? `No problem! You can start like this: "${starter}" Give it a try!` : `No problem! Take your time. ${asked}`,
        };
      }
      case 'greeting':
      case 'thanks':
        return {
          task: `Answer in a few friendly words, then ask again: "${asked}"`,
          ask: asked,
          fallback: `${u.intent === 'greeting' ? 'Hello!' : "You're welcome!"} ${asked}`,
        };
      case 'off-topic': {
        const q2 = !this.detour && u.otherTopic ? this.detourQuestion(u.otherTopic, vec) : undefined;
        if (q2 && u.otherTopic) {
          // L'apprenant parle d'autre chose : Emma suit son idée, puis reviendra au thème.
          this.detour = { topicId: u.otherTopic, q: q2 };
          this.usedDetours.add(q2.q);
          this.offTopicStreak = 0;
          const about = OTHER_TOPIC_EN[u.otherTopic] ?? 'that';
          return {
            task: `The learner is now talking about ${about}. Follow them: react to what they said in one short sentence, then ask: "${q2.q}"`,
            ask: q2.q,
            fallback: `Oh, you're talking about ${about}! ${q2.q}`,
          };
        }
        if (this.offTopicStreak === 0) {
          this.offTopicStreak = 1;
          return {
            task: `This message does not answer your question. React to what they said in one short sentence, or say that you did not understand. Then ask your question again: "${asked}"`,
            ask: asked,
            fallback: this.clarify(text, this.awaitingQuestion()),
          };
        }
        // Deuxième fois : on n'insiste pas, on change de question.
        this.offTopicStreak = 0;
        this.askedFollowUp = false;
        const nxt = this.nextPlanQuestion();
        if (!nxt) return this.closingPlan();
        return {
          task: `Say kindly that it is no problem, then ask this new question: "${nxt.q}"`,
          ask: nxt.q,
          fallback: `${pick(["No problem, let's try another question.", "OK, let's talk about something else."])} ${nxt.q}`,
        };
      }
      default: {
        this.offTopicStreak = 0;
        const aside = u.asksBack ? ' They also asked you a question: answer it briefly first.' : '';
        const asideText = u.asksBack ? ` ${emmaAnswer(u.question, this.topic.id)}` : '';
        if (this.detour) {
          this.detour = null;
          const back = this.awaitingQuestion().q;
          const topic = simpleTopic(this.topic.id);
          return {
            task: `React to a concrete detail of their answer in one short sentence.${aside} Then say "Now, let's go back to ${topic}." and ask: "${back}"`,
            ask: back,
            fallback: `${this.reaction(u)}${asideText} Now, let's go back to ${topic}. ${back}`,
          };
        }
        const next = this.questions[this.qIndex];
        if (!next) {
          return {
            task: `React to a concrete detail of their answer in one short sentence.${aside} Then ask one more simple question about what they said.`,
            fallback: `${this.reaction(u)}${asideText} ${pick(['Can you tell me a little more?', 'Can you give me an example?'])}`,
          };
        }
        return {
          task: `React to a concrete detail of their answer in one short sentence.${aside} Then ask: "${next.q}"`,
          ask: next.q,
          advancesPlan: true,
          fallback: `${this.reaction(u)}${asideText} ${next.q}`,
        };
      }
    }
  }

  private closingPlan(): TurnPlan {
    return {
      task: 'Thank the learner warmly for this conversation and say goodbye.',
      fallback:
        this.band === 'A'
          ? 'Thank you! You did a great job today. See you soon!'
          : 'That was a lovely conversation, thank you! You did really well today. See you next time!',
      ended: true,
    };
  }

  private async respondLLM(
    text: string,
    rules: Correction | null,
    onSentence: (s: string) => void,
    signal: AbortSignal | undefined,
    u: Understanding,
    vec?: Float32Array,
  ): Promise<TutorReply> {
    if (u.intent === 'answer' || u.intent === 'short') this.markAnswered(vec, u.sim);
    while (this.qIndex < this.questions.length && this.answered.has(this.qIndex)) this.qIndex++;
    const plan = this.planTurn(text, u, vec);
    const tasks = [plan.task];
    if (rules) {
      tasks.unshift(
        `An automatic checker found: ${rules.issues.map((i) => `"${i.original}" -> "${i.suggestion}"`).join('; ')}. Include these fixes in CORRECTION.`,
      );
    }

    const recent = this.history.slice(-11, -1);
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt() },
      ...recent,
      { role: 'user', content: `${text}\n\n---\nPlan for your reply (secret, never mention it): ${tasks.join(' ')}` },
    ];

    const stream = new StreamParser();
    const guard = new ReplyGuard(this.band, !!plan.ask);
    // Le garde-fou arrête la génération dès que la réponse est complète (ou part en vrille).
    const stop = new AbortController();
    const onAbort = () => stop.abort();
    signal?.addEventListener('abort', onAbort);
    const spoken: string[] = [];
    const say = (s: string) => {
      spoken.push(s);
      onSentence(s);
    };
    let spokenCorrection = false;
    let correction: Correction | null = null;

    const emitCorrectionIfAny = () => {
      if (spokenCorrection) return;
      spokenCorrection = true;
      correction = this.mergeCorrection(text, stream.correction, stream.explanation, rules);
      if (correction) say(this.correctionSpeech(correction));
    };
    const flush = (final: boolean) => {
      for (const s of stream.takeSentences(final)) {
        if (guard.stopped) break;
        const kept = guard.push(s);
        if (kept) say(kept);
      }
      if (guard.stopped) stop.abort();
    };

    let raw = '';
    try {
      raw = await llm.generate(messages, {
        signal: stop.signal,
        temperature: 0.5,
        maxTokens: 200,
        frequencyPenalty: 0.3,
        onToken: (_d, full) => {
          if (stop.signal.aborted) return;
          stream.feed(full);
          if (stream.replyStarted) {
            emitCorrectionIfAny();
            flush(false);
          }
        },
      });
    } catch (err) {
      if (!stop.signal.aborted) console.warn('Réponse de l’IA interrompue', err);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
    if (!guard.stopped && raw) {
      stream.feed(raw, true);
      if (stream.replyStarted) {
        emitCorrectionIfAny();
        flush(true);
      }
    }
    // Pas de réponse exploitable : la correction (modèle ou règles) est quand même donnée.
    emitCorrectionIfAny();

    let reply = guard.text;
    let ownQuestion = false;
    if (!signal?.aborted) {
      if (!reply) {
        // Rien d'utilisable (format non respecté, monologue, hors sujet) : réponse toute faite.
        reply = plan.fallback;
        say(reply);
        ownQuestion = true;
      } else if (plan.ask && !guard.asked) {
        // Emma doit toujours relancer la conversation.
        say(plan.ask);
        reply = `${reply} ${plan.ask}`;
        ownQuestion = true;
      }
    }
    if (plan.advancesPlan && plan.ask) {
      // On n'avance dans le plan que si la question suivante a été posée (ou une réponse sur deux).
      if (ownQuestion || similarQuestion(reply, plan.ask)) this.qIndex++;
      else if (u.intent === 'answer' && this.history.filter((m) => m.role === 'user').length % 2 === 0) this.qIndex++;
    }
    reply = reply.replace(/\s+/g, ' ').trim();
    this.history.push({ role: 'assistant', content: reply });
    this.lastSpoken = spoken.join(' ');
    return { correction, spoken, reply, ended: plan.ended };
  }

  /**
   * L'apprenant a parlé français : Emma lui donne la phrase en anglais à redire, ou répond à
   * « Comment on dit… ? ». Consigne minimale (traduction seule) : fiable même avec un petit modèle.
   */
  private async respondFrench(
    text: string,
    u: Understanding,
    onSentence: (s: string) => void,
    signal?: AbortSignal,
  ): Promise<TutorReply | null> {
    const system = u.howToSay
      ? 'You help a French speaker who is learning English. They ask, in French, how to say something in English. Write ONLY the English word or sentence they are looking for, with no explanation.'
      : 'Translate the French text into simple, natural English. Write ONLY the English translation, with no explanation.';
    const out = await llm.generate(
      [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      { signal, temperature: 0.2, maxTokens: 60 },
    );
    const en = cleanTranslation(out);
    if (!en || signal?.aborted) return null;
    const quoted = `"${en}"`;
    const spoken = u.howToSay
      ? [`${pick(['In English, we say:', 'We say:'])} ${quoted}`, this.lastQuestionText()]
      : [
          `${pick(['In English, you can say:', 'In English, we say:'])} ${quoted}`,
          pick(['Now you try!', 'Your turn, say it in English!', 'Try to say it in English!']),
        ];
    spoken.forEach(onSentence);
    const reply = spoken.join(' ');
    this.history.push({ role: 'assistant', content: reply });
    this.lastSpoken = reply;
    const correction: Correction = {
      original: text,
      corrected: en,
      explanation: u.howToSay
        ? 'Votre question en français, et sa réponse en anglais.'
        : 'Vous avez parlé français : voici comment le dire en anglais. Entraînez-vous à le redire !',
      issues: [],
      translation: true,
    };
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

/* ------------------------------ Garde-fou des réponses du LLM ------------------------------ */

/**
 * Le modèle parle de la conversation au lieu de parler à l'apprenant (« If the learner is not in the
 * kitchen, I will ask a simpler question for an A2 learner… ») : phrases à ne jamais dire.
 */
const META =
  /\b(learners?|the user|CEFR|instructions?|secret plan|plan for your reply|conversation plan|speech[- ]recognition|I will ask|I'll ask|my next question)\b|\b(correction|explication|explanation|reply)\s*:|\b[ABC][12]\b/i;

/** Question qui relance vraiment la conversation (pas « Really? » ni l'écho « Spain? »). */
function isRealQuestion(s: string): boolean {
  if (!/\?["'”)]*$/.test(s)) return false;
  const n = normalize(s);
  return n.split(' ').length >= 3 && (/\byou(r|rs|rself)?\b/.test(n) || /^(and |so |but |oh |well )?(what|where|when|why|how|who|which|do|does|did|is|are|was|were|can|could|would|will|have|has|should)\b/.test(n));
}

/** Retire ce qui n'est pas à dire à voix haute : apartés entre parenthèses ou crochets, markdown, étiquettes. */
function cleanSentence(s: string): string {
  return s
    .replace(/\([^)]*\)?|\[[^\]]*\]?|\{[^}]*\}?/g, ' ')
    .replace(/[*_#`]+/g, '')
    .replace(/^\s*(emma|teacher)\s*:\s*/i, '')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Le modèle tourne en boucle (« 2nd level, 3A1, 2nd level or 2nd level… »). */
function looping(s: string): boolean {
  const w = normalize(s).split(' ');
  const seen = new Map<string, number>();
  for (let i = 0; i + 1 < w.length; i++) {
    const k = `${w[i]} ${w[i + 1]}`;
    const c = (seen.get(k) ?? 0) + 1;
    if (c >= 3) return true;
    seen.set(k, c);
  }
  return false;
}

/**
 * Filtre phrase par phrase la réponse en flux, avant la synthèse vocale : Emma dit au plus quelques
 * phrases et s'arrête après sa question ; les apartés, le méta-discours et les boucles sont écartés
 * (et la génération coupée). Les petits modèles locaux partent sinon en monologue.
 */
export class ReplyGuard {
  stopped = false;
  private kept: string[] = [];
  private words = 0;
  private readonly maxWords: number;
  private readonly maxSentences: number;

  /** @param mustAsk le moteur impose une question : on garde moins de phrases avant elle. */
  constructor(band: Band, mustAsk = false) {
    this.maxWords = Math.round(MAX_WORDS[band] * 1.3);
    this.maxSentences = mustAsk ? (band === 'A' ? 2 : 3) : band === 'C' ? 4 : 3;
  }

  /** Phrase à dire (nettoyée), ou null si elle est écartée. */
  push(raw: string): string | null {
    if (this.stopped) return null;
    const meta = META.test(raw);
    if (meta && this.kept.length) {
      // Le modèle commente la conversation : la suite ne sera pas meilleure.
      this.stopped = true;
      return null;
    }
    const s = cleanSentence(raw);
    if (!/[a-z]/i.test(s) || META.test(s)) return null;
    const n = normalize(s).split(' ').length;
    const repeated = this.kept.some((k) => normalize(k) === normalize(s));
    if (repeated || looping(s) || this.words + n > this.maxWords) {
      this.stopped = true;
      return null;
    }
    this.kept.push(s);
    this.words += n;
    if (isRealQuestion(s) || this.kept.length >= this.maxSentences) this.stopped = true;
    return s;
  }

  get text(): string {
    return this.kept.join(' ');
  }

  /** Emma a posé une vraie question. */
  get asked(): boolean {
    return this.kept.some(isRealQuestion);
  }
}

/** Nettoie la traduction renvoyée par le modèle ; vide si elle est inutilisable. */
export function cleanTranslation(out: string): string {
  const line = out
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return '';
  const t = line
    .replace(/^(here is|here's) [^:]*:\s*/i, '')
    .replace(/^(english|translation|in english|answer|emma)\s*:\s*/i, '')
    .replace(/^["“«'\s]+|["”»'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[a-z]/i.test(t) || looksFrench(t) || /\btranslat/i.test(t) || t.split(' ').length > 30) return '';
  return t;
}
