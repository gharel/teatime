import { useEffect, useMemo, useRef, useState } from 'react';
import type { Level, PlacementQuestion, Skill } from '../types';
import { LEVELS } from '../types';
import { PLACEMENT_BANK } from '../data/placement';
import {
  CEFR_INFO,
  finalLevel,
  initCat,
  nextQuestion,
  SKILL_LABELS,
  TEST_LENGTH,
  update,
  type CatState,
} from '../lib/placement';
import { claimQuests, dayKey, reward, savePlacement, setLevel, type PlacementResult } from '../lib/store';
import { say } from '../lib/tts';
import { celebrate, LevelBadge, navigate, notifyBadges, ProgressBar, sfx, useKey } from '../components/ui';
import { UNITS_BY_LEVEL } from '../data/lessons';
import Icon, { ICONS, IconBadge, type IconName } from '../components/Icon';

const SELF_ASSESS: { label: string; desc: string; start: number; icon: IconName }[] = [
  { icon: 'sprout' as IconName, label: 'Je débute', desc: 'Quelques mots, quelques phrases', start: 1.2 },
  { icon: 'footprints' as IconName, label: 'Je me débrouille', desc: 'Conversations simples du quotidien', start: 2.2 },
  { icon: 'bike' as IconName, label: 'Je suis à l’aise', desc: 'Je comprends l’essentiel, je donne mon avis', start: 3.3 },
  { icon: 'rocket' as IconName, label: 'Je suis très à l’aise', desc: 'Travail, films en VO, nuances', start: 4.5 },
];

export default function Placement() {
  const [phase, setPhase] = useState<'intro' | 'test' | 'result'>('intro');
  const [cat, setCat] = useState<CatState | null>(null);
  const [q, setQ] = useState<PlacementQuestion | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [plays, setPlays] = useState(0);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const begin = (start: number) => {
    const st = initCat(start);
    setCat(st);
    setQ(nextQuestion(st, PLACEMENT_BANK));
    setPhase('test');
  };

  useEffect(() => {
    setChoice(null);
    setRevealed(false);
    setPlays(0);
    if (q?.audio) {
      void say(q.audio);
      setPlays(1);
    }
  }, [q]);

  useEffect(() => {
    if (revealed) nextRef.current?.focus();
  }, [revealed]);

  const answer = (skipped = false) => {
    if (!cat || !q || revealed) return;
    const correct = !skipped && choice === q.answer;
    const st = update(cat, q, correct, skipped);
    setCat(st);
    // Pas de correction affichée pendant le test (évite le stress et les biais),
    // juste un court retour visuel neutre puis question suivante.
    setRevealed(true);
    window.setTimeout(() => {
      const nq = nextQuestion(st, PLACEMENT_BANK);
      if (!nq) finish(st);
      else setQ(nq);
    }, 280);
  };

  const finish = (st: CatState) => {
    const f = finalLevel(st);
    const bySkill = {} as Record<Skill, { correct: number; total: number }>;
    for (const s of ['grammar', 'vocabulary', 'reading', 'listening'] as Skill[]) bySkill[s] = { correct: 0, total: 0 };
    for (const a of st.answers) {
      bySkill[a.skill].total++;
      if (a.correct) bySkill[a.skill].correct++;
    }
    const r: PlacementResult = {
      date: dayKey(),
      level: f.level,
      theta: f.theta,
      nextProgress: f.nextProgress,
      bySkill,
      correct: st.answers.filter((a) => a.correct).length,
      total: st.answers.length,
    };
    savePlacement(r);
    const badges = reward({ xp: 30 });
    claimQuests();
    notifyBadges(badges);
    setResult(r);
    setPhase('result');
    sfx('win');
    celebrate();
  };

  useKey(
    (e) => {
      if (phase !== 'test' || !q) return;
      if (/^[1-4]$/.test(e.key)) setChoice(Number(e.key) - 1);
      if (e.key === 'Enter' && choice != null) answer();
    },
    [phase, q, choice, cat, revealed],
  );

  const asked = cat?.answers.length ?? 0;

  if (phase === 'intro') {
    return (
      <div className="narrow">
        <div className="page-head">
          <h1 className="title-icon">
            <IconBadge icon={ICONS.test} />
            Test de niveau
          </h1>
          <p>20 questions adaptatives · environ 6 minutes · grammaire, vocabulaire, lecture et écoute.</p>
        </div>
        <div className="card">
          <h2>Comment évaluez-vous votre anglais aujourd'hui ?</h2>
          <p className="muted small">
            Cela nous permet de choisir la première question. Le test s'adapte ensuite à vos réponses : il devient plus difficile quand
            vous réussissez, plus simple sinon.
          </p>
          <div className="options">
            {SELF_ASSESS.map((s) => (
              <button key={s.label} className="option" onClick={() => begin(s.start)}>
                <IconBadge icon={ICONS[s.icon]} tone="primary" size={22} />
                <span>
                  {s.label}
                  <span className="small muted" style={{ display: 'block', fontWeight: 500 }}>
                    {s.desc}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="card flat mt">
          <h3 className="label-icon">
            <Icon name="tip" /> Conseils
          </h3>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Répondez sans dictionnaire : le but est de trouver le bon niveau de départ, pas d'avoir 20/20.</li>
            <li>Si vous ne savez pas, cliquez sur « Je ne sais pas » plutôt que de deviner : le résultat sera plus juste.</li>
            <li>Activez le son pour les questions d'écoute.</li>
          </ul>
        </div>
      </div>
    );
  }

  if (phase === 'result' && result) return <PlacementResultView r={result} />;

  if (!q) return null;
  return (
    <div className="ex-shell">
      <div className="ex-top">
        <button
          className="btn ghost icon"
          aria-label="Quitter le test"
          onClick={() => {
            if (window.confirm('Quitter le test ? Vos réponses seront perdues.')) navigate('/');
          }}
        >
          <Icon name="close" size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="segments" style={{ gridTemplateColumns: `repeat(${TEST_LENGTH}, 1fr)` }} aria-hidden>
            {Array.from({ length: TEST_LENGTH }, (_, i) => (
              <span key={i} className={i < asked ? 'done' : i === asked ? 'current' : ''} />
            ))}
          </div>
          <div className="sr-only">
            <ProgressBar value={asked / TEST_LENGTH} label="Progression du test" />
          </div>
        </div>
        <span className="chip" aria-live="polite">
          {Math.min(asked + 1, TEST_LENGTH)} / {TEST_LENGTH}
        </span>
      </div>

      <div className="ex-body" style={{ opacity: revealed ? 0.4 : 1, transition: 'opacity .2s' }}>
        <div className="row mb">
          <span className="chip primary">{SKILL_LABELS[q.skill]}</span>
        </div>
        <p className="ex-instruction">{q.instruction}</p>
        {q.passage && <div className="passage">{q.passage}</div>}
        {q.audio && (
          <div className="row mb" style={{ justifyContent: 'center' }}>
            <button
              className="speaker-btn"
              aria-label="Réécouter"
              disabled={plays >= 3}
              onClick={() => {
                setPlays(plays + 1);
                void say(q.audio!);
              }}
            >
              <Icon name="speaker" size={40} />
            </button>
            <span className="small muted">{3 - plays} écoute(s) restante(s)</span>
          </div>
        )}
        <p className="ex-prompt">{q.prompt}</p>
        <div className="options">
          {q.options.map((o, i) => (
            <button key={i} className="option" aria-pressed={choice === i} disabled={revealed} onClick={() => setChoice(i)}>
              <span className="key" aria-hidden>
                {i + 1}
              </span>
              {o}
            </button>
          ))}
        </div>
      </div>
      <div className="ex-actions">
        <button className="btn ghost" disabled={revealed} onClick={() => answer(true)}>
          Je ne sais pas
        </button>
        <button ref={nextRef} className="btn primary lg" disabled={choice == null || revealed} onClick={() => answer()}>
          Valider
        </button>
      </div>
    </div>
  );
}

export function PlacementResultView({ r }: { r: PlacementResult }) {
  const info = CEFR_INFO[r.level];
  const idx = LEVELS.indexOf(r.level);
  const nextLevel: Level | null = idx < 5 ? LEVELS[idx + 1] : null;
  const markerPct = useMemo(() => Math.max(0, Math.min(100, ((r.theta - 0.5) / 6) * 100)), [r.theta]);
  const firstUnit = UNITS_BY_LEVEL[r.level][0];
  return (
    <div className="narrow">
      <div className="card center">
        <p className="muted" style={{ marginBottom: 8 }}>
          Votre niveau estimé
        </p>
        <LevelBadge level={r.level} xl />
        <h1 className="mt">
          {r.level} · {info.name}
        </h1>
        <p>{info.summary}</p>
        {nextLevel && (
          <div className="stack" style={{ maxWidth: 380, margin: '0 auto' }}>
            <div className="row between small">
              <span>{r.level}</span>
              <span>
                vers {nextLevel} : {Math.round(r.nextProgress * 100)} %
              </span>
            </div>
            <ProgressBar value={r.nextProgress} label={`Progression vers ${nextLevel}`} gold />
          </div>
        )}
      </div>

      <h2 className="section-title">
        <Icon name="pin" /> Où vous situez-vous ?
      </h2>
      <div className="card">
        <div style={{ position: 'relative', padding: '26px 0 6px' }}>
          <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            {LEVELS.map((l) => (
              <div key={l} data-lv={l} style={{ flex: 1, height: 14, background: 'var(--lv)', opacity: l === r.level ? 1 : 0.35, borderRadius: 6 }} />
            ))}
          </div>
          <div style={{ position: 'absolute', top: 0, left: `calc(${markerPct}% - 10px)`, fontSize: 18 }} aria-hidden>
            ▼
          </div>
          <div className="row" style={{ gap: 4, flexWrap: 'nowrap', marginTop: 6 }}>
            {LEVELS.map((l) => (
              <div key={l} className="tiny center" style={{ flex: 1, fontWeight: l === r.level ? 900 : 500 }}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2 mt">
        <div className="card">
          <h3 className="label-icon">
            <Icon name="ok" /> Ce que vous savez faire
          </h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {info.canDo.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3 className="label-icon">
            <Icon name="chart" /> Détail ({r.correct}/{r.total})
          </h3>
          <div className="stack">
            {(Object.keys(r.bySkill) as Skill[])
              .filter((s) => r.bySkill[s].total > 0)
              .map((s) => (
                <div key={s}>
                  <div className="row between small">
                    <span>{SKILL_LABELS[s]}</span>
                    <span>
                      {r.bySkill[s].correct}/{r.bySkill[s].total}
                    </span>
                  </div>
                  <ProgressBar thin value={r.bySkill[s].correct / r.bySkill[s].total} label={SKILL_LABELS[s]} />
                </div>
              ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 10 }}>
            Les questions étant adaptées à votre niveau, un score d'environ 60 % est normal : c'est le signe que le test a trouvé votre
            zone de progression.
          </p>
        </div>
      </div>

      <div className="card mt">
        <h3 className="label-icon">
          <Icon name="test" /> Prochaine étape
        </h3>
        <p className="small muted">
          Votre parcours {r.level} commence par l'unité « {firstUnit.title} ». Vous pouvez aussi pratiquer l'oral avec Emma, votre prof
          vocale.
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => navigate(`/lecon/${firstUnit.id}`)}>
            Commencer {r.level} →
          </button>
          <button className="btn" onClick={() => navigate('/emma')}>
            <Icon name="chat" size={18} /> Parler avec Emma
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              const lower = LEVELS[Math.max(0, idx - 1)];
              setLevel(lower);
              navigate('/parcours');
            }}
          >
            Commencer un niveau plus bas
          </button>
        </div>
      </div>
    </div>
  );
}
