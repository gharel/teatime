import { useEffect, useState } from 'react';
import type { Level, Unit } from '../types';
import { LEVELS } from '../types';
import { CEFR_INFO } from '../lib/placement';
import { dueCards, setLevel, setName, useAppState } from '../lib/store';
import Avatar from '../tutor/Avatar';
import { LevelBadge, navigate } from '../components/ui';
import { Quests, StatsHeader } from '../components/Stats';
import Icon, { ICONS, IconBadge, unitIcon, type IconName } from '../components/Icon';

function Onboarding() {
  const name = useAppState((s) => s.profile.name);
  return (
    <div className="container">
      <div className="card highlight" style={{ padding: 24 }}>
        <div className="grid-2" style={{ alignItems: 'center' }}>
          <div>
            <span className="chip primary">Gratuit · Sans compte · 100 % dans votre navigateur</span>
            <h1 className="mt">Parlez anglais avec confiance</h1>
            <p>
              Un parcours pensé <strong>pour les francophones</strong> : on part de vos difficultés réelles (le « th », le present perfect,
              les faux amis…), on pratique un peu chaque jour et on <strong>parle</strong> avec Emma, une prof vocale qui vous corrige
              avec bienveillance.
            </p>
            <label className="field" style={{ maxWidth: 320 }}>
              Comment vous appelez-vous ? <span className="hint">(facultatif — Emma vous appellera ainsi)</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre prénom" autoComplete="given-name" />
            </label>
            <div className="row mt">
              <button className="btn primary lg" onClick={() => navigate('/test')}>
                <Icon name="test" /> Trouver mon niveau (6 min)
              </button>
            </div>
          </div>
          <div className="avatar-wrap" style={{ margin: '0 auto', width: 'min(70vw, 300px)' }}>
            <Avatar state="idle" mood="happy" />
          </div>
        </div>
      </div>

      <h2 className="section-title">Je connais déjà mon niveau</h2>
      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {LEVELS.map((l) => (
          <button
            key={l}
            className="game-card"
            onClick={() => {
              setLevel(l);
              navigate('/parcours');
            }}
          >
            <LevelBadge level={l} />
            <strong>{CEFR_INFO[l].name}</strong>
            <span className="tiny muted">{CEFR_INFO[l].summary}</span>
          </button>
        ))}
      </div>

      <h2 className="section-title">Comment ça marche ?</h2>
      <div className="grid-3">
        {[
          ['test', 'Test adaptatif', '20 questions qui s’ajustent à vos réponses pour estimer votre niveau CECRL (A1 → C2).'],
          ['grammar', 'Leçons courtes', 'Un objectif concret, la grammaire expliquée en français, du vocabulaire audio et des exercices variés.'],
          ['chat', 'Conversation vocale', 'Emma vous pose des questions sur des thèmes du quotidien et reformule vos erreurs.'],
          ['review', 'Révisions espacées', 'Vos mots et vos erreurs reviennent au bon moment pour être mémorisés durablement.'],
          ['games', 'Zone de jeu', 'XP, série de jours, quêtes, badges et mini-jeux pour garder la motivation.'],
          ['lock', 'Privé et gratuit', 'Vos données restent dans votre navigateur. L’IA tourne sur votre appareil.'],
        ].map(([i, t, d]) => (
          <div key={t} className="card flat feature">
            <IconBadge icon={ICONS[i as IconName]} size={22} />
            <strong>{t}</strong>
            <p className="small muted" style={{ margin: 0 }}>
              {d}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const s = useAppState((st) => st);
  // Les leçons (≈ 50 ko gzip) sont chargées après le premier affichage.
  const [byLevel, setByLevel] = useState<Record<Level, Unit[]> | null>(null);
  useEffect(() => {
    void import('../data/lessons').then((m) => setByLevel(m.UNITS_BY_LEVEL));
  }, []);
  if (!s.profile.onboarded || !s.profile.level) return <Onboarding />;
  const level = s.profile.level as Level;
  const units = byLevel?.[level] ?? [];
  const next: Unit | undefined = units.find((u) => !s.units[u.id] || s.units[u.id].stars < 2) ?? units[0];
  const allDone = units.every((u) => s.units[u.id]);
  const due = dueCards(s).length;
  const hello = new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir';

  return (
    <div className="container">
      <div className="page-head row between">
        <div>
          <h1>
            {hello}
            {s.profile.name ? ` ${s.profile.name}` : ''} !
          </h1>
          <p>Quelques minutes par jour suffisent : la régularité bat l'intensité.</p>
        </div>
        <button className="btn ghost sm" onClick={() => navigate('/parcours')} aria-label={`Niveau ${level}, changer`}>
          <LevelBadge level={level} /> {CEFR_INFO[level].name}
        </button>
      </div>

      <StatsHeader />

      <div className="quick-grid mt">
        {next ? (
        <button className="card highlight unit-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate(`/lecon/${next.id}`)}>
          <IconBadge icon={unitIcon(next.id)} tone="primary" size={26} className="unit-ico" />
          <div style={{ flex: 1 }}>
            <div className="tiny muted">{allDone ? 'Niveau terminé — à consolider' : 'Continuer mon parcours'}</div>
            <strong style={{ fontSize: '1.1rem' }}>{next.title}</strong>
            <div className="small muted">{next.canDo}</div>
          </div>
          <span className="btn primary sm">
            Continuer <Icon name="arrowRight" size={16} />
          </span>
        </button>
        ) : (
          <div className="card highlight" aria-busy="true">
            <span className="muted">Chargement du parcours…</span>
          </div>
        )}
        <button className="card unit-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/emma')}>
          <IconBadge icon={ICONS.chat} tone="accent" size={26} className="unit-ico" />
          <div style={{ flex: 1 }}>
            <div className="tiny muted">Pratique orale</div>
            <strong style={{ fontSize: '1.1rem' }}>Parler avec Emma</strong>
            <div className="small muted">Voyages, travail, vie perso… elle vous corrige à l'oral.</div>
          </div>
        </button>
        <button className="card unit-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/revisions')}>
          <IconBadge icon={ICONS.review} tone="info" size={26} className="unit-ico" />
          <div style={{ flex: 1 }}>
            <div className="tiny muted">Répétition espacée</div>
            <strong style={{ fontSize: '1.1rem' }}>{due ? `${due} carte(s) à réviser` : 'Révisions à jour'}</strong>
            <div className="small muted">Mots et erreurs, au bon moment.</div>
          </div>
        </button>
        <button className="card unit-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/jeux')}>
          <IconBadge icon={ICONS.games} tone="gold" size={26} className="unit-ico" />
          <div style={{ flex: 1 }}>
            <div className="tiny muted">Zone de jeu</div>
            <strong style={{ fontSize: '1.1rem' }}>Mini-jeux & badges</strong>
            <div className="small muted">Chrono-Vocab, Faux amis, Prononciation…</div>
          </div>
        </button>
      </div>

      <div className="row mt small">
        <span className="muted">Envie d'un autre sujet ? Toutes les leçons sont en accès libre.</span>
        <button className="btn ghost sm" onClick={() => navigate('/parcours')}>
          <Icon name="library" size={16} /> Choisir n'importe quelle leçon
        </button>
      </div>

      <h2 className="section-title">
        <Icon name="quests" /> Quêtes du jour
      </h2>
      <Quests />

      {s.profile.placements.length === 0 && (
        <div className="card flat mt">
          <div className="row between">
            <span className="small">Vous n'avez pas encore passé le test de niveau.</span>
            <button className="btn sm" onClick={() => navigate('/test')}>
              <Icon name="test" size={16} /> Passer le test
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
