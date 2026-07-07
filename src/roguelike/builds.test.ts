import { describe, expect, it } from 'vitest';
import { getBuildQuestionType, getBuildScoreMultiplier } from './builds';

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

  it('routes focused builds toward their yaku after the opening rounds', () => {
    expect(getBuildQuestionType('tanyao', 4, false, 0.1)).toBe('yaku-form:tanyao');
    expect(getBuildQuestionType('pinfu', 7, false, 0.1)).toBe('yaku-form:pinfu');
    expect(getBuildQuestionType('yakuhai', 10, false, 0.1)).toBe('yaku-form:yakuhai');
  });

  it('preserves opening rounds, boss rounds, and balanced runs', () => {
    expect(getBuildQuestionType('tanyao', 2, false, 0.1)).toBeUndefined();
    expect(getBuildQuestionType('tanyao', 6, true, 0.1)).toBeUndefined();
    expect(getBuildQuestionType('balanced', 6, false, 0.1)).toBeUndefined();
  });

  it('does not force route questions on high rolls', () => {
    expect(getBuildQuestionType('tanyao', 4, false, 0.9)).toBeUndefined();
  });
});
