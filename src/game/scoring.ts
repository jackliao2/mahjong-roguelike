import { Tile, WinningHand, RunState, ScoreResult, Relic } from '@/types';
import { checkAllYaku } from './yaku';

const BASE_FU = 30; // basic fu value
const MANGAN_HAN = 5; // mangan threshold
const MANGAN_POINTS = 2000; // mangan base points

/**
 * Calculate the score for a winning hand.
 * Score = basePoints × (1 + relic multipliers) + relic bonuses
 * basePoints = sum of yaku han values × fu, capped at mangan
 */
export function calculateScore(
  winningHand: WinningHand,
  rawTiles: Tile[],
  isRiichi: boolean,
  relics: Relic[] = []
): ScoreResult {
  const matchedYaku = checkAllYaku(winningHand, rawTiles, isRiichi);

  let totalHan = matchedYaku.reduce((sum, { han }) => sum + han, 0);

  // Handle yakuman (13 han = instant win, capped)
  if (totalHan >= 13) {
    return {
      basePoints: 8000,
      yakuList: matchedYaku,
      totalHan: 13,
      finalScore: applyRelics(8000, relics),
      relicMultipliers: relics.reduce((sum, r) => sum + r.multiplier, 0),
      relicBonuses: relics.reduce((sum, r) => sum + r.flatBonus, 0),
    };
  }

  // Calculate base points from han × fu
  let basePoints: number;
  if (totalHan === 0) {
    // No yaku matched - shouldn't happen in a valid win, but handle gracefully
    basePoints = BASE_FU;
  } else if (totalHan >= MANGAN_HAN) {
    // Mangan and above - use fixed values
    basePoints = manganPoints(totalHan);
  } else {
    // Normal calculation: fu × 2^(han+2)
    basePoints = Math.min(BASE_FU * Math.pow(2, totalHan + 2), MANGAN_POINTS);
  }

  const finalScore = applyRelics(basePoints, relics);

  return {
    basePoints,
    yakuList: matchedYaku,
    totalHan,
    finalScore,
    relicMultipliers: relics.reduce((sum, r) => sum + r.multiplier, 0),
    relicBonuses: relics.reduce((sum, r) => sum + r.flatBonus, 0),
  };
}

function manganPoints(han: number): number {
  if (han >= 13) return 8000; // Yakuman
  if (han >= 11) return 6000; // Sanbaiman
  if (han >= 8) return 4000;  // Baiman
  if (han >= 6) return 3000;  // Haneman
  return 2000; // Mangan (5 han)
}

function applyRelics(basePoints: number, relics: Relic[]): number {
  const multiplier = 1 + relics.reduce((sum, r) => sum + r.multiplier, 0);
  const flatBonus = relics.reduce((sum, r) => sum + r.flatBonus, 0);
  return Math.floor(basePoints * multiplier + flatBonus);
}

/**
 * Calculate the target score for a given round.
 * Difficulty scales: round 1 is easy, final round is hard.
 */
export function calculateTargetScore(round: number, maxRounds: number): number {
  // Base target: 1000 points, scaling up each round
  const base = 1000;
  const scalePerRound = 1.5;
  const target = Math.floor(base * Math.pow(scalePerRound, round - 1));

  // Final round (boss) gets an extra debuff multiplier
  if (round === maxRounds) {
    return Math.floor(target * 1.5);
  }
  return target;
}

/**
 * Initialize a new run state.
 */
export function createRunState(maxRounds: number = 5): RunState {
  return {
    round: 1,
    score: 0,
    targetScore: calculateTargetScore(1, maxRounds),
    maxRounds,
    relics: [],
    customTiles: [],
    unlockedYaku: ['riichi', 'tanyao', 'pinfu', 'yakuhai', 'iipeikou'],
    isRiichi: false,
  };
}
