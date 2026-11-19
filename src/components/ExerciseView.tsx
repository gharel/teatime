/* ------------------------------------------------------------------
 * Rendu et correction de tous les types d'exercices.
 * Feedback immédiat, explication en français, raccourcis clavier,
 * annonces aria-live pour les lecteurs d'écran.
 * ------------------------------------------------------------------ */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Exercise } from '../types';
import { checkAnswer, normalize, shuffle, speechScore, type MatchResult, type WordDiff } from '../lib/text';
import { say } from '../lib/tts';
import { listen, type ListenHandle } from '../lib/stt';
import { Rich, sfx, useKey } from './ui';
import Icon from './Icon';

export type ExResult = MatchResult | 'skip';

interface Props {
  exercise: Exercise;
  onDone: (result: ExResult) => void;
  /** Appelé dès la vérification (avant « Continuer »). */
  onChecked?: (result: ExResult) => void;
}

const DEFAULT_INSTRUCTIONS: Record<Exercise['type'], string> = {
  mcq: 'Choisissez la bonne réponse',
  gap: 'Complétez la phrase',
  order: 'Remettez les mots dans l’ordre',
  translate: 'Traduisez en anglais',
  listen: 'Écoutez puis répondez',
  speak: 'Lisez la phrase à voix haute',
};

const PRAISE = ['Bravo !', 'Excellent !', 'Parfait !', 'Super !', 'Bien joué !', 'Exactement !'];

function correctAnswerText(ex: Exercise): string {
  switch (ex.type) {
    case 'mcq':
      return ex.options[ex.answer];
    case 'gap':
      return ex.prompt.replace('___', ex.answers[0]);
    case 'order':
      return ex.answer;
    case 'translate':
      return ex.answers[0];
    case 'listen':
      return ex.options && ex.answer != null ? ex.options[ex.answer] : ex.audio;
    case 'speak':
      return ex.text;
  }
}

function spokenModel(ex: Exercise): string | null {
  switch (ex.type) {
    case 'gap':
      return ex.prompt.replace('___', ex.answers[0]);
    case 'order':
      return ex.answer;
    case 'translate':
      return ex.answers[0];
    case 'listen':
      return ex.audio;
    case 'speak':
      return ex.text;
    case 'mcq':
      return ex.prompt.includes('___') ? ex.prompt.replace('___', ex.options[ex.answer]) : null;
  }
}

export default function ExerciseView({ exercise: ex, onDone, onChecked }: Props) {
  const [result, setResult] = useState<ExResult | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [heard, setHeard] = useState<{ text: string; score: number; diff: WordDiff[] } | null>(null);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  const handle = useRef<ListenHandle | null>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const tiles = useMemo(() => {
    if (ex.type !== 'order') return [];
    return shuffle([...ex.answer.split(/\s+/), ...(ex.distractors ?? [])]);
  }, [ex]);

  useEffect(() => {
    setResult(null);
    setGaveUp(false);
    setChoice(null);
    setText('');
    setPicked([]);
    setHeard(null);
    setMicError('');
    if (ex.type === 'listen') void say(ex.audio);
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      window.clearTimeout(t);
      handle.current?.abort();
    };
  }, [ex]);

  useEffect(() => {
    if (result) continueRef.current?.focus();
  }, [result]);

  const canCheck = (() => {
    switch (ex.type) {
      case 'mcq':
        return choice != null;
      case 'listen':
        return ex.options ? choice != null : text.trim().length > 0;
      case 'gap':
      case 'translate':
        return text.trim().length > 0;
      case 'order':
        return picked.length > 0;
      case 'speak':
        return heard != null;
    }
  })();

  function finish(r: ExResult) {
    setResult(r);
    onChecked?.(r);
    if (r === 'correct') sfx('ok');
    else if (r === 'wrong') sfx('ko');
  }

  function check() {
    if (result || !canCheck) return;
    switch (ex.type) {
      case 'mcq':
        return finish(choice === ex.answer ? 'correct' : 'wrong');
      case 'listen':
        if (ex.options) return finish(choice === ex.answer ? 'correct' : 'wrong');
        return finish(checkAnswer(text, [ex.audio]).result);
      case 'gap':
        return finish(checkAnswer(text, ex.answers).result);
      case 'translate':
        return finish(checkAnswer(text, ex.answers).result);
      case 'order': {
        const built = picked.map((i) => tiles[i]).join(' ');
        const ok = [ex.answer, ...(ex.alternatives ?? [])].some((a) => normalize(a) === normalize(built));
        return finish(ok ? 'correct' : 'wrong');
      }
      case 'speak':
        return finish(heard!.score >= 0.8 ? 'correct' : heard!.score >= 0.6 ? 'typo' : 'wrong');
    }
  }

  async function record() {
    if (ex.type !== 'speak') return;
    if (listening) {
      handle.current?.stop();
      return;
    }
    setMicError('');
    setListening(true);
    const h = listen({ silenceMs: 1400, noSpeechMs: 7000 });
    handle.current = h;
    try {
      const t = await h.result;
      if (t) {
        const s = speechScore(ex.text, t);
        setHeard({ text: t, ...s });
        if (s.score >= 0.8) {
          setResult('correct');
          onChecked?.('correct');
          sfx('ok');
        }
      } else setMicError('Je n’ai rien entendu. Réessayez en parlant près du micro.');
    } catch (err) {
      setMicError((err as Error).message);
    } finally {
      setListening(false);
    }
  }

  useKey(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (result) onDone(result);
        else check();
        return;
      }
      if (result) return;
      const opts = ex.type === 'mcq' ? ex.options : ex.type === 'listen' ? ex.options : undefined;
      if (opts && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < opts.length) setChoice(i);
      }
    },
    [ex, result, choice, text, picked, heard],
  );

  const instruction = ex.instruction ?? DEFAULT_INSTRUCTIONS[ex.type];
  const disabled = result != null;

  const optionClass = (i: number, answer: number) =>
    'option' + (result ? (i === answer ? ' correct' : i === choice ? ' wrong' : '') : '');
  /** Après vérification, une icône en plus de la couleur (accessibilité). */
  const optionMark = (i: number, answer: number) =>
    result ? (
      i === answer ? (
        <span className="opt-mark ok" aria-label="bonne réponse"><Icon name="ok" size={22} /></span>
      ) : i === choice ? (
        <span className="opt-mark ko" aria-label="votre réponse, incorrecte"><Icon name="ko" size={22} /></span>
      ) : null
    ) : null;

  return (
    <div className="ex-body">
      <p className="ex-instruction">{instruction}</p>

      {ex.type === 'mcq' && (
        <>
          <p className="ex-prompt">{ex.prompt}</p>
          <div className="options" role="group" aria-label="Réponses possibles">
            {ex.options.map((o, i) => (
              <button
                key={i}
                className={optionClass(i, ex.answer)}
                aria-pressed={choice === i}
                disabled={disabled}
                onClick={() => setChoice(i)}
              >
                <span className="key" aria-hidden>
                  {i + 1}
                </span>
                <span className="opt-text">{o}</span>
                {optionMark(i, ex.answer)}
              </button>
            ))}
          </div>
        </>
      )}

      {ex.type === 'gap' && (
        <p className="gap-sentence">
          {ex.prompt.split('___')[0]}
          <input
            ref={inputRef}
            className="gap-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            aria-label="Mot manquant"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {ex.prompt.split('___')[1]}
          {ex.hint && <span className="muted"> {ex.hint}</span>}
        </p>
      )}

      {ex.type === 'translate' && (
        <>
          <p className="ex-prompt">« {ex.prompt} »</p>
          <textarea
            ref={inputRef}
            className="input"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            placeholder="Écrivez en anglais…"
            aria-label="Votre traduction"
            autoCapitalize="sentences"
            spellCheck={false}
          />
        </>
      )}

      {ex.type === 'order' && (
        <>
          <p className="muted">« {ex.translation} »</p>
          <div className="tiles answer-line" aria-label="Votre phrase">
            {picked.map((ti, k) => (
              <button key={k} className="tile" disabled={disabled} onClick={() => setPicked(picked.filter((_, j) => j !== k))}>
                {tiles[ti]}
              </button>
            ))}
          </div>
          <div className="tiles" aria-label="Mots disponibles">
            {tiles.map((w, i) => (
              <button
                key={i}
                className={`tile${picked.includes(i) ? ' used' : ''}`}
                disabled={disabled || picked.includes(i)}
                onClick={() => {
                  sfx('pop');
                  setPicked([...picked, i]);
                }}
              >
                {w}
              </button>
            ))}
          </div>
        </>
      )}

      {ex.type === 'listen' && (
        <>
          <div className="row" style={{ justifyContent: 'center', marginBottom: 18 }}>
            <button className="speaker-btn" onClick={() => void say(ex.audio)} aria-label="Écouter">
              <Icon name="speaker" size={30} />
            </button>
            <button className="speaker-btn slow" onClick={() => void say(ex.audio, true)} aria-label="Écouter lentement">
              <Icon name="slow" size={26} />
            </button>
          </div>
          {ex.options ? (
            <>
              {ex.question && <p className="ex-prompt">{ex.question}</p>}
              <div className="options">
                {ex.options.map((o, i) => (
                  <button key={i} className={optionClass(i, ex.answer!)} aria-pressed={choice === i} disabled={disabled} onClick={() => setChoice(i)}>
                    <span className="key" aria-hidden>
                      {i + 1}
                    </span>
                    <span className="opt-text">{o}</span>
                    {optionMark(i, ex.answer!)}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <textarea
              ref={inputRef}
              className="input"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={disabled}
              placeholder="Écrivez ce que vous entendez…"
              aria-label="Dictée"
              spellCheck={false}
            />
          )}
        </>
      )}

      {ex.type === 'speak' && (
        <div className="stack center" style={{ alignItems: 'center' }}>
          <p className="ex-prompt" style={{ marginBottom: 4 }}>
            {heard ? (
              heard.diff.map((w, i) => (
                <span key={i} className={w.ok ? 'word-ok' : 'word-ko'}>
                  {w.word}{' '}
                </span>
              ))
            ) : (
              ex.text
            )}
          </p>
          <p className="muted">« {ex.translation} »</p>
          {ex.focus && (
            <span className="chip primary">
              <Icon name="target" size={14} /> {ex.focus}
            </span>
          )}
          <div className="row" style={{ justifyContent: 'center', margin: '14px 0' }}>
            <button className="speaker-btn slow" onClick={() => void say(ex.text)} aria-label="Écouter le modèle">
              <Icon name="speaker" size={30} />
            </button>
            <button
              className={`mic-btn${listening ? ' listening' : ''}`}
              onClick={() => void record()}
              disabled={result === 'correct'}
              aria-label={listening ? 'Arrêter l’enregistrement' : 'Parler'}
            >
              {listening ? <Icon name="stop" size={34} style={{ fill: 'currentColor' }} /> : <Icon name="mic" size={38} />}
            </button>
            <button className="speaker-btn slow" onClick={() => void say(ex.text, true)} aria-label="Écouter lentement">
              <Icon name="slow" size={26} />
            </button>
          </div>
          {listening && <p className="muted">Je vous écoute…</p>}
          {heard && !result && (
            <p className="small">
              Entendu : « {heard.text} » — {Math.round(heard.score * 100)} %
              {heard.score < 0.8 && ' · Réessayez ou validez.'}
            </p>
          )}
          {micError && <p className="small" style={{ color: 'var(--danger)' }}>{micError}</p>}
          {!result && (
            <button className="btn ghost sm" onClick={() => finish('skip')}>
              Je ne peux pas parler maintenant
            </button>
          )}
        </div>
      )}

      <div aria-live="assertive" className="sr-only">
        {result === 'correct' ? 'Bonne réponse' : result === 'typo' ? 'Presque' : result === 'wrong' ? 'Mauvaise réponse' : ''}
      </div>

      {result ? (
        <div className={`feedback ${result === 'correct' ? 'ok' : result === 'wrong' ? 'ko' : 'almost'}`}>
          <h3>
            {result === 'correct' && <><Icon name="ok" size={24} /> {PRAISE[Math.floor(Math.random() * PRAISE.length)]}</>}
            {result === 'typo' && <><Icon name="almost" size={24} /> Presque !{ex.type === 'speak' ? ' Prononciation à peaufiner.' : ' Attention à l’orthographe.'}</>}
            {result === 'wrong' && (gaveUp ? <><Icon name="answer" size={24} /> Voici la réponse</> : <><Icon name="ko" size={24} /> Pas tout à fait</>)}
            {result === 'skip' && <><Icon name="skip" size={24} /> Passé</>}
          </h3>
          {result !== 'correct' && (
            <p>
              <strong>Bonne réponse :</strong> {correctAnswerText(ex)}
            </p>
          )}
          <p className="small" style={{ marginBottom: 12 }}>
            <Icon name="tip" size={16} className="inline-ico" /> <Rich text={ex.explanation} />
          </p>
          <div className="row between">
            {spokenModel(ex) ? (
              <button className="btn ghost sm" onClick={() => void say(spokenModel(ex)!)}>
                <Icon name="speaker" size={16} /> Écouter
              </button>
            ) : (
              <span />
            )}
            <button ref={continueRef} className="btn primary lg" onClick={() => onDone(result)}>
              Continuer
            </button>
          </div>
        </div>
      ) : (
        ex.type !== 'speak' || heard ? (
          <div className="ex-actions">
            {ex.type !== 'speak' && (
              <>
                <span className="tiny muted kbd-hint" style={{ marginRight: 'auto', alignSelf: 'center' }}>
                  <span className="kbd">Entrée</span> pour valider
                </span>
                {/* Pas de blocage : on peut voir la réponse et son explication, l'exercice reviendra en fin de leçon. */}
                <button
                  className="btn ghost"
                  onClick={() => {
                    setGaveUp(true);
                    finish('wrong');
                  }}
                >
                  Je ne sais pas
                </button>
              </>
            )}
            <button className="btn primary lg" disabled={!canCheck} onClick={check}>
              Vérifier
            </button>
          </div>
        ) : null
      )}
    </div>
  );
}
