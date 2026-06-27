import { Tile, WinningHand, RunState, ScoreResult, ScoreBreakdown, Relic, RelicContext, CustomTile } from '@/types';
import { checkAllYaku } from './yaku';
import { evaluateRelics } from '@/roguelike/relics';

const BASE_FU = 30; // basic fu value
const MANGAN_HAN = 5; // mangan threshold
const MANGAN_POINTS = 2000; // mangan base points

/**
 * Calculate the score for a winning hand.
 * Requires at least 1 yaku — a structurally valid hand with 0 yaku is not a valid win.
 *
 * Scoring pipeline:
 *   1. Match yaku (filtered by unlocked + boosted by yakuBonuses)
 *   2. Add dora han (red five tiles)
 *   3. Add ippatsu han (riichi + first-turn win)
 *   4. Add ura-dora han (riichi + dora indicators match)
 *   5. Convert total han + fu -> basePoints (capped at mangan ladder)
 *   6. Apply relic multipliers/flats (conditional relics evaluated per RelicContext)
 *   7. Apply custom tile bonuses (chips + multiplier)
 *   8. Floor to integer
 */
export function calculateScore(
  winningHand: WinningHand,
  rawTiles: Tile[],
  isRiichi: boolean,
  relics: Relic[] = [],
  unlockedYaku?: string[],
  yakuBonuses?: Record<string, number>,
  customTiles: CustomTile[] = [],
  isIppatsu: boolean = false,
  doraIndicators: Tile[] = []
): ScoreResult {
  const matchedYaku = checkAllYaku(winningHand, rawTiles, isRiichi, unlockedYaku, yakuBonuses);

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
      relicMultiplier: 0, relicFlat: 0,
      customTileFlat: 0, customTileMultiplier: 0,
      finalScore: 0,
    };
    const result = applyAllBonuses(8000, relics, customTiles, rawTiles, winningHand, matchedYaku, isRiichi, breakdown);
    return {
      basePoints: 8000,
      yakuList: matchedYaku,
      totalHan: 13,
      finalScore: result.finalScore,
      relicMultipliers: result.relicMultiplier,
      relicBonuses: result.relicFlat,
      customTileBonus: result.customTileFlat,
      doraCount,
      isIppatsu: ippatsuHan > 0,
      breakdown: result.breakdown,
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

  const breakdown: ScoreBreakdown = {
    baseHan, doraHan, ippatsuHan, uraDoraHan,
    basePoints,
    relicMultiplier: 0, relicFlat: 0,
    customTileFlat: 0, customTileMultiplier: 0,
    finalScore: 0,
  };

  const result = applyAllBonuses(basePoints, relics, customTiles, rawTiles, winningHand, matchedYaku, isRiichi, breakdown);

  return {
    basePoints,
    yakuList: matchedYaku,
    totalHan,
    finalScore: result.finalScore,
    relicMultipliers: result.relicMultiplier,
    relicBonuses: result.relicFlat,
    customTileBonus: result.customTileFlat,
    doraCount,
    isIppatsu: ippatsuHan > 0,
    breakdown: result.breakdown,
  };
}

function emptyScore(): ScoreResult {
  return {
    basePoints: 0,
    yakuList: [],
    totalHan: 0,
    finalScore: 0,
    relicMultipliers: 0,
    relicBonuses: 0,
    customTileBonus: 0,
    doraCount: 0,
    isIppatsu: false,
    breakdown: {
      baseHan: 0, doraHan: 0, ippatsuHan: 0, uraDoraHan: 0,
      basePoints: 0, relicMultiplier: 0, relicFlat: 0,
      customTileFlat: 0, customTileMultiplier: 0, finalScore: 0,
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
 * Red five tiles are marked via CustomTile.isRed and matched by baseTile (suit=man/pin/sou, rank=5).
 * Dora indicators: the "next" tile in the same suit is the dora tile.
 */
function countDora(rawTiles: Tile[], doraIndicators: Tile[]): number {
  let count = 0;
  // Red five dora: any tile that is a 5 in man/pin/sou counts if the player has red five custom tiles
  // (The custom tile system injects red fives into the wall; we detect them by checking tile.id prefix.)
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

interface AppliedBonuses {
  finalScore: number;
  relicMultiplier: number;
  relicFlat: number;
  customTileFlat: number;
  customTileMultiplier: number;
  breakdown: ScoreBreakdown;
}

/**
 * Apply relic and custom tile bonuses to base points.
 * Relics are evaluated conditionally: if a relic has a `condition`, it only applies when the condition is true.
 */
function applyAllBonuses(
  basePoints: number,
  relics: Relic[],
  customTiles: CustomTile[],
  rawTiles: Tile[],
  winningHand: WinningHand,
  yakuList: { yaku: import('@/types').Yaku; han: number }[],
  isRiichi: boolean,
  breakdown: ScoreBreakdown
): AppliedBonuses {
  const ctx: RelicContext = { rawTiles, winningHand, yakuList, isRiichi };

  // Evaluate relics (includes special-case Nine Tails dynamic bonus)
  const relicResult = evaluateRelics(relics, ctx);
  const relicMultiplier = relicResult.multiplier;
  const relicFlat = relicResult.flat;

  // Evaluate custom tiles: each custom tile present in rawTiles contributes its bonusChips and multiplier
  let customTileFlat = 0;
  let customTileMultiplier = 0;
  for (const custom of customTiles) {
    const present = rawTiles.some(t => t.id === custom.id || t.id.startsWith(custom.id));
    if (present) {
      customTileFlat += custom.bonusChips;
      customTileMultiplier += custom.multiplier;
    }
  }

  const totalMultiplier = 1 + relicMultiplier + customTileMultiplier;
  const finalScore = Math.floor(basePoints * totalMultiplier + relicFlat + customTileFlat);

  breakdown.relicMultiplier = relicMultiplier;
  breakdown.relicFlat = relicFlat;
  breakdown.customTileFlat = customTileFlat;
  breakdown.customTileMultiplier = customTileMultiplier;
  breakdown.finalScore = finalScore;

  return {
    finalScore,
    relicMultiplier,
    relicFlat,
    customTileFlat,
    customTileMultiplier,
    breakdown,
  };
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
    riichiTurns: 0,
    doraIndicators: [],
    rerollTokens: 0,
  };
}
