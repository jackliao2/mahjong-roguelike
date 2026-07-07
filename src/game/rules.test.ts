import { describe, expect, it } from 'vitest';
import { Tile, WinningHand } from '@/types';
import { createTile } from './tiles';
import { detectWin, findWaitingTiles } from './winDetector';
import { checkAllYaku } from './yaku';

function tiles(specs: Array<[Tile['suit'], number]>): Tile[] {
  return specs.map(([suit, rank]) => createTile(suit, rank));
}

function requireWin(hand: Tile[]): WinningHand {
  const win = detectWin(hand);
  expect(win).not.toBeNull();
  return win!;
}

function yakuIds(hand: Tile[]): string[] {
  return checkAllYaku(requireWin(hand), hand, false).map(({ yaku }) => yaku.id);
}

describe('mahjong rules', () => {
  it('detects chanta when every set and pair contains a terminal or honor', () => {
    const hand = tiles([
      ['man', 1], ['man', 2], ['man', 3],
      ['man', 7], ['man', 8], ['man', 9],
      ['pin', 1], ['pin', 1], ['pin', 1],
      ['sou', 9], ['sou', 9], ['sou', 9],
      ['wind', 1], ['wind', 1],
    ]);

    const ids = yakuIds(hand);

    expect(ids).toContain('chantai');
    expect(ids).not.toContain('honroutou');
  });

  it('does not treat a simple-only hand as chanta', () => {
    const hand = tiles([
      ['man', 2], ['man', 3], ['man', 4],
      ['pin', 3], ['pin', 4], ['pin', 5],
      ['sou', 4], ['sou', 5], ['sou', 6],
      ['man', 6], ['man', 7], ['man', 8],
      ['pin', 5], ['pin', 5],
    ]);

    expect(yakuIds(hand)).not.toContain('chantai');
  });

  it('finds the 13-sided kokushi wait', () => {
    const hand = tiles([
      ['man', 1], ['man', 9],
      ['pin', 1], ['pin', 9],
      ['sou', 1], ['sou', 9],
      ['wind', 1], ['wind', 2], ['wind', 3], ['wind', 4],
      ['dragon', 1], ['dragon', 2], ['dragon', 3],
    ]);

    expect(findWaitingTiles(hand).sort()).toEqual([
      'dragon-1', 'dragon-2', 'dragon-3',
      'man-1', 'man-9',
      'pin-1', 'pin-9',
      'sou-1', 'sou-9',
      'wind-1', 'wind-2', 'wind-3', 'wind-4',
    ].sort());
  });
});
