import { useMemo, useState } from 'react';
import { ALL_UNITS } from '../data/lessons';
import type { Exercise } from '../types';
import ExerciseView from '../components/ExerciseView';
import { claimQuests, dueCards, getState, gradeSrs, reward, useAppState, type SrsCard } from '../lib/store';
import { say } from '../lib/tts';
import { celebrate, navigate, notify, notifyBadges, ProgressBar, Rich } from '../components/ui';
import Icon, { ICONS, IconBadge } from '../components/Icon';

const EX_INDEX = new Map<string, Exercise>(ALL_UNITS.flatMap((u) => u.exercises.map((e) => [e.id, e] as [string, Exercise])));
const SESSION_SIZE = 15;

export default function Review() {
  const srs = useAppState((s) => s.srs);
  const due = useMemo(() => dueCards(getState()), [srs]);
  const total = Object.keys(srs).length;
  const [session, setSession] = useState<SrsCard[] | null>(null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [ok, setOk] = useState(0);

  const boxes = [1, 2, 3, 4, 5].map((b) => Object.values(srs).filter((c) => c.box === b).length);

  const start = () => {
    setSession(due.slice(0, SESSION_SIZE));
    setI(0);
    setOk(0);
    setFlipped(false);
  };

  const grade = (card: SrsCard, good: boolean) => {
    gradeSrs(card.id, good);
    if (good) setOk((n) => n + 1);
    setFlipped(false);
    if (session && i + 1 < session.length) setI(i + 1);
    else {
      const n = session?.length ?? 0;
      const badges = reward({ xp: n * 2 + (good ? 1 : 0), day: { reviews: n }, totals: { reviews: n } });
      claimQuests().forEach((q) => notify('ok', `Quête accomplie : ${q.label} (+${q.reward} XP)`));
      notifyBadges(badges);
      celebrate();
      setSession([]);
    }
  };

  if (session && session.length === 0) {
    return (
      <div className="narrow card center">
        <IconBadge icon={ICONS.review} tone="info" size={34} className="hero-ico" />
        <h1>Révisions terminées !</h1>
        <p className="muted">
          {ok} carte(s) maîtrisée(s). Les cartes réussies reviendront plus tard (1, 3, 7, 16 puis 35 jours) : c'est la répétition espacée.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => setSession(null)}>
            Retour
          </button>
          <button className="btn primary" onClick={() => navigate('/jeux')}>
            <Icon name="games" size={18} /> Jouer un peu
          </button>
        </div>
      </div>
    );
  }

  if (session) {
    const card = session[i];
    const ex = card.ref ? EX_INDEX.get(card.ref) : undefined;
    return (
      <div className="ex-shell">
        <div className="ex-top">
          <button className="btn ghost icon" aria-label="Arrêter" onClick={() => setSession(null)}>
            <Icon name="close" size={20} />
          </button>
          <ProgressBar value={i / session.length} label="Progression des révisions" />
          <span className="chip">
            {i + 1}/{session.length}
          </span>
        </div>
        {card.kind === 'mistake' && ex ? (
          <ExerciseView key={card.id} exercise={ex} onDone={(r) => grade(card, r === 'correct' || r === 'typo')} />
        ) : (
          <div className="ex-body">
            <p className="ex-instruction">{flipped ? 'Le saviez-vous ?' : 'Que signifie ce mot ?'}</p>
            <button
              className="card flashcard"
              style={{ width: '100%' }}
              onClick={() => {
                setFlipped(true);
                void say(card.front);
              }}
              aria-label={flipped ? 'Carte retournée' : 'Retourner la carte'}
            >
              {flipped ? (
                <div>
                  <div><Rich text={card.back} /></div>
                  <div className="small muted mt" style={{ fontWeight: 600 }}>
                    {card.front}
                    {card.note && (
                      <>
                        {' — '}
                        <Rich text={card.note} />
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {card.front}
                  <div className="tiny muted mt">Touchez pour voir la réponse</div>
                </div>
              )}
            </button>
            <div className="ex-actions">
              {flipped ? (
                <>
                  <button className="btn danger lg" onClick={() => grade(card, false)}>
                    <Icon name="replay" size={18} /> À revoir
                  </button>
                  <button className="btn primary lg" onClick={() => grade(card, true)}>
                    <Icon name="check" size={18} /> Je savais
                  </button>
                </>
              ) : (
                <button className="btn primary lg" onClick={() => setFlipped(true)}>
                  Voir la réponse
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="narrow">
      <div className="page-head">
        <h1 className="title-icon">
          <IconBadge icon={ICONS.review} tone="info" />
          Révisions
        </h1>
        <p>Répétition espacée : on revoit chaque mot et chaque erreur juste avant de l'oublier.</p>
      </div>
      <div className="card center">
        <div className="big" style={{ fontSize: '2.6rem', fontWeight: 900 }}>
          {due.length}
        </div>
        <p className="muted">carte(s) à réviser aujourd'hui · {total} au total</p>
        {due.length > 0 ? (
          <button className="btn primary lg" onClick={start}>
            Réviser {Math.min(SESSION_SIZE, due.length)} cartes
          </button>
        ) : (
          <p className="small">
            {total === 0 ? 'Terminez une leçon pour alimenter vos révisions.' : 'Rien à réviser pour le moment, revenez demain !'}
          </p>
        )}
      </div>
      {total > 0 && (
        <div className="card mt">
          <h3>Boîtes de Leitner</h3>
          <div className="bars" style={{ height: 100 }}>
            {boxes.map((n, k) => (
              <div key={k} className="bar">
                <span className="tiny">{n}</span>
                <span className="fill" style={{ height: `${total ? (n / total) * 100 : 0}%` }} />
                <span>Boîte {k + 1}</span>
              </div>
            ))}
          </div>
          <p className="tiny muted">Une carte réussie monte d'une boîte (et revient plus tard) ; une carte ratée retourne en boîte 1.</p>
        </div>
      )}
    </div>
  );
}
