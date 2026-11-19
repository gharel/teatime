import { GAMES, GameRouter } from '../games/Games';
import { BADGES, lastDays, updateDailyGoal, useAppState } from '../lib/store';
import { navigate } from '../components/ui';
import { Quests, StatsHeader } from '../components/Stats';
import Icon, { ICONS, IconBadge, badgeIcon, gameIcon } from '../components/Icon';

const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export default function Arcade({ game }: { game?: string }) {
  const s = useAppState((st) => st);
  if (game) {
    return (
      <div className="container">
        <button className="btn ghost sm mb" onClick={() => navigate('/jeux')}>
          ← Zone de jeu
        </button>
        <GameRouter id={game} />
      </div>
    );
  }
  const week = lastDays(7, s);
  const max = Math.max(s.profile.dailyGoal, ...week.map((w) => w.xp));
  return (
    <div className="container">
      <div className="page-head">
        <h1 className="title-icon">
          <IconBadge icon={ICONS.games} tone="gold" />
          Zone de jeu
        </h1>
        <p>Gagnez de l'XP, tenez votre série, relevez les quêtes du jour et battez vos records.</p>
      </div>
      <StatsHeader />

      <h2 className="section-title">
        <Icon name="games" /> Mini-jeux
      </h2>
      <div className="grid-3">
        {GAMES.map((g) => (
          <button key={g.id} className="game-card" onClick={() => navigate(`/jeux/${g.id}`)}>
            <IconBadge icon={gameIcon(g.id)} tone="primary" size={26} className="unit-ico" />
            <strong>{g.title}</strong>
            <span className="small muted">{g.desc}</span>
            <span className="chip gold" style={{ alignSelf: 'flex-start' }}>
              <Icon name="trophy" size={14} /> Record : {s.bests[g.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="grid-2 mt-lg">
        <div>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            <Icon name="quests" /> Quêtes du jour
          </h2>
          <Quests />
        </div>
        <div>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            <Icon name="trend" /> Cette semaine
          </h2>
          <div className="card">
            <div className="bars">
              {week.map((w, i) => {
                const dte = new Date(w.key + 'T12:00:00');
                return (
                  <div key={w.key} className={`bar${i === 6 ? ' today' : ''}`} title={`${w.key} : ${w.xp} XP`}>
                    <span className="tiny">{w.xp || ''}</span>
                    <span className="fill" style={{ height: `${(w.xp / max) * 100}%` }} />
                    <span>{DAY_LABELS[dte.getDay()]}</span>
                  </div>
                );
              })}
            </div>
            <label className="field mt small">
              Objectif quotidien
              <select className="input" value={s.profile.dailyGoal} onChange={(e) => updateDailyGoal(Number(e.target.value))}>
                <option value={20}>Détente — 20 XP / jour (≈ 5 min)</option>
                <option value={50}>Régulier — 50 XP / jour (≈ 10 min)</option>
                <option value={100}>Sérieux — 100 XP / jour (≈ 20 min)</option>
                <option value={150}>Intensif — 150 XP / jour (≈ 30 min)</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <h2 className="section-title">
        <Icon name="medal" /> Badges ({Object.keys(s.badges).length}/{BADGES.length})
      </h2>
      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
        {BADGES.map((b) => {
          const got = s.badges[b.id];
          return (
            <div key={b.id} className={`badge-tile${got ? '' : ' locked'}`} title={b.desc}>
              <IconBadge icon={badgeIcon(b.id)} tone={got ? 'gold' : 'neutral'} size={26} className="badge-ico" />
              <div className="t">{b.title}</div>
              <div className="tiny muted">{got ? `Obtenu le ${new Date(got + 'T12:00:00').toLocaleDateString('fr-FR')}` : b.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
