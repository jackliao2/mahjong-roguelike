import { Tile, WinningHand, RunState, ScoreResult, Relic } from '@/types';
import { checkAllYaku } from './yaku';

const BASE_FU = 30; // basic fu value
const MANGAN_HAN = 5; // mangan threshold
const MANGAN_POINTS = 2000; // mangan base points

/**
 * Calculate the score for a winning hand.
 * Requires at least 1 yaku — a structurally valid hand with 0 yaku is not a valid win.
 * Score = basePoints × (1 + relic multipliers) + relic bonuses
 * basePoints = sum of yaku han values × fu, capped at mangan
 */
export function calculateScore(
  winningHand: WinningHand,
  rawTiles: Tile[],
  isRiichi: boolean,
  relics: Relic[] = [],
  unlockedYaku?: string[],
  yakuBonuses?: Record<string, number>
): ScoreResult {
  const matchedYaku = checkAllYaku(winningHand, rawTiles, isRiichi, unlockedYaku, yakuBonuses);

  let totalHan = matchedYaku.reduce((sum, { han }) => sum + han, 0);

  // No yaku = invalid win (return 0 score, caller should reject)
  if (totalHan === 0) {
    return {
      basePoints: 0,
      yakuList: [],
      totalHan: 0,
      finalScore: 0,
      relicMultipliers: 0,
      relicBonuses: 0,
    };
  }

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
  if (totalHan >= MANGAN_HAN) {
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
 * Target is cumulative — the player's total score must reach this by end of round.
 * Round 1 target is low enough to be winnable with a single basic yaku (e.g. Tanyao ≈ 480 pts).
 */
export function calculateTargetScore(round: number, maxRounds: number): number {
  // Base target: 500 points (a single 1-han win gives ~480 pts)
  const base = 500;
  const scalePerRound = 1.4;
  const target = Math.floor(base * Math.pow(scalePerRound, round - 1));

  // Final round (boss) gets an extra debuff multiplier
  if (round === maxRounds) {
    return Math.floor(target * 1.3);
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
