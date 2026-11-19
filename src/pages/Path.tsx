import { useState } from 'react';
import type { Level, Unit } from '../types';
import { LEVELS } from '../types';
import { ALL_UNITS, searchUnits, UNITS_BY_LEVEL } from '../data/lessons';
import { CEFR_INFO } from '../lib/placement';
import { setLevel, useAppState } from '../lib/store';
import { LevelBadge, navigate, ProgressBar, Stars } from '../components/ui';
import LessonPicker from '../components/LessonPicker';
import Icon, { ICONS, IconBadge, unitIcon } from '../components/Icon';

type Tab = Level | 'all';

export default function Path() {
  const level = useAppState((s) => s.profile.level);
  const units = useAppState((s) => s.units);
  const [tab, setTab] = useState<Tab>(level ?? 'A1');
  const [query, setQuery] = useState('');

  const searching = query.trim().length > 0;
  const list: Unit[] = searching ? searchUnits(query) : tab === 'all' ? ALL_UNITS : UNITS_BY_LEVEL[tab];
  const showLevel = searching || tab === 'all';
  const levelList = tab === 'all' ? ALL_UNITS : UNITS_BY_LEVEL[tab];
  const done = levelList.filter((u) => units[u.id]).length;
  // Leçon conseillée : la première non maîtrisée de votre niveau (simple suggestion, tout reste accessible).
  const myUnits = UNITS_BY_LEVEL[level ?? 'A1'];
  const recommended = myUnits.find((u) => !units[u.id] || units[u.id].stars < 2)?.id;

  return (
    <div className="container">
      <div className="page-head">
        <h1 className="title-icon">
          <IconBadge icon={ICONS.path} />
          Parcours
        </h1>
        <p>
          24 leçons, 4 par niveau du CECRL. <strong>Toutes sont en accès libre</strong> : suivez l'ordre conseillé ou allez directement à
          celle qui vous intéresse.
        </p>
      </div>

      <div className="card flat path-tools">
        <label className="field" style={{ flex: 2, minWidth: 220 }}>
          <span className="label-icon">
            <Icon name="search" size={16} /> Rechercher une leçon
          </span>
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ex. present perfect, passif, restaurant, faux amis…"
            aria-label="Rechercher une leçon"
          />
        </label>
        <label className="field" style={{ flex: 3, minWidth: 240 }}>
          <span className="label-icon">
            <Icon name="library" size={16} /> Aller directement à une leçon
          </span>
          <LessonPicker />
        </label>
      </div>

      {!searching && (
        <div className="level-tabs mt" role="tablist" aria-label="Niveaux">
          <button role="tab" aria-selected={tab === 'all'} className="level-tab" data-lv="all" onClick={() => setTab('all')}>
            Tous <span className="tiny">{ALL_UNITS.filter((u) => units[u.id]).length}/24</span>
          </button>
          {LEVELS.map((l) => {
            const n = UNITS_BY_LEVEL[l].filter((u) => units[u.id]).length;
            return (
              <button key={l} role="tab" data-lv={l} aria-selected={tab === l} className="level-tab" onClick={() => setTab(l)}>
                {l} {l === level && <Icon name="star" size={13} style={{ fill: 'currentColor' }} label="mon niveau" />} <span className="tiny">{n}/4</span>
              </button>
            );
          })}
        </div>
      )}

      {searching ? (
        <p className="small muted mt">
          {list.length} leçon{list.length > 1 ? 's' : ''} trouvée{list.length > 1 ? 's' : ''} pour « {query.trim()} »
          {' · '}
          <button className="btn ghost sm" style={{ minHeight: 28 }} onClick={() => setQuery('')}>
            Effacer
          </button>
        </p>
      ) : tab !== 'all' ? (
        <div className="card mt">
          <div className="row">
            <LevelBadge level={tab} />
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0 }}>
                {tab} · {CEFR_INFO[tab].name}
              </h2>
              <p className="small muted" style={{ margin: 0 }}>
                {CEFR_INFO[tab].summary}
              </p>
            </div>
          </div>
          <div className="mt">
            <ProgressBar value={done / levelList.length} label={`Unités terminées en ${tab}`} />
            <p className="tiny muted" style={{ marginTop: 6 }}>
              {done}/4 unités terminées
              {level !== tab && (
                <>
                  {' · '}
                  <button className="btn ghost sm" style={{ minHeight: 28 }} onClick={() => setLevel(tab)}>
                    Définir {tab} comme mon niveau
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="card mt">
          <ProgressBar value={done / 24} label="Leçons terminées, tous niveaux" />
          <p className="tiny muted" style={{ marginTop: 6 }}>
            {done}/24 leçons terminées, tous niveaux confondus
          </p>
        </div>
      )}

      {list.length === 0 && (
        <div className="card flat mt center muted">Aucune leçon ne correspond. Essayez un autre mot (en français ou en anglais).</div>
      )}

      <div className="grid mt">
        {list.map((u, idx) => {
          const p = units[u.id];
          const n = UNITS_BY_LEVEL[u.level].indexOf(u) + 1;
          const startLevel = showLevel && !searching && (idx === 0 || list[idx - 1].level !== u.level);
          return (
            <div key={u.id} className="stack" style={{ gap: 8 }}>
              {startLevel && (
                <h3 className="section-title" style={{ margin: '10px 0 0' }}>
                  <LevelBadge level={u.level} /> {CEFR_INFO[u.level].name}
                </h3>
              )}
              <a
                href={`#/lecon/${u.id}`}
                className={`card unit-card${u.id === recommended ? ' recommended' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/lecon/${u.id}`);
                }}
              >
                <IconBadge icon={unitIcon(u.id)} tone={u.id === recommended ? 'gold' : 'primary'} size={26} className="unit-ico" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tiny muted">
                    {showLevel ? `${u.level} · ` : ''}Unité {n}
                  </div>
                  <strong>{u.title}</strong>
                  <div className="small muted">{u.canDo}</div>
                  <div className="tiny muted label-icon">
                    <Icon name="grammar" size={13} /> {u.grammar.title}
                  </div>
                </div>
                <div className="center" style={{ flexShrink: 0 }}>
                  {p ? (
                    <>
                      <Stars n={p.stars} />
                      <div className="tiny muted">{p.bestScore} %</div>
                    </>
                  ) : u.id === recommended ? (
                    <span className="chip gold">Conseillée</span>
                  ) : (
                    <span className="chip">Ouvrir →</span>
                  )}
                </div>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
