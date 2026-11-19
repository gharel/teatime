/* ------------------------------------------------------------------
 * Mini-jeux de la zone gamifiée. Records personnels (pas de faux
 * classements), XP proportionnels au score, combos.
 * ------------------------------------------------------------------ */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Level, OrderExercise, VocabItem } from '../types';
import { LEVELS } from '../types';
import { UNITS_BY_LEVEL } from '../data/lessons';
import { FALSE_FRIENDS } from '../data/falseFriends';
import { MINIMAL_PAIRS, TONGUE_TWISTERS } from '../data/pronunciation';
import { IRREGULAR_VERBS, formMatches, type IrregularVerb } from '../data/irregularVerbs';
import { COMMON_MISTAKES, type CommonMistake } from '../data/commonMistakes';
import { checkAnswer, normalize, pick, shuffle, speechScore } from '../lib/text';
import { claimQuests, getState, reward, saveBest } from '../lib/store';
import { say } from '../lib/tts';
import { listen } from '../lib/stt';
import { celebrate, navigate, notify, notifyBadges, Rich, sfx, useKey } from '../components/ui';
import Icon, { ICONS, IconBadge, gameIcon } from '../components/Icon';

export const GAMES = [
  { id: 'chrono', title: 'Chrono-Vocab', desc: '60 secondes pour traduire un maximum de mots. Les combos doublent les points !' },
  { id: 'faux-amis', title: 'Faux amis', desc: '« Actually » veut-il dire « actuellement » ? Déjouez les pièges du français.' },
  { id: 'puzzle', title: 'Puzzle de phrases', desc: 'Remettez un maximum de phrases dans l’ordre en 90 secondes.' },
  { id: 'dictee', title: 'Dictée éclair', desc: 'Écoutez et écrivez 8 phrases. Précision et rapidité !' },
  { id: 'prononciation', title: 'Défi prononciation', desc: 'Ship ou sheep ? Think ou sink ? Entraînez votre oreille et votre bouche.' },
  { id: 'verbes', title: 'Verbes irréguliers', desc: 'Go, went, gone ! 90 secondes pour écrire un maximum de prétérits et de participes.' },
  { id: 'phrase-juste', title: 'Phrase juste ?', desc: '« I am agree » ? Repérez en 60 secondes les fautes typiques des francophones.' },
  { id: 'memory', title: 'Memory des mots', desc: 'Retrouvez les paires anglais–français en retournant le moins de cartes possible.' },
] as const;

export type GameId = (typeof GAMES)[number]['id'];

function levelsUpTo(): Level[] {
  const lv = getState().profile.level ?? 'A2';
  const idx = Math.max(1, LEVELS.indexOf(lv)); // au moins A1 + A2
  return LEVELS.slice(0, idx + 1);
}

function vocabPool(): VocabItem[] {
  return levelsUpTo().flatMap((l) => UNITS_BY_LEVEL[l].flatMap((u) => u.vocab));
}

function orderPool(): OrderExercise[] {
  return levelsUpTo().flatMap((l) =>
    UNITS_BY_LEVEL[l].flatMap((u) => u.exercises.filter((e): e is OrderExercise => e.type === 'order')),
  );
}

function dictationPool(): string[] {
  const fromEx = levelsUpTo().flatMap((l) =>
    UNITS_BY_LEVEL[l].flatMap((u) => u.exercises.flatMap((e) => (e.type === 'listen' && !e.options ? [e.audio] : []))),
  );
  const fromVocab = vocabPool()
    .map((v) => v.example)
    .filter((s) => s.split(' ').length <= 9 && !/\d/.test(s));
  return [...fromEx, ...fromVocab];
}

/* ------------------------------ Coque commune ------------------------------ */

function GameOver({ game, score, unit, onReplay, xpFactor = 1 }: { game: GameId; score: number; unit: string; onReplay: () => void; xpFactor?: number }) {
  const [res] = useState(() => {
    const prev = getState().bests[game] ?? 0;
    const record = saveBest(game, score);
    const xp = Math.max(5, Math.round(score * xpFactor));
    const badges = reward({ xp, day: { games: 1 }, totals: { games: 1 } });
    const quests = claimQuests();
    return { prev, record, xp, badges, quests };
  });
  useEffect(() => {
    notifyBadges(res.badges);
    res.quests.forEach((q) => notify('ok', `Quête accomplie : ${q.label} (+${q.reward} XP)`));
    if (res.record && score > 0) {
      celebrate();
      sfx('win');
    }
  }, [res, score]);
  return (
    <div className="card center">
      <IconBadge icon={res.record && score > 0 ? ICONS.trophy : ICONS.target} tone="gold" size={34} className="hero-ico" />
      <h2>{res.record && score > 0 ? 'Nouveau record !' : 'Partie terminée'}</h2>
      <p style={{ fontSize: '2.4rem', fontWeight: 900, margin: 0 }}>
        {score} <span className="small muted">{unit}</span>
      </p>
      <p className="muted">
        Record précédent : {res.prev} · +{res.xp} XP
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => navigate('/jeux')}>
          ← Tous les jeux
        </button>
        <button className="btn primary" onClick={onReplay}>
          <Icon name="replay" size={18} /> Rejouer
        </button>
      </div>
    </div>
  );
}

function useCountdown(seconds: number, running: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(seconds);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useEffect(() => {
    if (!running) return;
    setLeft(seconds);
    const start = performance.now();
    const t = window.setInterval(() => {
      const l = Math.max(0, seconds - Math.floor((performance.now() - start) / 1000));
      setLeft(l);
      if (l <= 5 && l > 0) sfx('tick');
      if (l === 0) {
        window.clearInterval(t);
        endRef.current();
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [seconds, running]);
  return left;
}

function Hud({ left, score, combo, label = 'pts' }: { left?: number; score: number; combo?: number; label?: string }) {
  return (
    <div className="row between mb">
      {left != null ? (
        <span className="chip" style={{ fontSize: '1.1rem', color: left <= 10 ? 'var(--danger)' : undefined }} aria-live="off">
          <Icon name="hourglass" size={16} /> {left}s
        </span>
      ) : (
        <span />
      )}
      {combo != null && combo >= 3 && (
        <span className="combo" key={combo}>
          <Icon name="flame" size={18} /> x{combo >= 5 ? 2 : 1} · {combo}
        </span>
      )}
      <span className="chip gold" style={{ fontSize: '1.1rem' }}>
        <Icon name="star" size={16} style={{ fill: 'currentColor' }} /> {score} {label}
      </span>
    </div>
  );
}

function StartCard({ title, icon, desc, onStart, extra }: { title: string; icon: GameId; desc: string; onStart: () => void; extra?: React.ReactNode }) {
  return (
    <div className="card center">
      <IconBadge icon={gameIcon(icon)} tone="primary" size={34} className="hero-ico" />
      <h1>{title}</h1>
      <p className="muted">{desc}</p>
      {extra}
      <button className="btn primary lg" onClick={onStart} autoFocus>
        C'est parti !
      </button>
    </div>
  );
}

/* ------------------------------ Chrono-Vocab ------------------------------ */

export function ChronoVocab() {
  const [phase, setPhase] = useState<'start' | 'play' | 'end'>('start');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [round, setRound] = useState(0);
  const [flash, setFlash] = useState<null | number>(null);
  const pool = useMemo(() => vocabPool(), []);
  const q = useMemo(() => {
    const item = pick(pool);
    const wrong = shuffle(pool.filter((v) => v.fr !== item.fr)).slice(0, 3);
    const enToFr = Math.random() < 0.7;
    const options = shuffle([item, ...wrong]);
    return { item, options, enToFr };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, pool]);
  const left = useCountdown(60, phase === 'play', () => setPhase('end'));

  const answer = (i: number) => {
    if (flash != null) return;
    const ok = q.options[i].fr === q.item.fr;
    setFlash(i);
    if (ok) {
      const c = combo + 1;
      setCombo(c);
      setScore((s) => s + (c >= 5 ? 2 : 1));
      sfx('ok');
    } else {
      setCombo(0);
      sfx('ko');
    }
    window.setTimeout(() => {
      setFlash(null);
      setRound((r) => r + 1);
    }, ok ? 220 : 700);
  };

  useKey(
    (e) => {
      if (phase === 'play' && /^[1-4]$/.test(e.key)) answer(Number(e.key) - 1);
    },
    [phase, q, flash, combo],
  );

  if (phase === 'start')
    return <StartCard icon="chrono" title="Chrono-Vocab" desc="Trouvez la bonne traduction. 5 bonnes réponses d'affilée = points doublés. Touches 1 à 4 au clavier." onStart={() => { setScore(0); setCombo(0); setPhase('play'); }} />;
  if (phase === 'end') return <GameOver game="chrono" score={score} unit="points" onReplay={() => { setScore(0); setCombo(0); setRound((r) => r + 1); setPhase('play'); }} />;

  return (
    <div className="narrow">
      <Hud left={left} score={score} combo={combo} />
      <div className="card center" style={{ padding: 28 }}>
        <p className="muted small">{q.enToFr ? 'Traduisez en français' : 'Traduisez en anglais'}</p>
        <p style={{ fontSize: '2rem', fontWeight: 900, margin: 0 }}>{q.enToFr ? q.item.en : q.item.fr}</p>
      </div>
      <div className="options mt">
        {q.options.map((o, i) => (
          <button
            key={i}
            className={'option' + (flash != null ? (o.fr === q.item.fr ? ' correct' : i === flash ? ' wrong' : '') : '')}
            onClick={() => answer(i)}
          >
            <span className="key">{i + 1}</span>
            {q.enToFr ? o.fr : o.en}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Faux amis ------------------------------ */

export function FauxAmis() {
  const ROUNDS = 10;
  const [phase, setPhase] = useState<'start' | 'play' | 'end'>('start');
  const [deck, setDeck] = useState(() => shuffle(FALSE_FRIENDS).slice(0, ROUNDS));
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const ff = deck[i];
  const options = useMemo(() => {
    if (!ff) return [];
    const others = shuffle(FALSE_FRIENDS.filter((f) => f.en !== ff.en))
      .slice(0, 2)
      .map((f) => f.realMeaning);
    return shuffle([ff.realMeaning, ff.looksLike, ...others]);
  }, [ff]);

  const restart = () => {
    setDeck(shuffle(FALSE_FRIENDS).slice(0, ROUNDS));
    setI(0);
    setScore(0);
    setPicked(null);
    setPhase('play');
  };

  if (phase === 'start')
    return <StartCard icon="faux-amis" title="Faux amis" desc={`${ROUNDS} mots anglais qui ressemblent au français… mais ne veulent pas dire la même chose. Saurez-vous éviter le piège ?`} onStart={restart} />;
  if (phase === 'end') return <GameOver game="faux-amis" score={score} unit={`/ ${ROUNDS}`} xpFactor={3} onReplay={restart} />;

  const choose = (k: number) => {
    if (picked != null) return;
    setPicked(k);
    if (options[k] === ff.realMeaning) {
      setScore((s) => s + 1);
      sfx('ok');
    } else sfx('ko');
    void say(ff.example);
  };

  return (
    <div className="narrow">
      <Hud score={score} label={`/ ${ROUNDS}`} />
      <div className="card center" style={{ padding: 24 }}>
        <p className="muted small">
          Mot {i + 1}/{ROUNDS} — que signifie :
        </p>
        <p style={{ fontSize: '2.2rem', fontWeight: 900, margin: 0 }}>{ff.en}</p>
      </div>
      <div className="options mt">
        {options.map((o, k) => (
          <button
            key={k}
            className={'option' + (picked != null ? (o === ff.realMeaning ? ' correct' : k === picked ? ' wrong' : '') : '')}
            onClick={() => choose(k)}
          >
            {o}
          </button>
        ))}
      </div>
      {picked != null && (
        <div className={`feedback ${options[picked] === ff.realMeaning ? 'ok' : 'ko'}`}>
          <p style={{ margin: 0 }}>
            <strong>{ff.en}</strong> = {ff.realMeaning}. « {ff.looksLike} » se dit <strong>{ff.frWordInEnglish}</strong>.
          </p>
          <p className="small muted label-icon">
            <Icon name="speaker" size={14} /> {ff.example}
          </p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn primary"
              autoFocus
              onClick={() => {
                setPicked(null);
                if (i + 1 >= ROUNDS) setPhase('end');
                else setI(i + 1);
              }}
            >
              Suivant →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Puzzle de phrases ------------------------------ */

export function Puzzle() {
  const [phase, setPhase] = useState<'start' | 'play' | 'end'>('start');
  const pool = useMemo(() => orderPool(), []);
  const [ex, setEx] = useState<OrderExercise>(() => pick(pool));
  const [tiles, setTiles] = useState<string[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [shake, setShake] = useState(false);
  const left = useCountdown(90, phase === 'play', () => setPhase('end'));

  useEffect(() => {
    setTiles(shuffle(ex.answer.split(/\s+/)));
    setPicked([]);
  }, [ex]);

  const next = () => setEx(pick(pool.filter((p) => p.id !== ex.id)));

  useEffect(() => {
    if (picked.length !== tiles.length || !tiles.length) return;
    const built = picked.map((k) => tiles[k]).join(' ');
    const ok = [ex.answer, ...(ex.alternatives ?? [])].some((a) => normalize(a) === normalize(built));
    if (ok) {
      sfx('ok');
      setScore((s) => s + 1);
      window.setTimeout(next, 250);
    } else {
      sfx('ko');
      setShake(true);
      window.setTimeout(() => {
        setShake(false);
        setPicked([]);
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  if (phase === 'start')
    return <StartCard icon="puzzle" title="Puzzle de phrases" desc="90 secondes. Touchez les mots dans le bon ordre. Une erreur ? La phrase se remet à zéro." onStart={() => { setScore(0); next(); setPhase('play'); }} />;
  if (phase === 'end') return <GameOver game="puzzle" score={score} unit="phrases" xpFactor={4} onReplay={() => { setScore(0); next(); setPhase('play'); }} />;

  return (
    <div className="narrow">
      <Hud left={left} score={score} label="phrases" />
      <div className="card">
        <p className="muted">« {ex.translation} »</p>
        <div className="tiles answer-line" style={shake ? { animation: 'pop .3s' } : undefined}>
          {picked.map((k, j) => (
            <button key={j} className="tile" onClick={() => setPicked(picked.filter((_, x) => x !== j))}>
              {tiles[k]}
            </button>
          ))}
        </div>
        <div className="tiles">
          {tiles.map((w, k) => (
            <button key={k} className={`tile${picked.includes(k) ? ' used' : ''}`} disabled={picked.includes(k)} onClick={() => setPicked([...picked, k])}>
              {w}
            </button>
          ))}
        </div>
        <div className="row mt" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost sm" onClick={next}>
            Passer <Icon name="skip" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Dictée éclair ------------------------------ */

export function Dictee() {
  const ROUNDS = 8;
  const [phase, setPhase] = useState<'start' | 'play' | 'end'>('start');
  const [list, setList] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [text, setText] = useState('');
  const [score, setScore] = useState(0);
  const [shown, setShown] = useState<null | { ok: boolean; pts: number }>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const restart = () => {
    setList(shuffle(dictationPool()).slice(0, ROUNDS));
    setI(0);
    setScore(0);
    setText('');
    setShown(null);
    setPhase('play');
  };

  useEffect(() => {
    if (phase === 'play' && list[i]) {
      void say(list[i]);
      inputRef.current?.focus();
    }
  }, [phase, i, list]);

  const submit = () => {
    if (shown) {
      setShown(null);
      setText('');
      if (i + 1 >= ROUNDS) setPhase('end');
      else setI(i + 1);
      return;
    }
    const target = list[i];
    const r = checkAnswer(text, [target]);
    const pts = r.result === 'correct' ? 10 : Math.round(speechScore(target, text).score * 7);
    setScore((s) => s + pts);
    setShown({ ok: r.result !== 'wrong', pts });
    sfx(r.result === 'wrong' ? 'ko' : 'ok');
  };

  if (phase === 'start') return <StartCard icon="dictee" title="Dictée éclair" desc={`${ROUNDS} phrases à écouter et écrire. 10 points par phrase parfaite, des points partiels sinon.`} onStart={restart} />;
  if (phase === 'end') return <GameOver game="dictee" score={score} unit="points" xpFactor={0.5} onReplay={restart} />;

  return (
    <div className="narrow">
      <Hud score={score} label={`pts · ${i + 1}/${ROUNDS}`} />
      <div className="card">
        <div className="row" style={{ justifyContent: 'center', marginBottom: 16 }}>
          <button className="speaker-btn" onClick={() => void say(list[i])} aria-label="Réécouter">
            <Icon name="speaker" size={32} />
          </button>
          <button className="speaker-btn slow" onClick={() => void say(list[i], true)} aria-label="Écouter lentement">
            <Icon name="slow" size={26} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={!!shown}
            placeholder="Écrivez ce que vous entendez…"
            aria-label="Dictée"
            autoComplete="off"
            spellCheck={false}
          />
          {shown && (
            <div className={`feedback ${shown.ok ? 'ok' : 'ko'}`} style={{ position: 'static', margin: '14px 0 0', borderRadius: 14 }}>
              <strong>{list[i]}</strong> <span className="chip gold">+{shown.pts}</span>
            </div>
          )}
          <div className="row mt" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" type="submit" disabled={!shown && !text.trim()}>
              {shown ? 'Suivant →' : 'Valider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------ Défi prononciation ------------------------------ */

export function Prononciation() {
  const ROUNDS = 8;
  const [phase, setPhase] = useState<'start' | 'ear' | 'mouth' | 'end'>('start');
  const [pairs, setPairs] = useState(() => shuffle(MINIMAL_PAIRS).slice(0, ROUNDS));
  const [i, setI] = useState(0);
  const [target, setTarget] = useState<'a' | 'b'>('a');
  const [picked, setPicked] = useState<null | 'a' | 'b'>(null);
  const [score, setScore] = useState(0);
  const [twister, setTwister] = useState(() => pick(TONGUE_TWISTERS));
  const [heard, setHeard] = useState<{ text: string; score: number } | null>(null);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState('');
  const p = pairs[i];

  useEffect(() => {
    if (phase !== 'ear' || !p) return;
    const t: 'a' | 'b' = Math.random() < 0.5 ? 'a' : 'b';
    setTarget(t);
    setPicked(null);
    const id = window.setTimeout(() => void say(p[t]), 300);
    return () => window.clearTimeout(id);
  }, [phase, i, p]);

  const restart = () => {
    setPairs(shuffle(MINIMAL_PAIRS).slice(0, ROUNDS));
    setTwister(pick(TONGUE_TWISTERS));
    setI(0);
    setScore(0);
    setHeard(null);
    setPhase('ear');
  };

  const record = async () => {
    setErr('');
    setListening(true);
    try {
      const t = await listen({ silenceMs: 1500, noSpeechMs: 8000 }).result;
      if (!t) setErr('Je n’ai rien entendu, réessayez.');
      else {
        const s = speechScore(twister.text, t).score;
        setHeard({ text: t, score: s });
        sfx(s >= 0.8 ? 'win' : s >= 0.5 ? 'ok' : 'ko');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setListening(false);
    }
  };

  if (phase === 'start')
    return (
      <StartCard
        icon="prononciation"
        title="Défi prononciation"
        desc={`Manche 1 : écoutez et reconnaissez le bon mot parmi ${ROUNDS} paires minimales (ship/sheep, think/sink…). Manche 2 : un virelangue à prononcer au micro.`}
        onStart={restart}
      />
    );
  if (phase === 'end') return <GameOver game="prononciation" score={score} unit="points" xpFactor={2} onReplay={restart} />;

  if (phase === 'mouth')
    return (
      <div className="narrow">
        <Hud score={score} />
        <div className="card center">
          <p className="muted small">Manche 2 · Dites ce virelangue (bonus jusqu'à 10 points)</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 900 }}>{twister.text}</p>
          <span className="chip primary">
            <Icon name="target" size={14} /> {twister.focus}
          </span>
          <div className="row mt" style={{ justifyContent: 'center' }}>
            <button className="speaker-btn slow" onClick={() => void say(twister.text, true)} aria-label="Écouter le modèle">
              <Icon name="speaker" size={32} />
            </button>
            <button className={`mic-btn${listening ? ' listening' : ''}`} onClick={() => void record()} disabled={listening} aria-label="Parler">
              <Icon name="mic" size={38} />
            </button>
          </div>
          {heard && (
            <p className="mt">
              Entendu : « {heard.text} » — <strong>{Math.round(heard.score * 100)} %</strong>
            </p>
          )}
          {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
          <div className="row mt" style={{ justifyContent: 'center' }}>
            <button
              className="btn primary"
              onClick={() => {
                setScore((s) => s + Math.round((heard?.score ?? 0) * 10));
                setPhase('end');
              }}
            >
              {heard ? 'Terminer' : 'Passer'}
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="narrow">
      <Hud score={score} label={`pts · ${i + 1}/${ROUNDS}`} />
      <div className="card center">
        <p className="muted small">Manche 1 · Quel mot avez-vous entendu ?</p>
        <button className="speaker-btn" onClick={() => void say(p[target])} aria-label="Réécouter">
          <Icon name="speaker" size={32} />
        </button>
        <p className="small muted mt">{p.focus}</p>
      </div>
      <div className="grid-2 mt">
        {(['a', 'b'] as const).map((k) => (
          <button
            key={k}
            className={'option' + (picked ? (k === target ? ' correct' : k === picked ? ' wrong' : '') : '')}
            style={{ justifyContent: 'center', fontSize: '1.5rem', minHeight: 80 }}
            onClick={() => {
              if (picked) return;
              setPicked(k);
              if (k === target) {
                setScore((s) => s + 2);
                sfx('ok');
              } else sfx('ko');
            }}
          >
            {p[k]}
          </button>
        ))}
      </div>
      {picked && (
        <div className="row mt" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <button className="btn ghost sm" onClick={() => void say(p.a)}>
              <Icon name="speaker" size={16} /> {p.a}
            </button>
            <button className="btn ghost sm" onClick={() => void say(p.b)}>
              <Icon name="speaker" size={16} /> {p.b}
            </button>
          </div>
          <button
            className="btn primary"
            autoFocus
            onClick={() => {
              if (i + 1 >= ROUNDS) setPhase('mouth');
              else setI(i + 1);
            }}
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Verbes irréguliers ------------------------------ */

/** Verbes indispensables jusqu'en A2, tous ensuite. */
function verbPool(): IrregularVerb[] {
  const lv = getState().profile.level ?? 'A2';
  return LEVELS.indexOf(lv) <= 1 ? IRREGULAR_VERBS.filter((v) => v.band === 'A') : IRREGULAR_VERBS;
}

const firstForm = (forms: string) => forms.split('|')[0];

export function VerbesIrreguliers() {
  const [phase, setPhase] = useState<'start' | 'play' | 'end'>('start');
  const [deck, setDeck] = useState<IrregularVerb[]>(() => shuffle(verbPool()));
  const [i, setI] = useState(0);
  const [past, setPast] = useState('');
  const [part, setPart] = useState('');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [shown, setShown] = useState<null | { past: boolean; part: boolean }>(null);
  const pastRef = useRef<HTMLInputElement>(null);
  const partRef = useRef<HTMLInputElement>(null);
  const left = useCountdown(90, phase === 'play', () => setPhase('end'));
  const v = deck[i % deck.length];
  const iRef = useRef(i);
  iRef.current = i;

  const restart = () => {
    setDeck(shuffle(verbPool()));
    setI(0);
    setScore(0);
    setCombo(0);
    setPast('');
    setPart('');
    setShown(null);
    setPhase('play');
  };

  useEffect(() => {
    if (phase === 'play' && !shown) pastRef.current?.focus();
  }, [phase, i, shown]);

  const next = () => {
    setShown(null);
    setPast('');
    setPart('');
    setI((x) => x + 1);
  };

  const submit = () => {
    if (shown) return next();
    if (!past.trim() || !part.trim()) {
      (past.trim() ? partRef : pastRef).current?.focus();
      return;
    }
    const okPast = formMatches(past, v.past);
    const okPart = formMatches(part, v.participle);
    const both = okPast && okPart;
    const c = both ? combo + 1 : 0;
    setCombo(c);
    setScore((s) => s + (Number(okPast) + Number(okPart)) * (c >= 5 ? 2 : 1));
    setShown({ past: okPast, part: okPart });
    void say(`${v.base}, ${firstForm(v.past)}, ${firstForm(v.participle)}`);
    if (both) {
      sfx('ok');
      // Sans faute : verbe suivant automatiquement (sauf si l'apprenant a déjà avancé).
      const at = i;
      window.setTimeout(() => iRef.current === at && next(), 700);
    } else sfx('ko');
  };

  if (phase === 'start')
    return (
      <StartCard
        icon="verbes"
        title="Verbes irréguliers"
        desc="90 secondes. Pour chaque verbe, écrivez le prétérit puis le participe passé (go → went → gone). 1 point par forme juste, points doublés à partir de 5 verbes parfaits d'affilée."
        onStart={restart}
      />
    );
  if (phase === 'end') return <GameOver game="verbes" score={score} unit="formes" xpFactor={1} onReplay={restart} />;

  const status = (ok: boolean | undefined) => (shown ? (ok ? ' ok' : ' ko') : '');
  return (
    <div className="narrow">
      <Hud left={left} score={score} combo={combo} label="formes" />
      <div className="card center" style={{ padding: 24 }}>
        <p className="muted small" style={{ margin: 0 }}>
          {v.fr}
        </p>
        <p style={{ fontSize: '2.2rem', fontWeight: 900, margin: '4px 0 0' }}>
          to {v.base}{' '}
          <button className="round-btn" style={{ width: 34, height: 34, verticalAlign: 'middle' }} onClick={() => void say(v.base)} aria-label={`Écouter ${v.base}`}>
            <Icon name="speaker" size={16} />
          </button>
        </p>
      </div>
      <form
        className="card mt"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="verb-forms">
          <label className="field">
            Prétérit
            <input
              ref={pastRef}
              className={`input${status(shown?.past)}`}
              value={past}
              onChange={(e) => setPast(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !shown && !part.trim()) {
                  e.preventDefault();
                  partRef.current?.focus();
                }
              }}
              readOnly={!!shown}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              placeholder="went"
            />
          </label>
          <label className="field">
            Participe passé
            <input
              ref={partRef}
              className={`input${status(shown?.part)}`}
              value={part}
              onChange={(e) => setPart(e.target.value)}
              readOnly={!!shown}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder="gone"
            />
          </label>
        </div>
        {shown && !(shown.past && shown.part) && (
          <div className="feedback ko" style={{ position: 'static', margin: '14px 0 0', borderRadius: 14 }}>
            <strong>
              {v.base} → {v.past.replace('|', ' / ')} → {v.participle.replace('|', ' / ')}
            </strong>
          </div>
        )}
        <div className="row mt" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" type="submit">
            {shown ? 'Suivant →' : 'Valider'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------ Phrase juste ? ------------------------------ */

interface MistakeRound {
  m: CommonMistake;
  /** La phrase affichée est-elle la version fautive ? */
  wrong: boolean;
}

function mistakeDeck(): MistakeRound[] {
  return shuffle(COMMON_MISTAKES).map((m) => ({ m, wrong: Math.random() < 0.55 }));
}

export function PhraseJuste() {
  const [phase, setPhase] = useState<'start' | 'play' | 'end'>('start');
  const [deck, setDeck] = useState<MistakeRound[]>(() => mistakeDeck());
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [answer, setAnswer] = useState<null | { saidCorrect: boolean; ok: boolean }>(null);
  const left = useCountdown(60, phase === 'play', () => setPhase('end'));
  const r = deck[i % deck.length];
  const iRef = useRef(i);
  iRef.current = i;

  const restart = () => {
    setDeck(mistakeDeck());
    setI(0);
    setScore(0);
    setCombo(0);
    setAnswer(null);
    setPhase('play');
  };

  const next = () => {
    setAnswer(null);
    setI((x) => x + 1);
  };

  const choose = (saidCorrect: boolean) => {
    if (answer) return;
    const ok = saidCorrect === !r.wrong;
    setAnswer({ saidCorrect, ok });
    if (ok) {
      const c = combo + 1;
      setCombo(c);
      setScore((s) => s + (c >= 5 ? 2 : 1));
      sfx('ok');
      // Bonne réponse : on enchaîne (un peu plus tard si la correction est affichée).
      const at = i;
      window.setTimeout(() => iRef.current === at && next(), r.wrong ? 1300 : 450);
    } else {
      setCombo(0);
      sfx('ko');
    }
  };

  useKey(
    (e) => {
      if (phase !== 'play') return;
      if (e.key === '1' || e.key === 'ArrowLeft') choose(true);
      else if (e.key === '2' || e.key === 'ArrowRight') choose(false);
      else if (e.key === 'Enter' && answer && !answer.ok) next();
    },
    [phase, answer, r, combo, i],
  );

  if (phase === 'start')
    return (
      <StartCard
        icon="phrase-juste"
        title="Phrase juste ?"
        desc="60 secondes. Chaque phrase est-elle correcte ou fautive ? Les pièges viennent des fautes les plus fréquentes des francophones. Touches 1 et 2 (ou ← →) au clavier."
        onStart={restart}
      />
    );
  if (phase === 'end') return <GameOver game="phrase-juste" score={score} unit="points" xpFactor={2} onReplay={restart} />;

  const shownText = r.wrong ? r.m.wrong : r.m.right;
  return (
    <div className="narrow">
      <Hud left={left} score={score} combo={combo} />
      <div className="card center" style={{ padding: 28 }}>
        <p className="muted small">Cette phrase est-elle correcte ?</p>
        <p style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0 }}>{shownText}</p>
      </div>
      <div className="grid-2 mt">
        {[true, false].map((c) => (
          <button
            key={String(c)}
            className={'option' + (answer ? (c === !r.wrong ? ' correct' : c === answer.saidCorrect ? ' wrong' : '') : '')}
            style={{ justifyContent: 'center', minHeight: 70 }}
            onClick={() => choose(c)}
          >
            <span className="key">{c ? 1 : 2}</span>
            <Icon name={c ? 'ok' : 'ko'} size={20} /> {c ? 'Correcte' : 'Fautive'}
          </button>
        ))}
      </div>
      {answer && (r.wrong || !answer.ok) && (
        <div className={`feedback ${answer.ok ? 'ok' : 'ko'}`}>
          <p style={{ margin: 0 }}>
            {r.wrong ? (
              <>
                <del>{r.m.wrong}</del> → <strong>{r.m.right}</strong>
              </>
            ) : (
              <>
                <strong>{r.m.right}</strong> était correcte (la faute fréquente : <del>{r.m.wrong}</del>).
              </>
            )}
          </p>
          <p className="small" style={{ margin: '6px 0 0' }}>
            <Rich text={r.m.tip} />
          </p>
          {!answer.ok && (
            <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 0 }}>
              <button className="btn primary" autoFocus onClick={next}>
                Suivant →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Memory des mots ------------------------------ */

interface MemoryCard {
  key: number;
  pair: number;
  text: string;
  lang: 'en' | 'fr';
}

function memoryDeck(pairs: number): MemoryCard[] {
  const seen = new Set<string>();
  const items = shuffle(vocabPool()).filter((v) => {
    const k1 = v.en.toLowerCase();
    const k2 = v.fr.toLowerCase();
    if (v.en.length > 18 || v.fr.length > 20 || seen.has(k1) || seen.has(k2)) return false;
    seen.add(k1);
    seen.add(k2);
    return true;
  });
  const chosen = items.slice(0, pairs);
  return shuffle(
    chosen.flatMap((v, p) => [
      { key: p * 2, pair: p, text: v.en, lang: 'en' as const },
      { key: p * 2 + 1, pair: p, text: v.fr, lang: 'fr' as const },
    ]),
  );
}

/** Score du Memory : 100 pour un sans-faute rapide, −4 par paire ratée, −1 toutes les 5 s. */
export function memoryScore(pairs: number, moves: number, seconds: number): number {
  return Math.max(10, 100 - 4 * Math.max(0, moves - pairs) - Math.floor(seconds / 5));
}

export function MemoryMots() {
  const PAIRS = 8;
  const [phase, setPhase] = useState<'start' | 'play' | 'end'>('start');
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [final, setFinal] = useState(0);
  const startedAt = useRef(0);

  const restart = () => {
    setCards(memoryDeck(PAIRS));
    setFlipped([]);
    setFound(new Set());
    setMoves(0);
    setElapsed(0);
    startedAt.current = performance.now();
    setPhase('play');
  };

  useEffect(() => {
    if (phase !== 'play') return;
    const t = window.setInterval(() => setElapsed(Math.floor((performance.now() - startedAt.current) / 1000)), 500);
    return () => window.clearInterval(t);
  }, [phase]);

  const flip = (k: number) => {
    const c = cards[k];
    if (!c || flipped.length >= 2 || flipped.includes(k) || found.has(c.pair)) return;
    if (c.lang === 'en') void say(c.text);
    const now = [...flipped, k];
    setFlipped(now);
    if (now.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = now.map((x) => cards[x]);
    if (a.pair === b.pair) {
      sfx('ok');
      const nextFound = new Set(found).add(a.pair);
      setFound(nextFound);
      window.setTimeout(() => setFlipped([]), 250);
      if (nextFound.size === PAIRS) {
        const secs = Math.floor((performance.now() - startedAt.current) / 1000);
        setFinal(memoryScore(PAIRS, moves + 1, secs));
        window.setTimeout(() => setPhase('end'), 600);
      }
    } else {
      sfx('ko');
      window.setTimeout(() => setFlipped([]), 950);
    }
  };

  if (phase === 'start')
    return (
      <StartCard
        icon="memory"
        title="Memory des mots"
        desc={`${PAIRS} paires anglais–français cachées sous ${PAIRS * 2} cartes. Retournez-en deux à la fois : chaque paire ratée et chaque seconde coûtent des points.`}
        onStart={restart}
      />
    );
  if (phase === 'end') return <GameOver game="memory" score={final} unit="points" xpFactor={0.3} onReplay={restart} />;

  return (
    <div className="narrow">
      <div className="row between mb">
        <span className="chip">
          <Icon name="hourglass" size={16} /> {elapsed}s
        </span>
        <span className="chip">
          {found.size}/{PAIRS} paires · {moves} coup{moves > 1 ? 's' : ''}
        </span>
      </div>
      <div className="memory-grid" role="grid" aria-label="Cartes du Memory">
        {cards.map((c, k) => {
          const isFound = found.has(c.pair);
          const visible = isFound || flipped.includes(k);
          return (
            <button
              key={c.key}
              className={`memory-card${visible ? ' up' : ''}${isFound ? ' found' : ''} ${c.lang}`}
              onClick={() => flip(k)}
              disabled={isFound}
              aria-label={visible ? `${c.lang === 'en' ? 'Anglais' : 'Français'} : ${c.text}` : `Carte ${k + 1}, cachée`}
            >
              {visible ? (
                <>
                  <span className="lang">{c.lang === 'en' ? 'EN' : 'FR'}</span>
                  <span className="txt">{c.text}</span>
                </>
              ) : (
                <span className="back" aria-hidden>
                  ?
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function GameRouter({ id }: { id: string }) {
  switch (id) {
    case 'verbes':
      return <VerbesIrreguliers />;
    case 'phrase-juste':
      return <PhraseJuste />;
    case 'memory':
      return <MemoryMots />;
    case 'chrono':
      return <ChronoVocab />;
    case 'faux-amis':
      return <FauxAmis />;
    case 'puzzle':
      return <Puzzle />;
    case 'dictee':
      return <Dictee />;
    case 'prononciation':
      return <Prononciation />;
    default:
      return (
        <div className="card">
          Jeu introuvable.{' '}
          <button className="btn" onClick={() => navigate('/jeux')}>
            Retour
          </button>
        </div>
      );
  }
}
