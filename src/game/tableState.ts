export type TableOpponentId = 'calm' | 'speed' | 'hunter' | 'riichi';

export type OpponentMode = 'building' | 'open' | 'riichi' | 'defending';

export interface OpponentTableState {
  id: TableOpponentId;
  shanten: number;
  mode: OpponentMode;
  points: number;
  turn: number;
  actionLog: string[];
}

export type RoundObjectiveId = 'tenpai' | 'protect-lead' | 'overtake' | 'minimum-value' | 'avoid-dealin';

export interface RoundObjective {
  id: RoundObjectiveId;
  title: string;
  detail: string;
  successHint: string;
}

export interface OpponentTurnResult {
  state: OpponentTableState;
  riskDelta: number;
  log: string;
}

export interface TileDanger {
  value: number;
  label: 'GENBUTSU' | 'SUJI' | 'LOW' | 'DANGER';
  reason: string;
}

const SPEED: Record<TableOpponentId, number> = {
  calm: 0.48,
  speed: 0.78,
  hunter: 0.52,
  riichi: 0.68,
};

export function createOpponentTableState(id: TableOpponentId): OpponentTableState {
  return {
    id,
    shanten: id === 'riichi' ? 1 : id === 'speed' || id === 'hunter' ? 2 : 3,
    mode: 'building',
    points: 25000,
    turn: 0,
    actionLog: ['Opening hand · reading the table'],
  };
}

export function getRoundObjective(
  round: number,
  playerPoints: number,
  opponentPoints: number,
): RoundObjective {
  const chapter = Math.floor((Math.max(1, round) - 1) / 3) % 5;
  if (chapter === 0) {
    return { id: 'tenpai', title: 'REACH TENPAI', detail: 'Keep the hand live before the chapter boss.', successHint: 'Efficient live-table discards earn +1,000.' };
  }
  if (chapter === 1) {
    return playerPoints >= opponentPoints
      ? { id: 'protect-lead', title: 'PROTECT THE LEAD', detail: `Stay above ${formatPoints(opponentPoints)}. Avoid loose pushes.`, successHint: 'A correct Steady read earns +1,000.' }
      : { id: 'overtake', title: 'OVERTAKE', detail: `You need ${formatPoints(opponentPoints - playerPoints + 100)} to move ahead.`, successHint: 'A successful Press earns an extra +1,000.' };
  }
  if (chapter === 2) {
    return { id: 'minimum-value', title: 'BUILD 4,000+', detail: 'Speed alone is not enough; back a valuable route.', successHint: 'A successful Press earns an extra +1,000.' };
  }
  if (chapter === 3) {
    return { id: 'avoid-dealin', title: 'AVOID DEAL-IN', detail: 'Survive the riichi table without losing 8,000.', successHint: 'Steady defense earns +1,000; mistakes cost extra.' };
  }
  return { id: 'overtake', title: 'ALL LAST · OVERTAKE', detail: `Finish above ${formatPoints(opponentPoints)}.`, successHint: 'Press is rewarded, but a deal-in may end the run.' };
}

export function advanceOpponentTurn(
  current: OpponentTableState,
  playerRisk: number,
  random: () => number = Math.random,
): OpponentTurnResult {
  const state: OpponentTableState = { ...current, actionLog: [...current.actionLog], turn: current.turn + 1 };
  let riskDelta = 0;
  let log: string;

  const defensiveThreshold = state.id === 'calm' ? 62 : state.id === 'hunter' ? 76 : 88;
  if (playerRisk >= defensiveThreshold && state.mode !== 'riichi') {
    state.mode = 'defending';
    riskDelta = -8;
    log = `Turn ${state.turn}: folds behind a safe tile`;
  } else if (state.mode === 'defending' && playerRisk < 45) {
    state.mode = 'building';
    log = `Turn ${state.turn}: returns to hand development`;
  } else {
    if (state.mode !== 'riichi' && state.shanten > 0 && random() < SPEED[state.id]) {
      state.shanten -= 1;
    }

    const callChance = state.id === 'speed' ? 0.34 : state.id === 'hunter' ? 0.18 : 0.06;
    if (state.mode === 'building' && state.shanten > 0 && random() < callChance) {
      state.mode = 'open';
      state.shanten = Math.max(0, state.shanten - 1);
      riskDelta = state.id === 'hunter' ? 12 : 8;
      log = `Turn ${state.turn}: calls PON · ${state.shanten}-shanten`;
    } else if (state.shanten === 0 && state.mode === 'building') {
      state.mode = 'riichi';
      state.points = Math.max(0, state.points - 1000);
      riskDelta = state.id === 'riichi' ? 22 : 16;
      log = `Turn ${state.turn}: declares RIICHI · 1,000 stick paid`;
    } else if (state.shanten === 0) {
      riskDelta = state.mode === 'riichi' ? 9 : 6;
      log = `Turn ${state.turn}: remains in tenpai`;
    } else {
      riskDelta = state.id === 'speed' ? 5 : 3;
      log = `Turn ${state.turn}: advances to ${state.shanten}-shanten`;
    }
  }

  state.actionLog = [...state.actionLog, log].slice(-3);
  return { state, riskDelta, log };
}

export function objectiveRiskModifier(objective: RoundObjective, pressed: boolean): number {
  if (objective.id === 'avoid-dealin') return pressed ? 12 : -6;
  if (objective.id === 'protect-lead') return pressed ? 8 : -4;
  if (objective.id === 'overtake' || objective.id === 'minimum-value') return pressed ? -4 : 2;
  return 0;
}

export function objectivePointDelta(
  objective: RoundObjective,
  correct: boolean,
  pressed: boolean,
  isLiveTurn: boolean,
): number {
  if (!correct) {
    if (objective.id === 'avoid-dealin' || objective.id === 'protect-lead') return -1500;
    return -500;
  }
  if (objective.id === 'tenpai' && isLiveTurn) return 1000;
  if ((objective.id === 'protect-lead' || objective.id === 'avoid-dealin') && !pressed) return 1000;
  if ((objective.id === 'overtake' || objective.id === 'minimum-value') && pressed) return 1000;
  return 0;
}

export function opponentStatusLabel(state: OpponentTableState): string {
  if (state.mode === 'riichi') return 'RIICHI';
  if (state.mode === 'defending') return 'FOLDING';
  if (state.shanten === 0) return state.mode === 'open' ? 'OPEN TENPAI' : 'TENPAI';
  return `${state.shanten}-SHANTEN${state.mode === 'open' ? ' · OPEN' : ''}`;
}

/**
 * Compact riichi danger read for a discard candidate. This deliberately uses
 * visible, teachable signals only: genbutsu, basic suji, tile position and
 * honor exhaustion. It is not presented as a perfect deal-in probability.
 */
export function evaluateTileDanger(
  key: string,
  opponentRiver: string[],
  state: OpponentTableState,
): TileDanger {
  if (opponentRiver.includes(key)) {
    return { value: 0, label: 'GENBUTSU', reason: 'Already discarded by this opponent; safe against ron.' };
  }

  const [suit, rankText] = key.split('-');
  const rank = Number(rankText);
  const threatBonus = state.mode === 'riichi' ? 14 : state.shanten === 0 ? 10 : state.mode === 'open' ? 7 : 0;

  if (suit === 'wind' || suit === 'dragon') {
    const visible = opponentRiver.filter(tile => tile === key).length;
    if (visible >= 3) return { value: 4, label: 'LOW', reason: 'Three copies are visible.' };
    if (visible >= 2) return { value: 18, label: 'LOW', reason: 'Two copies are visible.' };
    return { value: Math.min(95, 46 + threatBonus), label: 'DANGER', reason: 'Unseen honor can still complete a pair or triplet.' };
  }

  if (!['man', 'pin', 'sou'].includes(suit) || !Number.isFinite(rank)) {
    return { value: 60 + threatBonus, label: 'DANGER', reason: 'No reliable safety signal.' };
  }

  const isSuji = opponentRiver.some(riverKey => {
    const [riverSuit, riverRankText] = riverKey.split('-');
    return riverSuit === suit && Math.abs(Number(riverRankText) - rank) === 3;
  });
  if (isSuji) {
    return { value: 24 + Math.floor(threatBonus / 3), label: 'SUJI', reason: 'Basic suji reduces ryanmen danger, but is not guaranteed safe.' };
  }

  const base = rank === 1 || rank === 9 ? 36 : rank === 2 || rank === 8 ? 48 : 62;
  const value = Math.min(95, base + threatBonus);
  return value <= 42
    ? { value, label: 'LOW', reason: 'Outer tile with lower shape coverage.' }
    : { value, label: 'DANGER', reason: 'No visible genbutsu or suji protection.' };
}

export function strategicDiscardScore(
  liveTiles: number,
  danger: TileDanger,
  objective: RoundObjective,
  state: OpponentTableState,
): number {
  const defenseWeight = objective.id === 'avoid-dealin' || state.mode === 'riichi'
    ? 1.35
    : objective.id === 'protect-lead'
      ? 1.2
      : 1;
  return liveTiles * 5 - danger.value * defenseWeight;
}

export function strategicRiskDelta(dangerValue: number): number {
  return Math.round((dangerValue - 45) / 3);
}

function formatPoints(points: number): string {
  return `${Math.max(0, Math.round(points)).toLocaleString('en-US')} pts`;
}
