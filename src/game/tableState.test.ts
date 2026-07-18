import { describe, expect, it } from 'vitest';
import {
  advanceOpponentTurn,
  createOpponentTableState,
  getRoundObjective,
  objectivePointDelta,
  objectiveRiskModifier,
  opponentStatusLabel,
} from './tableState';

describe('opponent table state', () => {
  it('progresses from hand building into riichi with readable actions', () => {
    let state = createOpponentTableState('riichi');
    state.shanten = 1;
    const result = advanceOpponentTurn(state, 20, () => 0);

    expect(result.state.shanten).toBe(0);
    expect(result.state.mode).toBe('riichi');
    expect(result.state.points).toBe(24000);
    expect(result.riskDelta).toBeGreaterThan(0);
    expect(result.log).toContain('RIICHI');
    expect(opponentStatusLabel(result.state)).toBe('RIICHI');
  });

  it('lets calm opponents fold when table pressure is high', () => {
    const result = advanceOpponentTurn(createOpponentTableState('calm'), 80, () => 1);
    expect(result.state.mode).toBe('defending');
    expect(result.riskDelta).toBeLessThan(0);
    expect(result.log).toContain('folds');
  });
});

describe('round objectives', () => {
  it('selects a situational lead or comeback goal', () => {
    expect(getRoundObjective(4, 27000, 24000).id).toBe('protect-lead');
    expect(getRoundObjective(4, 22000, 26000).id).toBe('overtake');
    expect(getRoundObjective(10, 25000, 25000).id).toBe('avoid-dealin');
  });

  it('changes risk and point rewards based on strategic commitment', () => {
    const defense = getRoundObjective(10, 25000, 25000);
    expect(objectiveRiskModifier(defense, true)).toBeGreaterThan(0);
    expect(objectivePointDelta(defense, true, false, true)).toBe(1000);
    expect(objectivePointDelta(defense, false, true, true)).toBe(-1500);
  });
});
