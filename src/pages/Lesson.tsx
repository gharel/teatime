import { useMemo, useState } from 'react';
import type { Exercise, Unit } from '../types';
import { findUnit, neighborUnits } from '../data/lessons';
import ExerciseView, { type ExResult } from '../components/ExerciseView';
import LessonPicker from '../components/LessonPicker';
import { celebrate, LevelBadge, navigate, notify, notifyBadges, ProgressBar, Rich, sfx, Stars } from '../components/ui';
import { addSrsCards, claimQuests, reward, saveUnitProgress } from '../lib/store';
import { say } from '../lib/tts';
import Icon, { ICONS, IconBadge } from '../components/Icon';
import { unitIcon } from '../components/Icon';

/** Navigation libre entre les leçons : précédente, suivante, ou n'importe laquelle. */
function LessonNav({ unit }: { unit: Unit }) {
  const { prev, next } = neighborUnits(unit.id);
  return (
    <div className="lesson-nav mb">
      <button className="btn ghost sm" onClick={() => navigate('/parcours')}>
        ← Parcours
      </button>
      <button className="btn ghost sm" disabled={!prev} onClick={() => prev && navigate(`/lecon/${prev.id}`)} title={prev ? `${prev.level} · ${prev.title}` : ''}>
        ‹ Précédente
      </button>
      <div className="lesson-nav-picker">
        <LessonPicker current={unit.id} label="Changer de leçon" />
      </div>
      <button className="btn ghost sm" disabled={!next} onClick={() => next && navigate(`/lecon/${next.id}`)} title={next ? `${next.level} · ${next.title}` : ''}>
        Suivante ›
      </button>
    </div>
  );
}

export function UnitIntro({ unit, onStart }: { unit: Unit; onStart?: () => void }) {
  return (
    <div className="narrow">
      <LessonNav unit={unit} />
      <div className="card highlight">
        <div className="row">
          <IconBadge icon={unitIcon(unit.id)} tone="primary" size={30} className="hero-ico" />
          <div style={{ flex: 1 }}>
            <div className="row">
              <LevelBadge level={unit.level} />
              <h1 style={{ margin: 0 }}>{unit.title}</h1>
            </div>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              <Icon name="target" size={16} className="inline-ico" /> {unit.canDo}
            </p>
          </div>
        </div>
      </div>

      <h2 className="section-title">
        <Icon name="grammar" /> Grammaire : {unit.grammar.title}
      </h2>
      <div className="card">
        {unit.grammar.explanation.split('\n\n').map((p, i) => (
          <p key={i}>
            <Rich text={p} />
          </p>
        ))}
        <div className="grammar-box stack">
          {unit.grammar.examples.map((ex, i) => (
            <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
              <button className="round-btn" onClick={() => void say(ex.en)} aria-label={`Écouter : ${ex.en}`}>
                <Icon name="speaker" size={18} />
              </button>
              <div>
                <strong>{ex.en}</strong>
                <div className="small muted">{ex.fr}</div>
              </div>
            </div>
          ))}
        </div>
        {unit.grammar.frenchTrap && (
          <div className="trap">
            <strong className="label-icon">
              <Icon name="warn" size={18} /> Piège pour les francophones
            </strong>
            <p style={{ margin: '4px 0 0' }}>
              <Rich text={unit.grammar.frenchTrap} />
            </p>
          </div>
        )}
      </div>

      <h2 className="section-title">
        <Icon name="vocab" /> Vocabulaire
      </h2>
      <div className="card">
        {unit.vocab.map((v) => (
          <div key={v.en} className="vocab-row">
            <button className="round-btn" onClick={() => void say(`${v.en}. ${v.example}`)} aria-label={`Écouter ${v.en}`}>
              <Icon name="speaker" size={18} />
            </button>
            <div style={{ flex: 1 }}>
              <strong>{v.en}</strong> {v.ipa && <span className="tiny muted">{v.ipa}</span>} — <span>{v.fr}</span>
              <div className="small muted">{v.example}</div>
            </div>
          </div>
        ))}
      </div>

      {onStart && (
        <div className="ex-actions">
          <button className="btn primary lg block" onClick={onStart}>
            Commencer les exercices ({unit.exercises.length}) →
          </button>
        </div>
      )}
    </div>
  );
}

interface Attempt {
  ex: Exercise;
  first: ExResult;
}

const XP_FOR: Record<ExResult, number> = { correct: 10, typo: 7, wrong: 0, skip: 0 };

export default function Lesson({ unitId }: { unitId: string }) {
  const unit = findUnit(unitId);
  const [phase, setPhase] = useState<'intro' | 'run' | 'done'>('intro');
  const [queue, setQueue] = useState<Exercise[]>([]);
  const [pos, setPos] = useState(0);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [combo, setCombo] = useState(0);
  const [xp, setXp] = useState(0);
  const [summary, setSummary] = useState<{ score: number; xp: number; perfect: boolean } | null>(null);

  const total = unit?.exercises.length ?? 0;

  const start = () => {
    if (!unit) return;
    // On garde l'ordre pédagogique mais on mélange légèrement les exercices voisins (interleaving)
    const ex = unit.exercises.slice();
    for (let i = 0; i < ex.length - 1; i += 2) if (Math.random() < 0.4) [ex[i], ex[i + 1]] = [ex[i + 1], ex[i]];
    setQueue(ex);
    setPos(0);
    setAttempts({});
    setCombo(0);
    setXp(0);
    setPhase('run');
  };

  const firstDone = useMemo(() => Object.keys(attempts).length, [attempts]);

  if (!unit) {
    return (
      <div className="narrow card">
        <p>Leçon introuvable.</p>
        <button className="btn" onClick={() => navigate('/parcours')}>
          Retour au parcours
        </button>
      </div>
    );
  }

  if (phase === 'intro') return <UnitIntro unit={unit} onStart={start} />;

  if (phase === 'done' && summary) {
    const mistakes = Object.values(attempts).filter((a) => a.first === 'wrong' || a.first === 'typo');
    return (
      <div className="narrow">
        <div className="card center">
          <div style={{ fontSize: '3rem' }} aria-hidden>
            <IconBadge icon={summary.perfect ? ICONS.trophy : summary.score >= 70 ? ICONS.party : ICONS.effort} tone="gold" size={34} className="hero-ico" />
          </div>
          <h1>{summary.perfect ? 'Sans-faute !' : summary.score >= 70 ? 'Leçon terminée !' : 'Bel effort !'}</h1>
          <p className="muted">{unit.canDo}</p>
          <div className="row" style={{ justifyContent: 'center', gap: 28, margin: '18px 0' }}>
            <div className="stat">
              <IconBadge icon={ICONS.target} tone="primary" />
              <div>
                <div className="big">{summary.score} %</div>
                <div className="tiny muted">réussite</div>
              </div>
            </div>
            <div className="stat">
              <IconBadge icon={ICONS.xp} tone="gold" />
              <div>
                <div className="big">+{summary.xp}</div>
                <div className="tiny muted">XP</div>
              </div>
            </div>
            <div className="stat">
              <Stars n={summary.score >= 90 ? 3 : summary.score >= 70 ? 2 : 1} />
            </div>
          </div>
          {mistakes.length > 0 && <p className="small">Les points à revoir ont été ajoutés à vos révisions.</p>}
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={start}>
              <Icon name="replay" size={18} /> Refaire
            </button>
            <button className="btn" onClick={() => navigate('/emma')}>
              <Icon name="chat" size={18} /> Pratiquer avec Emma
            </button>
            {neighborUnits(unit.id).next ? (
              <button className="btn primary" onClick={() => navigate(`/lecon/${neighborUnits(unit.id).next!.id}`)}>
                Leçon suivante : {neighborUnits(unit.id).next!.title} →
              </button>
            ) : (
              <button className="btn primary" onClick={() => navigate('/parcours')}>
                Retour au parcours →
              </button>
            )}
          </div>
          <div className="row mt" style={{ justifyContent: 'center' }}>
            <span className="small muted">ou choisissez une autre leçon :</span>
            <div style={{ minWidth: 260 }}>
              <LessonPicker label="Aller à une leçon" />
            </div>
          </div>
        </div>
        {mistakes.length > 0 && (
          <>
            <h2 className="section-title">À retenir</h2>
            <div className="card stack">
              {mistakes.map((m) => (
                <div key={m.ex.id} className="small">
                  <strong>{exerciseLabel(m.ex)}</strong>
                  <div className="muted">
                    <Icon name="tip" size={14} className="inline-ico" /> <Rich text={m.ex.explanation} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const current = queue[pos];

  const onChecked = (r: ExResult) => {
    const isFirst = !attempts[current.id];
    if (isFirst) setAttempts((a) => ({ ...a, [current.id]: { ex: current, first: r } }));
    if (r === 'correct' || r === 'typo') {
      const gained = isFirst ? XP_FOR[r] : 5;
      setXp((x) => x + gained);
      const c = combo + 1;
      setCombo(c);
      if (c > 0 && c % 5 === 0) {
        notify('flame', `${c} bonnes réponses d’affilée ! +5 XP`);
        setXp((x) => x + 5);
        sfx('win');
      }
    } else if (r === 'wrong') {
      setCombo(0);
    }
  };

  const onDone = (r: ExResult) => {
    let q = queue;
    // Maîtrise : un exercice raté revient une fois en fin de leçon
    if (r === 'wrong' && attempts[current.id]?.first === 'wrong' && !queue.slice(pos + 1).some((e) => e.id === current.id)) {
      const repeats = queue.filter((e) => e.id === current.id).length;
      if (repeats < 2) {
        q = [...queue, current];
        setQueue(q);
      }
    }
    if (pos + 1 < q.length) {
      setPos(pos + 1);
      return;
    }
    finishLesson();
  };

  const finishLesson = () => {
    const list = Object.values(attempts);
    const counted = list.filter((a) => a.first !== 'skip');
    const pts = counted.reduce((s, a) => s + (a.first === 'correct' ? 1 : a.first === 'typo' ? 0.75 : 0), 0);
    const score = counted.length ? Math.round((pts / counted.length) * 100) : 100;
    const perfect = counted.length > 0 && counted.every((a) => a.first === 'correct');
    const bonus = 20 + (perfect ? 10 : 0);
    const totalXp = xp + bonus;
    saveUnitProgress(unit.id, score);
    addSrsCards([
      ...unit.vocab.map((v) => ({ id: `v:${unit.id}:${v.en}`, kind: 'vocab' as const, front: v.en, back: v.fr, note: v.example })),
      ...list
        .filter((a) => a.first === 'wrong' || a.first === 'typo')
        .map((a) => ({ id: `x:${a.ex.id}`, kind: 'mistake' as const, front: exerciseLabel(a.ex), back: a.ex.explanation, ref: a.ex.id })),
    ]);
    const speakOk = list.filter((a) => a.ex.type === 'speak' && a.first === 'correct').length;
    const badges = reward({
      xp: totalXp,
      day: { lessons: 1, perfect: perfect ? 1 : 0, speakOk },
      totals: {
        lessons: 1,
        perfect: perfect ? 1 : 0,
        exercises: counted.length,
        correct: counted.filter((a) => a.first === 'correct').length,
        speakOk,
      },
    });
    const quests = claimQuests();
    quests.forEach((q) => notify('ok', `Quête accomplie : ${q.label} (+${q.reward} XP)`));
    notifyBadges(badges);
    if (score >= 70) celebrate();
    sfx('win');
    setSummary({ score, xp: totalXp, perfect });
    setPhase('done');
  };

  return (
    <div className="ex-shell">
      <div className="ex-top">
        <button
          className="btn ghost icon"
          aria-label="Quitter la leçon"
          onClick={() => {
            if (window.confirm('Quitter la leçon ? Votre progression dans cette leçon sera perdue.')) navigate('/parcours');
          }}
        >
          <Icon name="close" size={20} />
        </button>
        <ProgressBar value={Math.min(firstDone, total) / total} label="Progression de la leçon" />
        <span className="tiny muted ex-count" aria-label={`Exercice ${Math.min(pos + 1, queue.length)} sur ${queue.length}`}>
          {Math.min(pos + 1, queue.length)}/{queue.length}
        </span>
        {combo >= 3 ? (
          <span className="combo" key={combo} aria-label={`Série de ${combo}`}>
            <Icon name="flame" size={18} /> {combo}
          </span>
        ) : (
          <span className="chip gold">
            <Icon name="xp" size={14} /> {xp}
          </span>
        )}
      </div>
      <ExerciseView key={`${current.id}-${pos}`} exercise={current} onChecked={onChecked} onDone={onDone} />
    </div>
  );
}

function exerciseLabel(ex: Exercise): string {
  switch (ex.type) {
    case 'mcq':
      return `${ex.prompt} → ${ex.options[ex.answer]}`;
    case 'gap':
      return ex.prompt.replace('___', `[${ex.answers[0]}]`);
    case 'order':
      return ex.answer;
    case 'translate':
      return `${ex.prompt} → ${ex.answers[0]}`;
    case 'listen':
      return ex.options && ex.answer != null ? `${ex.audio} → ${ex.options[ex.answer]}` : ex.audio;
    case 'speak':
      return ex.text;
  }
}

