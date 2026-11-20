/* ------------------------------------------------------------------
 * Emma — conversation vocale avec avatar lip-sync.
 * Boucle mains-libres : Emma parle → micro auto → fin de parole
 * détectée → correction + réponse en flux → Emma parle → …
 * ------------------------------------------------------------------ */
import { useEffect, useRef, useState } from 'react';
import type { Level, TutorTopic } from '../types';
import { LEVELS } from '../types';
import { TOPICS } from '../data/topics';
import Avatar, { type AvatarMood, type AvatarState } from '../tutor/Avatar';
import { TutorSession, type Correction } from '../tutor/engine';
import { looksFrench } from '../tutor/understand';
import { tts } from '../lib/tts';
import { ContinuousListener, listen, resolveSttEngine, webSpeechSupported, whisper, type ContinuousState } from '../lib/stt';
import { llm, WEBLLM_MODELS } from '../lib/llm';
import { wordDiff } from '../lib/corrector';
import { pron } from '../lib/pron';
import type { PronIssue, PronResult, WordAssessment } from '../lib/pronunciation';
import { speechScore, splitSentences } from '../lib/text';
import { interruptedLoads } from '../lib/device';
import { semantic } from '../lib/semantic';
import { addSrsCards, claimQuests, getState, reward, updateSettings, useAppState, type LlmProvider } from '../lib/store';
import { LevelBadge, navigate, notify, notifyBadges, Rich, sfx, useService } from '../components/ui';
import Icon, { ICONS, IconBadge, topicIcon } from '../components/Icon';

interface Turn {
  id: number;
  role: 'tutor' | 'user';
  text: string;
  correction?: Correction | null;
  /** Analyse de prononciation : en cours, faite, ou indisponible. */
  pron?: PronResult | 'pending' | null;
}

let turnId = 1;

/* ------------------------------ Panneau moteurs ------------------------------ */

export function EnginePanel({ compact = false }: { compact?: boolean }) {
  const settings = useAppState((s) => s.settings);
  const kokoro = useService(tts, () => ({ ...tts.kokoro }));
  const llmStatus = useService(llm, () => ({ ...llm.status }));
  const whisperStatus = useService(whisper, () => ({ ...whisper.status }));
  const understanding = useService(semantic, () => ({ ...semantic.status }));
  const model = WEBLLM_MODELS.find((m) => m.id === settings.webllmModel);
  const sttLabel =
    settings.sttEngine === 'whisper' || !webSpeechSupported()
      ? `Whisper local · ${whisperStatus.status === 'ready' ? 'prêt' : whisperStatus.status === 'loading' ? whisperStatus.detail : 'chargé au premier usage (≈ 80 à 200 Mo)'}`
      : 'Reconnaissance du navigateur (Web Speech)';

  return (
    <div className={compact ? '' : 'card'}>
      {!compact && (
        <h3 className="label-icon">
          <Icon name="cpu" /> Moteurs (100 % gratuits)
        </h3>
      )}
      <div className="engine-row">
        <span className={`status-dot ${settings.ttsEngine === 'system' || kokoro.status === 'unsupported' ? 'ready' : kokoro.status}`} />
        <div style={{ flex: 1 }}>
          <strong className="small">Voix d'Emma</strong>
          <div className="tiny muted">
            {settings.ttsEngine === 'system'
              ? 'Voix du système'
              : kokoro.status === 'ready'
                ? tts.kokoroTooSlow
                  ? 'Voix neuronale Kokoro, lente sur cet appareil : Emma répond avec plusieurs secondes de retard'
                  : `Voix neuronale Kokoro (locale, ${tts.kokoroDevice === 'webgpu' ? 'GPU' : 'processeur'}), prête`
                : kokoro.status === 'loading'
                  ? kokoro.detail
                  : kokoro.status === 'unsupported'
                    ? kokoro.detail
                    : kokoro.status === 'error'
                      ? `Erreur : ${kokoro.detail} — voix du système utilisée`
                      : 'Voix neuronale Kokoro (≈ 320 Mo sur GPU, 90 Mo sur processeur, une seule fois)'}
          </div>
          {kokoro.status === 'loading' && <Progress value={kokoro.progress} />}
        </div>
        {settings.ttsEngine === 'kokoro' && (kokoro.status === 'idle' || kokoro.status === 'error') && (
          <button className="btn sm" onClick={() => tts.loadKokoro({ manual: true })}>
            {kokoro.status === 'error' ? 'Réessayer' : 'Télécharger'}
          </button>
        )}
        {settings.ttsEngine === 'kokoro' && kokoro.status === 'unsupported' && (
          <button
            className="btn sm"
            onClick={() => {
              updateSettings({ kokoroEvenIfSlow: true });
              tts.loadKokoro({ manual: true });
            }}
          >
            Essayer quand même
          </button>
        )}
        {settings.ttsEngine === 'kokoro' && kokoro.status === 'ready' && tts.kokoroTooSlow && (
          <button className="btn sm" onClick={() => updateSettings({ kokoroEvenIfSlow: false })}>
            Voix du système
          </button>
        )}
      </div>
      <div className="engine-row">
        <span className="status-dot ready" />
        <div style={{ flex: 1 }}>
          <strong className="small">Écoute</strong>
          <div className="tiny muted">{sttLabel}</div>
        </div>
      </div>
      <PronEngineRow />
      <div className="engine-row">
        <span className={`status-dot ${understanding.status === 'idle' ? 'ready' : understanding.status}`} />
        <div style={{ flex: 1 }}>
          <strong className="small">Compréhension des réponses</strong>
          <div className="tiny muted">
            {understanding.status === 'idle'
              ? 'Emma vérifie que vous répondez à sa question et suit vos changements de sujet · modèle local ≈ 23 Mo, chargé au début de la conversation'
              : understanding.status === 'error'
                ? `Indisponible (${understanding.detail}) : Emma enchaîne ses questions`
                : understanding.detail}
          </div>
        </div>
      </div>
      <div className="engine-row">
        <span className={`status-dot ${settings.llmProvider === 'scripted' ? 'ready' : llmStatus.status}`} />
        <div style={{ flex: 1 }}>
          <strong className="small">Cerveau (IA)</strong>
          <select
            className="input"
            style={{ minHeight: 36, padding: '4px 8px', fontSize: '0.9rem', marginTop: 4 }}
            value={settings.llmProvider}
            onChange={(e) => updateSettings({ llmProvider: e.target.value as LlmProvider })}
            aria-label="Moteur de conversation"
          >
            <option value="webllm">IA locale dans le navigateur (WebLLM · {model?.label ?? 'modèle'})</option>
            <option value="ollama">Ollama sur cet ordinateur</option>
            <option value="chrome">IA intégrée de Chrome (Gemini Nano)</option>
            <option value="scripted">Sans IA (questions prédéfinies + correcteur)</option>
          </select>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {settings.llmProvider === 'scripted'
              ? 'Fonctionne partout, instantané. Corrections par règles (fautes typiques des francophones).'
              : llmStatus.status === 'idle'
                ? settings.llmProvider === 'webllm'
                  ? `Non chargé · ${model?.size ?? ''} téléchargé une seule fois, puis en cache · nécessite WebGPU`
                  : 'Non connecté'
                : llmStatus.detail}
          </div>
          {llmStatus.status === 'loading' && <Progress value={llmStatus.progress} />}
        </div>
        {settings.llmProvider !== 'scripted' && llmStatus.status !== 'ready' && llmStatus.status !== 'loading' && (
          <button className="btn sm" onClick={() => void llm.load()}>
            {settings.llmProvider === 'webllm' ? 'Charger' : 'Connecter'}
          </button>
        )}
      </div>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="progress thin" style={{ marginTop: 6 }}>
      <span style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

/* ------------------------------ Page ------------------------------ */

export default function Tutor() {
  const profileLevel = useAppState((s) => s.profile.level);
  const name = useAppState((s) => s.profile.name);
  const settings = useAppState((s) => s.settings);
  const [topic, setTopic] = useState<TutorTopic>(TOPICS[0]);
  const [level, setLevelState] = useState<Level>(profileLevel ?? 'A2');
  const [session, setSession] = useState<TutorSession | null>(null);

  // Recharge automatiquement depuis le cache ce qui a déjà été téléchargé.
  useEffect(() => {
    void (async () => {
      // La voix neuronale est l'essentiel de l'expérience : on la prépare dès l'arrivée sur la page.
      if (settings.ttsEngine === 'kokoro' && tts.kokoro.status === 'idle') tts.loadKokoro();
      // Un chargement du LLM déjà interrompu (onglet planté faute de mémoire ?) : pas de relance
      // automatique, sinon la page replanterait à chaque visite. Le bouton « Charger » reste disponible.
      if (
        settings.llmProvider === 'webllm' &&
        llm.status.status === 'idle' &&
        interruptedLoads('webllm').count === 0 &&
        (await llm.isCached())
      )
        void llm.load();
      if (settings.llmProvider === 'scripted') void llm.load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Changement de moteur : on (re)vérifie le statut
    if (settings.llmProvider !== 'webllm') void llm.load();
  }, [settings.llmProvider]);

  if (session) return <Conversation session={session} onExit={() => setSession(null)} />;

  return (
    <div className="container">
      <div className="page-head">
        <h1 className="title-icon">
          <IconBadge icon={ICONS.chat} tone="accent" />
          Parler avec Emma
        </h1>
        <p>Votre prof d'anglais vocale : elle vous pose des questions, vous répondez à voix haute, elle vous corrige avec bienveillance.</p>
      </div>
      <div className="tutor-layout">
        <div className="card tutor-stage">
          <div className="avatar-wrap">
            <Avatar state="idle" mood="happy" />
          </div>
          <p className="center small muted" style={{ margin: 0 }}>
            « Hi! I'm Emma. Choose a topic and let's talk! »
          </p>
        </div>
        <div className="stack">
          <div className="card">
            <h3>1. Choisissez un thème</h3>
            <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {TOPICS.map((t) => (
                <button key={t.id} className="topic-card" aria-pressed={topic.id === t.id} onClick={() => setTopic(t)}>
                  <IconBadge icon={topicIcon(t.id)} tone={topic.id === t.id ? 'primary' : 'neutral'} size={22} />
                  <span>
                    <strong>{t.title}</strong>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {t.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <h3>2. Niveau de la conversation</h3>
            <div className="level-tabs" role="radiogroup" aria-label="Niveau">
              {LEVELS.map((l) => (
                <button key={l} role="radio" data-lv={l} aria-checked={level === l} aria-selected={level === l} className="level-tab" onClick={() => setLevelState(l)}>
                  {l}
                  {l === profileLevel && <Icon name="star" size={13} style={{ fill: 'currentColor', marginLeft: 4 }} label="mon niveau" />}
                </button>
              ))}
            </div>
            <label className="switch">
              <span>
                <strong>Micro ouvert en permanence</strong>
                <span className="tiny muted" style={{ display: 'block' }}>
                  Le micro s'active dès le début et reste ouvert : parlez quand vous voulez, la transcription s'affiche en direct. Emma
                  répond après {(settings.silenceMs / 1000).toFixed(1)} s de silence.
                </span>
              </span>
              <input type="checkbox" checked={settings.handsFree} onChange={(e) => updateSettings({ handsFree: e.target.checked })} />
            </label>
            <label className="switch">
              <span>
                <strong>Sous-titres</strong>
                <span className="tiny muted" style={{ display: 'block' }}>
                  Afficher ce que dit Emma (désactivez pour entraîner votre oreille).
                </span>
              </span>
              <input type="checkbox" checked={settings.subtitles} onChange={(e) => updateSettings({ subtitles: e.target.checked })} />
            </label>
          </div>
          <EnginePanel />
          <StartButton
            onStart={() => {
              tts.unlockAudio();
              setSession(new TutorSession(topic, level, name));
            }}
          />
          <p className="tiny muted center">
            Astuce : utilisez un casque ou des écouteurs pour éviter que le micro n'entende la voix d'Emma.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Démarre la conversation… en attendant la voix neuronale si elle est en cours de chargement. */
function StartButton({ onStart }: { onStart: () => void }) {
  const engine = useAppState((s) => s.settings.ttsEngine);
  const kokoro = useService(tts, () => ({ ...tts.kokoro }));
  const [waiting, setWaiting] = useState(false);
  const loading = engine === 'kokoro' && kokoro.status === 'loading';

  useEffect(() => {
    if (waiting && !loading) {
      setWaiting(false);
      onStart();
    }
  }, [waiting, loading, onStart]);

  if (waiting && loading) {
    return (
      <div className="card center" aria-live="polite">
        <strong>Emma s'échauffe la voix… {Math.round(kokoro.progress * 100)} %</strong>
        <Progress value={kokoro.progress} />
        <p className="tiny muted" style={{ margin: '8px 0' }}>
          Premier lancement uniquement : la voix est ensuite gardée en cache sur cet appareil.
        </p>
        <button
          className="btn ghost sm"
          onClick={() => {
            setWaiting(false);
            onStart();
          }}
        >
          Commencer tout de suite (voix du système, moins naturelle)
        </button>
      </div>
    );
  }
  return (
    <button
      className="btn primary lg block"
      onClick={() => {
        tts.unlockAudio();
        if (loading) setWaiting(true);
        else onStart();
      }}
    >
      <Icon name="mic" /> Commencer la conversation
    </button>
  );
}

/* ------------------------------ Conversation ------------------------------ */

function Conversation({ session, onExit }: { session: TutorSession; onExit: () => void }) {
  const settings = useAppState((s) => s.settings);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setState] = useState<AvatarState>('idle');
  const [mood, setMood] = useState<AvatarMood>('neutral');
  const [subtitle, setSubtitle] = useState('');
  const [interim, setInterim] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [help, setHelp] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const [summary, setSummary] = useState<null | {
    turns: number;
    minutes: number;
    corrections: Correction[];
    xp: number;
    pron: PronResult[];
  }>(null);

  const listener = useRef<ContinuousListener | null>(null);
  const [micOn, setMicOn] = useState(false);
  const micOnRef = useRef(false);
  const [micState, setMicState] = useState<ContinuousState>('stopped');
  const [micDetail, setMicDetail] = useState('');
  const alive = useRef(true);
  const busy = useRef(false);
  const startedAt = useRef(Date.now());
  const userTurns = useRef(0);
  const xpRef = useRef(0);
  const chatEnd = useRef<HTMLDivElement>(null);
  const abortCtl = useRef<AbortController | null>(null);
  /** Génération : toute action de l'utilisateur invalide les suites asynchrones en cours. */
  const gen = useRef(0);

  const rate = (() => {
    const base = settings.speechRate;
    return session.band === 'A' ? base * 0.88 : session.band === 'B' ? base * 0.95 : base;
  })();

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, interim]);

  /** Lit une suite de phrases en mettant à jour les sous-titres. */
  const speakQueue = useRef<Promise<void>>(Promise.resolve());
  const enqueueSpeech = (text: string) => {
    setState('speaking');
    // Le micro reste ouvert mais ignore ce qu'il capte pendant qu'Emma parle (pas d'écho).
    listener.current?.pause();
    // Une phrase = un job TTS : la voix démarre plus tôt et les sous-titres suivent phrase par phrase.
    for (const sentence of splitSentences(text)) {
      const p = tts.speak(sentence, rate);
      const prev = speakQueue.current;
      void prev.then(() => {
        if (alive.current) setSubtitle(sentence);
      });
      speakQueue.current = prev.then(() => p);
    }
  };

  const waitSpeech = async () => {
    await speakQueue.current;
    // laisse finir l'écho éventuel de la pièce avant d'ouvrir le micro
    await new Promise((r) => setTimeout(r, 250));
  };

  /** Fin du tour d'Emma : on rouvre l'écoute si le micro est actif. */
  const backToListening = () => {
    if (!alive.current) return;
    if (micOnRef.current) {
      listener.current?.resume();
      setState('listening');
    } else setState('idle');
  };

  const getListener = () => {
    if (!listener.current) {
      listener.current = new ContinuousListener({
        onLevel: (l) => setMicLevel(l),
        onState: (st, detail) => {
          setMicState(st);
          if (detail) setMicDetail(detail);
          if (st === 'hearing') setError('');
        },
        onInterim: (t) => setInterim(t),
        onFinal: (t, audio) => {
          setInterim('');
          void handleUserText(t, audio);
        },
        onError: (m) => {
          setError(m);
          micOnRef.current = false;
          setMicOn(false);
          setInterim('');
          setState((st) => (st === 'listening' ? 'idle' : st));
        },
      });
    }
    return listener.current;
  };

  /** Active / coupe le micro (il reste ouvert jusqu'à ce qu'on le coupe). */
  const setMic = (on: boolean) => {
    micOnRef.current = on;
    setMicOn(on);
    setError('');
    if (on) {
      const l = getListener();
      const emmaBusy = busy.current || tts.isSpeaking;
      if (emmaBusy) l.pause();
      else {
        l.resume();
        setState('listening');
      }
      void l.start();
    } else {
      listener.current?.stop();
      listener.current = null;
      setInterim('');
      setMicLevel(0);
      setState((st) => (st === 'listening' ? 'idle' : st));
    }
  };

  const handleUserText = async (text: string, audio?: Float32Array) => {
    if (busy.current) return;
    busy.current = true;
    const g = ++gen.current;
    listener.current?.pause();
    setInterim('');
    const uid = turnId++;
    // Pas d'analyse de prononciation anglaise sur une phrase dite en français.
    const analyse = !!audio && getState().settings.pronAnalysis && audio.length > 8000 && !looksFrench(text);
    setTurns((t) => [...t, { id: uid, role: 'user', text, pron: analyse ? 'pending' : undefined }]);
    if (analyse) {
      // Analyse en parallèle de la réponse d'Emma : les mots à retravailler se soulignent dès qu'elle est prête.
      void pron.analyze(audio!, text).then((res) => {
        if (alive.current || res) setTurns((t) => t.map((x) => (x.id === uid ? { ...x, pron: res } : x)));
      });
    }
    setState('thinking');
    setMood('neutral');
    abortCtl.current = new AbortController();
    try {
      const res = await session.respond(text, (s) => enqueueSpeech(s), abortCtl.current.signal);
      // La réponse est générée : l'apprenant peut de nouveau parler/écrire (et interrompre Emma).
      busy.current = false;
      if (!alive.current) return;
      setTurns((t) => {
        const copy = t.slice();
        const lastUser = copy.map((x) => x.role).lastIndexOf('user');
        if (lastUser >= 0 && res.correction) copy[lastUser] = { ...copy[lastUser], correction: res.correction };
        return [...copy, { id: turnId++, role: 'tutor', text: res.reply }];
      });
      // Une traduction (l'apprenant a parlé français) n'est pas une faute.
      const mistake = !!res.correction && !res.correction.translation;
      setMood(mistake ? 'concerned' : res.correction ? 'neutral' : 'happy');
      userTurns.current++;
      const gained = 5 + (res.correction ? 0 : 3);
      xpRef.current += gained;
      const badges = reward({
        xp: gained,
        day: { tutorTurns: 1 },
        totals: { tutorTurns: 1, corrections: mistake ? 1 : 0 },
        topic: session.topic.id,
      });
      notifyBadges(badges);
      claimQuests().forEach((q) => notify('ok', `Quête accomplie : ${q.label} (+${q.reward} XP)`));
      if (!res.correction) sfx('pop');
      await waitSpeech();
      if (!alive.current || g !== gen.current) return;
      setMood('neutral');
      if (res.ended) {
        setEnded(true);
        setMic(false);
        setState('idle');
        return;
      }
      busy.current = false;
      backToListening();
    } catch (err) {
      setError(String((err as Error).message ?? err));
      backToListening();
    } finally {
      busy.current = false;
    }
  };

  // Démarrage : ouverture instantanée
  useEffect(() => {
    alive.current = true;
    const open = session.opening();
    setTurns([{ id: turnId++, role: 'tutor', text: open.reply }]);
    setSubtitle(open.spoken[0]);
    open.spoken.forEach((s) => enqueueSpeech(s));
    const g = gen.current;
    // Mains libres : le micro s'ouvre dès le début (il est en pause tant qu'Emma parle).
    // (après un chargement interrompu, le service attend un essai manuel : bouton « Réessayer »)
    if (getState().settings.pronAnalysis) pron.load();
    // Compréhension des réponses (petit modèle local) : prête avant la première réponse.
    session.warmUp();
    if (getState().settings.handsFree) setMic(true);
    void (async () => {
      await waitSpeech();
      if (!alive.current || g !== gen.current) return;
      backToListening();
    })();
    return () => {
      alive.current = false;
      listener.current?.stop();
      listener.current = null;
      abortCtl.current?.abort();
      llm.interrupt();
      tts.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const replay = (slow = false) => {
    const g = ++gen.current;
    tts.stop();
    listener.current?.pause();
    speakQueue.current = Promise.resolve();
    setState('speaking');
    void tts.speak(session.lastSpoken, slow ? rate * 0.75 : rate).then(() => {
      if (!alive.current || g !== gen.current) return;
      window.setTimeout(backToListening, 250);
    });
    setSubtitle(session.lastSpoken);
  };

  const finish = () => {
    alive.current = false;
    listener.current?.stop();
    listener.current = null;
    tts.stop();
    const corrections = turns.filter((t) => t.correction).map((t) => t.correction!) ;
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    reward({ xp: 0, totals: { tutorSeconds: Math.round((Date.now() - startedAt.current) / 1000) } });
    if (corrections.length) {
      addSrsCards(
        corrections.map((c) => ({
          id: `p:${c.corrected.toLowerCase().slice(0, 80)}`,
          kind: 'phrase' as const,
          front: c.corrected,
          back: c.explanation || 'Phrase corrigée par Emma',
          note: `Vous aviez dit : ${c.original}`,
        })),
      );
    }
    const pronResults = turns.map((t) => t.pron).filter((x): x is PronResult => !!x && x !== 'pending');
    const flagged = pronResults.flatMap((r) => r.words.filter((w) => w.issues.length));
    if (flagged.length) {
      addSrsCards(
        flagged.slice(0, 20).map((w) => ({
          id: `pr:${w.word.toLowerCase().replace(/[^a-z']/g, '')}`,
          kind: 'phrase' as const,
          front: w.word.replace(/[^A-Za-z']/g, ''),
          back: w.issues.map((i) => `${i.label} : ${i.tip}`).join(' '),
          note: `Prononciation attendue /${w.expected}/`,
        })),
      );
    }
    setSummary({ turns: userTurns.current, minutes, corrections, xp: xpRef.current, pron: pronResults });
  };

  const micClick = () => setMic(!micOnRef.current);

  if (summary) {
    return (
      <div className="narrow">
        <div className="card center">
          <div className="avatar-wrap" style={{ width: 180, margin: '0 auto' }}>
            <Avatar state="idle" mood="happy" />
          </div>
          <h1>Great job!</h1>
          <div className="row" style={{ justifyContent: 'center', gap: 28, margin: '14px 0' }}>
            <div className="stat">
              <IconBadge icon={ICONS.chat} tone="accent" />
              <div>
                <div className="big">{summary.turns}</div>
                <div className="tiny muted">réponses</div>
              </div>
            </div>
            <div className="stat">
              <IconBadge icon={ICONS.hourglass} tone="info" />
              <div>
                <div className="big">{summary.minutes}</div>
                <div className="tiny muted">min</div>
              </div>
            </div>
            <div className="stat">
              <IconBadge icon={ICONS.xp} tone="gold" />
              <div>
                <div className="big">+{summary.xp}</div>
                <div className="tiny muted">XP</div>
              </div>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={onExit}>
              Nouveau thème
            </button>
            <button className="btn primary" onClick={() => navigate('/revisions')}>
              <Icon name="review" size={18} /> Réviser mes corrections
            </button>
          </div>
        </div>
        <h2 className="section-title">
          <Icon name="recap" /> Bilan correctif
        </h2>
        <PronRecap results={summary.pron} />
        <h3 className="mt label-icon">
          <Icon name="write" /> Grammaire et vocabulaire
        </h3>
        {summary.corrections.length > 0 ? (
          <div className="stack">
            {summary.corrections.map((c, i) => (
              <CorrectionCard key={i} c={c} />
            ))}
          </div>
        ) : (
          <p className="small muted">Aucune faute de grammaire relevée pendant cette conversation. Bravo !</p>
        )}
        {(summary.corrections.length > 0 || summary.pron.some((r) => r.words.some((w) => w.issues.length))) && (
          <p className="tiny muted mt">Les phrases corrigées et les mots à retravailler ont été ajoutés à vos révisions.</p>
        )}
      </div>
    );
  }

  const q = session.awaitingQuestion();
  const stateLabel =
    state === 'speaking'
      ? 'Emma parle…'
      : state === 'thinking'
        ? 'Emma réfléchit…'
        : !micOn
          ? 'Activez le micro pour parler'
          : micState === 'loading'
            ? `Préparation de l\u2019écoute… ${micDetail}`
            : micState === 'hearing'
              ? 'Je vous entends…'
              : micState === 'transcribing'
                ? 'Transcription…'
                : 'Je vous écoute : parlez quand vous voulez';

  return (
    <div className="container">
      <div className="row between mb">
        <div className="row">
          <button className="btn ghost sm" onClick={finish}>
            <Icon name="check" size={16} /> Terminer
          </button>
          <span className="chip">
            {(() => {
              const TI = topicIcon(session.topic.id);
              return <TI size={14} aria-hidden />;
            })()}{' '}
            {session.topic.title}
          </span>
          <LevelBadge level={session.level} />
        </div>
        <span className="chip primary">
          <Icon name={llm.ready ? 'ai' : 'quests'} size={14} /> {llm.ready ? 'IA locale' : 'Mode scripté'} · {Math.min(session.qIndex, session.questions.length)}/{session.questions.length}
        </span>
      </div>

      <div className="tutor-layout">
        <div className="card tutor-stage">
          <div className={`avatar-wrap${state === 'listening' ? ' listening' : ''}`}>
            <Avatar state={state} mood={mood} />
          </div>
          <span className={`state-pill ${state}`} aria-live="polite">
            <span className="dot" />
            {stateLabel}
          </span>
          {micOn && state === 'listening' && (
            <div className="level-meter" aria-hidden>
              <span style={{ width: `${Math.round(micLevel * 100)}%` }} />
            </div>
          )}
          {state === 'listening' ? (
            <p className="subtitle" aria-live="polite">
              {interim ? `« ${interim} »` : <span className="muted">…</span>}
            </p>
          ) : (
            settings.subtitles && <p className="subtitle">{subtitle}</p>
          )}
          <div className="controls">
            <button className="btn icon" onClick={() => replay(false)} aria-label="Répéter" title="Répéter">
              <Icon name="replay" size={20} />
            </button>
            <button className="btn icon" onClick={() => replay(true)} aria-label="Répéter lentement" title="Plus lentement">
              <Icon name="slow" size={20} />
            </button>
            <button
              className={`mic-btn${micOn ? ' listening' : ''}`}
              onClick={micClick}
              disabled={ended}
              aria-pressed={micOn}
              aria-label={micOn ? 'Couper le micro' : 'Activer le micro'}
              title={micOn ? 'Micro ouvert : touchez pour le couper' : 'Activer le micro'}
            >
              {micOn ? <Icon name="mic" size={36} /> : <Icon name="micOff" size={36} />}
            </button>
            <button className="btn icon" onClick={() => setHelp(!help)} aria-pressed={help} aria-label="Aide" title="Aide">
              <Icon name="tip" size={20} />
            </button>
            <button
              className="btn icon"
              onClick={() => {
                gen.current++;
                tts.stop();
                speakQueue.current = Promise.resolve();
                backToListening();
              }}
              aria-label="Interrompre Emma"
              title="Interrompre"
            >
              <Icon name="hand" size={20} />
            </button>
          </div>
          <p className="tiny muted center" style={{ margin: 0 }}>
            {micOn
              ? `Micro ouvert en permanence · ${resolveSttEngine() === 'whisper' ? 'Whisper local' : 'reconnaissance du navigateur'} · Emma répond après ${(settings.silenceMs / 1000).toFixed(1)} s de silence`
              : 'Micro coupé · vous pouvez aussi écrire votre réponse'}
          </p>
          {micOn && micState === 'hearing' && (
            <button className="btn sm" onClick={() => listener.current?.flush()}>
              ⏎ J'ai fini ma phrase
            </button>
          )}
          {error && (
            <p className="small center" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
          {ended && (
            <button className="btn primary" onClick={finish}>
              Voir le bilan →
            </button>
          )}
        </div>

        <div className="stack">
          {help && q && (
            <div className="help-box">
              <strong className="label-icon">
                <Icon name="tip" size={18} /> Pour répondre à : « {q.q} »
              </strong>
              <ul className="small" style={{ margin: '6px 0', paddingLeft: 18 }}>
                {q.starters.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              {q.words && (
                <div className="tiny muted label-icon">
                  <Icon name="dictionary" size={14} /> {q.words.join(' · ')}
                </div>
              )}
            </div>
          )}
          <div className="chat" aria-live="polite">
            {turns.map((t) => (
              <TurnView key={t.id} t={t} />
            ))}
            {interim && <div className="bubble user interim">{interim}</div>}
            <div ref={chatEnd} />
          </div>
          <form
            className="row"
            style={{ flexWrap: 'nowrap' }}
            onSubmit={(e) => {
              e.preventDefault();
              const v = typed.trim();
              if (!v) return;
              if (busy.current) {
                notify('hourglass', 'Emma prépare sa réponse, un instant…');
                return;
              }
              setTyped('');
              gen.current++;
              tts.stop();
              speakQueue.current = Promise.resolve();
              void handleUserText(v);
            }}
          >
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="…ou écrivez votre réponse en anglais"
              aria-label="Écrire une réponse"
            />
            <button className="btn primary" type="submit" disabled={!typed.trim()}>
              Envoyer
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function TurnView({ t }: { t: Turn }) {
  if (t.role === 'tutor')
    return (
      <div className="bubble tutor">
        <button className="round-btn" style={{ float: 'right', marginLeft: 8, width: 30, height: 30 }} onClick={() => void tts.speak(t.text)} aria-label="Réécouter">
          <Icon name="speaker" size={16} />
        </button>
        {t.text}
      </div>
    );
  const res = t.pron && t.pron !== 'pending' ? t.pron : null;
  const flagged = res ? res.words.filter((w) => w.issues.length) : [];
  return (
    <>
      <div className="bubble user">
        {res ? <PronText result={res} /> : t.text}
        {t.pron === 'pending' && <span className="pron-pending"> · analyse de la prononciation…</span>}
      </div>
      {res && <PronCard result={res} flagged={flagged} />}
      {t.correction && <CorrectionCard c={t.correction} />}
    </>
  );
}

/* ------------------------------ Prononciation ------------------------------ */

function PronEngineRow() {
  const enabled = useAppState((s) => s.settings.pronAnalysis);
  const st = useService(pron, () => ({ ...pron.status }));
  return (
    <div className="engine-row">
      <span className={`status-dot ${!enabled ? 'idle' : st.status === 'idle' ? 'ready' : st.status}`} />
      <div style={{ flex: 1 }}>
        <strong className="small">Analyse de prononciation</strong>
        <div className="tiny muted">
          {!enabled
            ? 'Désactivée'
            : st.status === 'idle'
              ? 'Repère vos erreurs de prononciation (TH, H, R, voyelles…) · modèle local ≈ 320 Mo, chargé au début de la conversation'
              : st.status === 'error'
                ? `Erreur : ${st.detail}`
                : st.detail}
        </div>
        {st.status === 'loading' && (
          <div className="progress thin" style={{ marginTop: 6 }}>
            <span style={{ width: `${Math.round(st.progress * 100)}%` }} />
          </div>
        )}
      </div>
      {enabled && st.status === 'error' && (
        <button className="btn sm" onClick={() => pron.load({ manual: true })}>
          Réessayer
        </button>
      )}
      <input
        type="checkbox"
        className="toggle"
        aria-label="Analyse de prononciation"
        checked={enabled}
        onChange={(e) => updateSettings({ pronAnalysis: e.target.checked })}
      />
    </div>
  );
}

/** Texte de l'apprenant avec les mots mal prononcés soulignés. */
function PronText({ result }: { result: PronResult }) {
  return (
    <>
      {result.words.map((w, i) => {
        const sev = w.issues.some((x) => x.severity === 'major') ? 'major' : w.issues.length ? 'minor' : '';
        return (
          <span key={i}>
            {sev ? (
              <span className={`pron-word ${sev}`} title={w.issues.map((x) => x.label).join(' · ')}>
                {w.word}
              </span>
            ) : (
              w.word
            )}{' '}
          </span>
        );
      })}
    </>
  );
}

function PronCard({ result, flagged }: { result: PronResult; flagged: WordAssessment[] }) {
  const tone = result.score >= 85 ? 'good' : result.score >= 65 ? 'ok' : 'low';
  return (
    <div className={`pron-card ${tone}`}>
      <div className="row between">
        <strong className="label-icon">
          <Icon name="voice" size={18} /> Prononciation : {result.score} %
        </strong>
        {!flagged.length && <span className="small label-icon">
            <Icon name="ok" size={16} /> Rien à signaler
          </span>}
      </div>
      {flagged.map((w, i) => (
        <PronWordLine key={i} w={w} />
      ))}
    </div>
  );
}

function cleanWord(w: string) {
  return w.replace(/[^A-Za-z']/g, '');
}

function PronWordLine({ w }: { w: WordAssessment }) {
  return (
    <div className="pron-line">
      <button className="round-btn" style={{ width: 30, height: 30 }} onClick={() => void tts.speak(cleanWord(w.word), 0.8)} aria-label={`Écouter ${cleanWord(w.word)}`}>
        <Icon name="speaker" size={16} />
      </button>
      <div style={{ flex: 1 }}>
        <span className={`pron-word ${w.issues.some((x) => x.severity === 'major') ? 'major' : 'minor'}`}>{cleanWord(w.word)}</span>{' '}
        <span className="tiny muted">
          attendu /{w.expected}/ · entendu /{w.heard || '—'}/
        </span>
        {w.issues.map((x) => (
          <div key={x.id} className="small">
            <strong>{x.label}</strong> — {x.tip}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bilan de fin : erreurs de prononciation regroupées par son, avec les mots concernés. */
function PronRecap({ results }: { results: PronResult[] }) {
  if (!results.length) {
    return (
      <div className="card flat small muted">
        <Icon name="voice" size={16} className="inline-ico" /> Prononciation : pas d’analyse pour cette conversation (activez « Analyse de prononciation » et répondez à voix haute).
      </div>
    );
  }
  const avg = Math.round(results.reduce((a, r) => a + r.score, 0) / results.length);
  const groups = new Map<string, { issue: PronIssue; words: WordAssessment[] }>();
  for (const r of results)
    for (const w of r.words)
      for (const is of w.issues) {
        const g = groups.get(is.id) ?? { issue: is, words: [] };
        if (!g.words.some((x) => cleanWord(x.word).toLowerCase() === cleanWord(w.word).toLowerCase())) g.words.push(w);
        groups.set(is.id, g);
      }
  const sorted = [...groups.values()].sort((a, b) => (a.issue.severity === b.issue.severity ? b.words.length - a.words.length : a.issue.severity === 'major' ? -1 : 1));
  return (
    <div className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }} className="label-icon">
          <Icon name="voice" /> Prononciation
        </h3>
        <span className={`chip ${avg >= 85 ? 'primary' : avg >= 65 ? 'gold' : 'accent'}`}>Score moyen : {avg} %</span>
      </div>
      {sorted.length === 0 ? (
        <p className="small" style={{ marginTop: 8 }}>
          Aucune erreur marquante : votre prononciation est claire.
        </p>
      ) : (
        <div className="stack mt">
          {sorted.map((g) => (
            <div key={g.issue.id} className="pron-group">
              <div className="row between">
                <strong>
                  <span className={`sev-dot ${g.issue.severity}`} aria-label={g.issue.severity === 'major' ? 'important' : 'mineur'} /> {g.issue.label}
                </strong>
                <span className="tiny muted">
                  {g.words.length} mot{g.words.length > 1 ? 's' : ''}
                </span>
              </div>
              <p className="small" style={{ margin: '4px 0' }}>
                {g.issue.tip}
              </p>
              <div className="row" style={{ gap: 6 }}>
                {g.words.slice(0, 12).map((w, i) => (
                  <button key={i} className="chip" onClick={() => void tts.speak(cleanWord(w.word), 0.8)} title={`attendu /${w.expected}/ · entendu /${w.heard}/`}>
                    <Icon name="speaker" size={14} /> {cleanWord(w.word)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Carte de correction : diff + explication + entraînement à redire la phrase. */
function CorrectionCard({ c }: { c: Correction }) {
  const [tryState, setTryState] = useState<'idle' | 'listening' | 'done'>('idle');
  const [score, setScore] = useState<number | null>(null);
  const diff = wordDiff(c.original, c.corrected);
  const retry = async () => {
    setTryState('listening');
    try {
      const heard = await listen({ silenceMs: 1400, noSpeechMs: 7000 }).result;
      const s = heard ? speechScore(c.corrected, heard).score : 0;
      setScore(s);
      if (s >= 0.8) {
        sfx('win');
        reward({ xp: 3, day: { speakOk: 1 }, totals: { speakOk: 1 } });
      }
    } catch {
      setScore(0);
    }
    setTryState('done');
  };
  return (
    <div className="correction">
      <div>
        <Icon name="write" size={16} className="inline-ico" />{' '}
        {c.translation ? (
          <>
            <span className="muted">{c.original}</span> → <ins>{c.corrected}</ins>
          </>
        ) : (
          diff.map((d, i) =>
          d.type === 'same' ? (
            <span key={i}>{d.text} </span>
          ) : d.type === 'del' ? (
            <del key={i}>{d.text} </del>
          ) : (
            <ins key={i}>{d.text} </ins>
          ),
          )
        )}
      </div>
      {c.explanation && (
        <div className="small" style={{ marginTop: 4 }}>
          <Icon name="tip" size={14} className="inline-ico" /> <Rich text={c.explanation} />
        </div>
      )}
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn ghost sm" onClick={() => void tts.speak(c.corrected)}>
          <Icon name="speaker" size={16} /> Écouter
        </button>
        <button className="btn ghost sm" onClick={() => void retry()} disabled={tryState === 'listening'}>
          {tryState === 'listening' ? (
            <>
              <Icon name="mic" size={16} /> Je vous écoute…
            </>
          ) : (
            <>
              <Icon name="replay" size={16} /> {c.translation ? 'Le dire en anglais' : 'Redire correctement'}
            </>
          )}
        </button>
        {score != null && <span className="small">{score >= 0.8 ? 'Parfait !' : `${Math.round(score * 100)} % — réessayez`}</span>}
      </div>
    </div>
  );
}
