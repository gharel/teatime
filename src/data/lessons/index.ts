import type { Level, Unit } from '../../types';
import { A1_UNITS } from './a1';
import { A2_UNITS } from './a2';
import { B1_UNITS } from './b1';
import { B2_UNITS } from './b2';
import { C1_UNITS } from './c1';
import { C2_UNITS } from './c2';

export const UNITS_BY_LEVEL: Record<Level, Unit[]> = {
  A1: A1_UNITS,
  A2: A2_UNITS,
  B1: B1_UNITS,
  B2: B2_UNITS,
  C1: C1_UNITS,
  C2: C2_UNITS,
};

export const ALL_UNITS: Unit[] = Object.values(UNITS_BY_LEVEL).flat();

export function findUnit(id: string): Unit | undefined {
  return ALL_UNITS.find((u) => u.id === id);
}

/** Leçons voisines dans l'ordre global du parcours (A1 → C2). */
export function neighborUnits(id: string): { prev?: Unit; next?: Unit; index: number } {
  const i = ALL_UNITS.findIndex((u) => u.id === id);
  return { prev: i > 0 ? ALL_UNITS[i - 1] : undefined, next: i >= 0 && i < ALL_UNITS.length - 1 ? ALL_UNITS[i + 1] : undefined, index: i };
}

/** Recherche plein texte (titre, objectif, grammaire, vocabulaire), insensible aux accents. */
export function searchUnits(query: string): Unit[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return ALL_UNITS;
  return ALL_UNITS.filter((u) => {
    const hay = fold(
      [u.level, u.title, u.canDo, u.grammar.title, u.grammar.frenchTrap ?? '', ...u.vocab.map((v) => `${v.en} ${v.fr}`)].join(' '),
    );
    return terms.every((t) => hay.includes(t));
  });
}
