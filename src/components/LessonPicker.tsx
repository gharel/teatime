/* Sélecteur « Aller à une leçon » : toutes les leçons, tous niveaux, accès libre. */
import { LEVELS } from '../types';
import { UNITS_BY_LEVEL } from '../data/lessons';
import { CEFR_INFO } from '../lib/placement';
import { useAppState } from '../lib/store';
import { navigate } from './ui';

export default function LessonPicker({ current, label = 'Aller à une leçon' }: { current?: string; label?: string }) {
  const units = useAppState((s) => s.units);
  return (
    <select
      className="input lesson-picker"
      aria-label={label}
      value={current ?? ''}
      onChange={(e) => e.target.value && navigate(`/lecon/${e.target.value}`)}
    >
      {!current && <option value="">{label}…</option>}
      {LEVELS.map((l) => (
        <optgroup key={l} label={`${l} · ${CEFR_INFO[l].name}`}>
          {UNITS_BY_LEVEL[l].map((u, i) => (
            <option key={u.id} value={u.id}>
              {units[u.id] ? '✓ ' : ''}
              {l} · {i + 1}. {u.title} — {u.grammar.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
