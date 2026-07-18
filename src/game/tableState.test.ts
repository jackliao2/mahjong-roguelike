import { describe, expect, it } from 'vitest';
import {
  advanceOpponentTurn,
  createOpponentTableState,
  getRoundObjective,
  objectivePointDelta,
  objectiveRiskModifier,
  objectiveValueWeight,
  opponentStatusLabel,
  evaluateTileDanger,
  strategicDiscardScore,
  strategicRiskDelta,
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

  it('starts the final riichi opponent one step from tenpai', () => {
    expect(createOpponentTableState('riichi').shanten).toBe(1);
  });

  it('distinguishes genbutsu, suji and live danger', () => {
    const state = { ...createOpponentTableState('riichi'), mode: 'riichi' as const, shanten: 0 };
    expect(evaluateTileDanger('man-4', ['man-4'], state).label).toBe('GENBUTSU');
    expect(evaluateTileDanger('man-7', ['man-4'], state).label).toBe('SUJI');
    expect(evaluateTileDanger('pin-5', ['man-4'], state).label).toBe('DANGER');
    expect(evaluateTileDanger('pin-5', ['man-4'], state).value).toBeGreaterThan(60);
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

  it('allows a safe discard to beat raw ukeire under riichi pressure', () => {
    const objective = getRoundObjective(10, 30000, 24000);
    const state = { ...createOpponentTableState('riichi'), mode: 'riichi' as const, shanten: 0 };
    const safe = evaluateTileDanger('man-4', ['man-4'], state);
    const danger = evaluateTileDanger('pin-5', ['man-4'], state);
    expect(strategicDiscardScore(2, safe, objective, state))
      .toBeGreaterThan(strategicDiscardScore(8, danger, objective, state));
  });

  it('lowers table pressure for safe tiles and raises it for dangerous pushes', () => {
    expect(strategicRiskDelta(0)).toBeLessThan(0);
    expect(strategicRiskDelta(24)).toBeLessThan(0);
    expect(strategicRiskDelta(76)).toBeGreaterThan(0);
  });

  it('weights hand value most heavily when the table needs a valuable hand', () => {
    const valueGoal = getRoundObjective(7, 18000, 28000);
    const tenpaiGoal = getRoundObjective(1, 25000, 25000);
    expect(objectiveValueWeight(valueGoal, true)).toBeGreaterThan(objectiveValueWeight(tenpaiGoal, true));
  });
});
