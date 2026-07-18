import { describe, expect, it } from 'vitest';
import {
  BUILD_FOCUS_BONUS,
  BUILD_FOCUS_TARGET,
  assessDiscardValue,
  getBuildQuestionType,
  getBuildScoreMultiplier,
  isBuildRouteMatch,
} from './builds';
import { createTile } from '../game/tiles';

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

  it('identifies route-matching yaku for focus rewards', () => {
    expect(isBuildRouteMatch('tanyao', 'tanyao')).toBe(true);
    expect(isBuildRouteMatch('pinfu', 'pinfu')).toBe(true);
    expect(isBuildRouteMatch('yakuhai', 'yakuhai')).toBe(true);
    expect(isBuildRouteMatch('balanced', 'tanyao')).toBe(false);
    expect(isBuildRouteMatch('tanyao', 'pinfu')).toBe(false);
    expect(isBuildRouteMatch('tanyao')).toBe(false);
  });

  it('defines focus reward tuning in one place', () => {
    expect(BUILD_FOCUS_TARGET).toBe(3);
    expect(BUILD_FOCUS_BONUS).toBe(1200);
  });

  it('rewards cutting a terminal from a Tanyao route', () => {
    const hand = [
      createTile('man', 1), createTile('man', 2), createTile('man', 3),
      createTile('man', 4), createTile('man', 5), createTile('man', 6),
      createTile('pin', 2), createTile('pin', 3), createTile('pin', 4),
      createTile('sou', 4), createTile('sou', 5), createTile('sou', 6),
      createTile('sou', 7), createTile('sou', 7),
    ];
    expect(assessDiscardValue(hand, 'man-1', 'tanyao').score)
      .toBeGreaterThan(assessDiscardValue(hand, 'man-2', 'tanyao').score);
  });

  it('protects a dragon pair on a Yakuhai route', () => {
    const hand = [
      createTile('dragon', 1), createTile('dragon', 1),
      createTile('man', 2), createTile('man', 3), createTile('man', 4),
      createTile('pin', 2), createTile('pin', 3), createTile('pin', 4),
      createTile('sou', 2), createTile('sou', 3), createTile('sou', 4),
      createTile('man', 6), createTile('man', 7), createTile('man', 8),
    ];
    expect(assessDiscardValue(hand, 'man-6', 'yakuhai').score)
      .toBeGreaterThan(assessDiscardValue(hand, 'dragon-1', 'yakuhai').score);
  });
});
