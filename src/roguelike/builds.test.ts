import { describe, expect, it } from 'vitest';
import { getBuildScoreMultiplier } from './builds';

describe('roguelike builds', () => {
  it('rewards focused yaku routes', () => {
    expect(getBuildScoreMultiplier('tanyao', 'tanyao')).toBe(1.6);
    expect(getBuildScoreMultiplier('pinfu', 'pinfu')).toBe(1.6);
    expect(getBuildScoreMultiplier('yakuhai', 'yakuhai')).toBe(1.7);
  });

  it('does not reward mismatched yaku routes', () => {
    expect(getBuildScoreMultiplier('tanyao', 'pinfu')).toBe(1);
    expect(getBuildScoreMultiplier('pinfu', 'yakuhai')).toBe(1);
    expect(getBuildScoreMultiplier('yakuhai', undefined)).toBe(1);
  });

  it('keeps balanced flexible by rewarding boss questions', () => {
    expect(getBuildScoreMultiplier('balanced', undefined, true)).toBe(1.15);
    expect(getBuildScoreMultiplier('balanced', 'tanyao', false)).toBe(1);
  });
});
