import { Tile, WinningHand, RunState, ScoreResult, ScoreBreakdown } from '@/types';
import { checkAllYaku } from './yaku';
import { GameConfig } from '@/config/game-config';

const { baseFu, manganHan, manganPoints: manganBasePoints } = GameConfig.scoring;

/**
 * Calculate the score for a winning hand.
 * Requires at least 1 yaku — a structurally valid hand with 0 yaku is not a valid win.
 *
 * Scoring pipeline:
 *   1. Match yaku (filtered by unlocked)
 *   2. Add dora han (red five tiles)
 *   3. Add ippatsu han (riichi + first-turn win)
 *   4. Add ura-dora han (riichi + dora indicators match)
 *   5. Convert total han + fu -> basePoints (capped at mangan ladder)
 *   6. Floor to integer
 */
export function calculateScore(
  winningHand: WinningHand,
  rawTiles: Tile[],
  isRiichi: boolean,
  unlockedYaku?: string[],
  isIppatsu: boolean = false,
  doraIndicators: Tile[] = []
): ScoreResult {
  const matchedYaku = checkAllYaku(winningHand, rawTiles, isRiichi, unlockedYaku);

  const baseHan = matchedYaku.reduce((sum, { han }) => sum + han, 0);

  // No yaku = invalid win (return 0 score, caller should reject)
  if (baseHan === 0) {
    return emptyScore();
  }

  // Dora: each red five tile in hand adds 1 han
  const doraCount = countDora(rawTiles, doraIndicators);
  const doraHan = doraCount;

  // Ippatsu: +1 han if riichi and won on the first turn after declaration
  const ippatsuHan = isRiichi && isIppatsu ? 1 : 0;

  // Ura-dora: each dora indicator matched in hand adds 1 han (only when riichi)
  const uraDoraHan = isRiichi ? countUraDora(rawTiles, doraIndicators) : 0;

  const totalHan = baseHan + doraHan + ippatsuHan + uraDoraHan;

  // Handle yakuman (13+ han = instant win, capped)
  if (totalHan >= 13) {
    const breakdown: ScoreBreakdown = {
      baseHan, doraHan, ippatsuHan, uraDoraHan,
      basePoints: 8000,
      finalScore: 8000,
    };
    return {
      basePoints: 8000,
      yakuList: matchedYaku,
      totalHan: 13,
      finalScore: 8000,
      doraCount,
      isIppatsu: ippatsuHan > 0,
      breakdown,
    };
  }

  // Calculate base points from han × fu
  let basePoints: number;
  if (totalHan >= manganHan) {
    basePoints = manganPoints(totalHan);
  } else {
    // Normal calculation: fu × 2^(han+2)
    basePoints = Math.min(baseFu * Math.pow(2, totalHan + 2), manganBasePoints);
  }

  const breakdown: ScoreBreakdown = {
    baseHan, doraHan, ippatsuHan, uraDoraHan,
    basePoints,
    finalScore: basePoints,
  };

  return {
    basePoints,
    yakuList: matchedYaku,
    totalHan,
    finalScore: basePoints,
    doraCount,
    isIppatsu: ippatsuHan > 0,
    breakdown,
  };
}

function emptyScore(): ScoreResult {
  return {
    basePoints: 0,
    yakuList: [],
    totalHan: 0,
    finalScore: 0,
    doraCount: 0,
    isIppatsu: false,
    breakdown: {
      baseHan: 0, doraHan: 0, ippatsuHan: 0, uraDoraHan: 0,
      basePoints: 0, finalScore: 0,
    },
  };
}

function manganPoints(han: number): number {
  if (han >= 13) return 8000; // Yakuman
  if (han >= 11) return 6000; // Sanbaiman
  if (han >= 8) return 4000;  // Baiman
  if (han >= 6) return 3000;  // Haneman
  return 2000; // Mangan (5 han)
}

/**
 * Count dora: red five tiles (each red five = 1 han) + matched dora indicators.
 * Red five tiles are marked via tile.id prefix 'red-five-'.
 * Dora indicators: the "next" tile in the same suit is the dora tile.
 */
function countDora(rawTiles: Tile[], doraIndicators: Tile[]): number {
  let count = 0;
  // Red five dora: any tile whose id marks it as a red five
  for (const tile of rawTiles) {
    if (tile.id.startsWith('red-five-')) {
      count += 1;
    }
  }
  // Dora indicators from wall (only relevant if wall exposes them; currently 0 unless kan is implemented)
  for (const indicator of doraIndicators) {
    const doraTile = nextDoraTile(indicator);
    if (!doraTile) continue;
    for (const tile of rawTiles) {
      if (tile.suit === doraTile.suit && tile.rank === doraTile.rank) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * Count ura-dora: same as dora but only counted when riichi is declared.
 * Uses the same dora indicators (in real mahjong, ura-dora uses the hidden side of indicators).
 */
function countUraDora(rawTiles: Tile[], doraIndicators: Tile[]): number {
  if (doraIndicators.length === 0) return 0;
  return countDora(rawTiles, doraIndicators);
}

/**
 * Given a dora indicator tile, return the tile it indicates (the "next" tile).
 * For suited tiles: 1->2, 2->3, ..., 8->9, 9->1 (wraps).
 * For winds: E->S->W->N->E (cycle).
 * For dragons: Red->White->Green->Red (cycle).
 */
function nextDoraTile(indicator: Tile): Tile | null {
  const { suit, rank } = indicator;
  if (suit === 'man' || suit === 'pin' || suit === 'sou') {
    const nextRank = rank === 9 ? 1 : rank + 1;
    return { suit, rank: nextRank, id: `dora-${suit}-${nextRank}` };
  }
  if (suit === 'wind') {
    const nextRank = rank === 4 ? 1 : rank + 1;
    return { suit, rank: nextRank, id: `dora-wind-${nextRank}` };
  }
  if (suit === 'dragon') {
    const nextRank = rank === 3 ? 1 : rank + 1;
    return { suit, rank: nextRank, id: `dora-dragon-${nextRank}` };
  }
  return null;
}

/**
 * Calculate the target score for a given round.
 * Target is cumulative — the player's total score must reach this by end of round.
 * Beginner mode applies an additional multiplier so a single basic yaku clears round 1.
 */
export function calculateTargetScore(round: number, maxRounds: number): number {
  const { baseScore, scoreMultiplier, bossRoundMultiplier } = GameConfig.rounds;
  const target = Math.floor(baseScore * Math.pow(scoreMultiplier, round - 1));

  if (round === maxRounds) {
    return Math.floor(target * bossRoundMultiplier);
  }
  return target;
}

/**
 * Initialize a new run state.
 */
export function createRunState(maxRounds: number = GameConfig.rounds.maxRounds): RunState {
  return {
    round: 1,
    score: 0,
    targetScore: calculateTargetScore(1, maxRounds),
    maxRounds,
    unlockedYaku: ['riichi', 'tanyao', 'pinfu', 'yakuhai', 'iipeikou'],
    isRiichi: false,
    riichiTurns: 0,
    doraIndicators: [],
  };
}
