import { describe, expect, it } from 'vitest';
import { checkText } from '../lib/corrector';
import { COMMON_MISTAKES } from '../data/commonMistakes';
import { IRREGULAR_VERBS, formMatches } from '../data/irregularVerbs';
import { GAMES, memoryScore } from './Games';
import { gameIcon } from '../components/Icon';
import { Gamepad2 } from 'lucide-react';

describe('nouveaux mini-jeux', () => {
  it('chaque jeu a son icône', () => {
    for (const g of GAMES) expect(gameIcon(g.id), g.id).not.toBe(Gamepad2);
  });

  it('verbes irréguliers : formes acceptées', () => {
    expect(new Set(IRREGULAR_VERBS.map((v) => v.base)).size).toBe(IRREGULAR_VERBS.length);
    expect(formMatches('went', 'went')).toBe(true);
    expect(formMatches(' Went ', 'went')).toBe(true);
    expect(formMatches('learnt', 'learned|learnt')).toBe(true);
    expect(formMatches('was/were', 'was|were')).toBe(true);
    expect(formMatches('goed', 'went')).toBe(false);
    expect(formMatches('', 'went')).toBe(false);
  });

  it('phrase juste : les phrases « correctes » ne sont pas signalées par le correcteur', () => {
    for (const m of COMMON_MISTAKES) {
      expect(m.wrong).not.toBe(m.right);
      expect(m.tip.length).toBeGreaterThan(5);
      expect(checkText(m.right).issues, m.right).toEqual([]);
    }
  });

  it('memory : 100 pour un sans-faute rapide, jamais moins de 10', () => {
    expect(memoryScore(8, 8, 4)).toBe(100);
    expect(memoryScore(8, 12, 50)).toBe(74);
    expect(memoryScore(8, 60, 600)).toBe(10);
  });
});
