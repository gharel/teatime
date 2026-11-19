import { dayKey, displayedStreak, playerLevel, questsOfDay, today, useAppState } from '../lib/store';
import { ProgressBar, Ring } from './ui';
import Icon, { ICONS, IconBadge } from './Icon';

export function StatsHeader() {
  const s = useAppState((st) => st);
  const pl = playerLevel(s.xp);
  const d = today(s);
  const streak = displayedStreak(s);
  return (
    <div className="grid-2">
      <div className="card">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <Ring value={d.xp / s.profile.dailyGoal} label={`Objectif du jour : ${d.xp} sur ${s.profile.dailyGoal} XP`}>
            {d.xp}
            <span className="tiny muted">/{s.profile.dailyGoal}</span>
          </Ring>
          <div style={{ flex: 1 }}>
            <strong>Objectif du jour</strong>
            <p className="small muted" style={{ margin: 0 }}>
              {d.xp >= s.profile.dailyGoal ? 'Atteint, bravo !' : `Encore ${s.profile.dailyGoal - d.xp} XP`}
            </p>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="row between">
          <div className="stat">
            <IconBadge icon={ICONS.flame} tone="accent" />
            <div>
              <div className="big">{streak}</div>
              <div className="tiny muted">jour{streak > 1 ? 's' : ''} de série</div>
            </div>
          </div>
          <div className="stat">
            <IconBadge icon={ICONS.freeze} tone="info" />
            <div>
              <div className="big">{s.streak.freezes}</div>
              <div className="tiny muted">joker{s.streak.freezes > 1 ? 's' : ''}</div>
            </div>
          </div>
          <div className="stat">
            <IconBadge icon={ICONS.xp} tone="gold" />
            <div>
              <div className="big">{s.xp}</div>
              <div className="tiny muted">XP total</div>
            </div>
          </div>
        </div>
        <div className="mt">
          <div className="row between tiny">
            <strong>Niveau joueur {pl.level}</strong>
            <span className="muted">
              {pl.current}/{pl.next} XP
            </span>
          </div>
          <ProgressBar value={pl.progress} label={`Progression vers le niveau joueur ${pl.level + 1}`} gold thin />
        </div>
      </div>
    </div>
  );
}

export function Quests() {
  const s = useAppState((st) => st);
  const d = today(s);
  const claimed = s.questsClaimed[dayKey()] ?? [];
  return (
    <div className="card">
      {questsOfDay().map((q) => {
        const v = Math.min(q.target, q.metric(d, s));
        const done = claimed.includes(q.id) || v >= q.target;
        return (
          <div key={q.id} className={`quest${done ? ' done' : ''}`}>
            <span className="check" aria-hidden>
              {done ? <Icon name="check" size={16} strokeWidth={3} /> : <Icon name="target" size={16} />}
            </span>
            <div style={{ flex: 1 }}>
              <div className="small" style={{ fontWeight: 700 }}>
                {q.label}
              </div>
              <ProgressBar thin value={v / q.target} label={q.label} />
            </div>
            <span className="chip gold">+{q.reward}</span>
          </div>
        );
      })}
    </div>
  );
}
