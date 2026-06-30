/**
 * Yaku Proximity Guide — Shows how close the player is to each yaku.
 * Used by GameScene to display "You're X tiles away from Tanyao" hints.
 */
import { Tile } from '@/types';
import { isSimple, isTerminal, isHonorTile } from './tiles';
import { findWaitingTiles } from './winDetector';

export interface YakuProximity {
  yakuId: string;
  yakuName: string;
  han: number;
  /** 0-100: how close the player is (100 = ready to win with this yaku) */
  score: number;
  /** Human-readable hint */
  hint: string;
}

/**
 * Calculate proximity for the 4 easy yaku (and any additional unlocked ones).
 * Returns yaku sorted by proximity score (closest first).
 */
export function getYakuProximity(handTiles: Tile[], unlockedYakuIds: string[]): YakuProximity[] {
  const results: YakuProximity[] = [];
  const waiting = findWaitingTiles(handTiles);

  // Tanyao: count terminal+honor tiles — fewer = closer
  if (unlockedYakuIds.includes('tanyao')) {
    const foul = handTiles.filter(t => !isSimple(t));
    const score = Math.max(0, Math.min(100, Math.round((1 - foul.length / 14) * 100)));
    const hint = foul.length === 0
      ? 'All tiles are simples! Ready for Tanyao.'
      : `${foul.length} terminal/honor tile(s) to replace.`;
    results.push({ yakuId: 'tanyao', yakuName: 'Tanyao', han: 1, score, hint });
  }

  // Pinfu: check if all tiles are in sequences (heuristic: count tiles in runs)
  if (unlockedYakuIds.includes('pinfu')) {
    const { score, hint } = pinfuProximity(handTiles);
    results.push({ yakuId: 'pinfu', yakuName: 'Pinfu', han: 1, score, hint });
  }

  // Riichi: check tenpai status
  if (unlockedYakuIds.includes('riichi')) {
    const score = waiting.length > 0 ? 100 : 0;
    const hint = waiting.length > 0
      ? `Ready to declare Riichi! Waiting for ${waiting.length} tile type(s).`
      : 'Not in tenpai yet. Keep building.';
    results.push({ yakuId: 'riichi', yakuName: 'Riichi', han: 1, score, hint });
  }

  // Yakuhai: check dragon tile counts
  if (unlockedYakuIds.includes('yakuhai')) {
    const dragonCounts = new Map<string, number>();
    for (const t of handTiles) {
      if (t.suit === 'dragon') {
        const key = `${t.suit}-${t.rank}`;
        dragonCounts.set(key, (dragonCounts.get(key) || 0) + 1);
      }
    }
    let maxDragons = 0;
    for (const [, count] of dragonCounts) {
      if (count > maxDragons) maxDragons = count;
    }
    const score = Math.min(100, Math.round((maxDragons / 3) * 100));
    const hint = maxDragons >= 3
      ? 'Dragon triplet complete! Yakuhai ready.'
      : maxDragons === 2
        ? 'One dragon away from a triplet.'
        : maxDragons === 1
          ? 'Have a dragon. Need 2 more for a triplet.'
          : 'No dragon tiles in hand.';
    results.push({ yakuId: 'yakuhai', yakuName: 'Yakuhai', han: 1, score, hint });
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Heuristic: how many tiles are part of a sequence vs. isolated.
 * Higher score = more tiles in sequences = closer to Pinfu.
 */
function pinfuProximity(tiles: Tile[]): { score: number; hint: string } {
  const sorted = [...tiles].sort((a, b) => {
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    return a.rank - b.rank;
  });

  const suitGroups = new Map<string, Tile[]>();
  for (const t of sorted) {
    if (!suitGroups.has(t.suit)) suitGroups.set(t.suit, []);
    suitGroups.get(t.suit)!.push(t);
  }

  let inSequence = 0;
  for (const [, group] of suitGroups) {
    if (group.length < 3) continue;
    for (let i = 0; i < group.length - 2; i++) {
      if (group[i].rank + 1 === group[i + 1].rank && group[i + 1].rank + 1 === group[i + 2].rank) {
        inSequence += 3;
        i += 2; // skip the found sequence
      }
    }
  }

  const score = Math.min(100, Math.round((inSequence / 14) * 100));
  const hint = inSequence >= 9
    ? 'Most tiles in sequences! Close to Pinfu.'
    : inSequence >= 6
      ? 'Some tiles in sequences. Build more runs.'
      : 'Few sequences. Try to form runs (1-2-3, 4-5-6, etc).';
  return { score, hint };
}

/**
 * Analyze each tile in hand and determine if it contributes to any yaku.
 * Returns a map of tileId → { keep: boolean, reason: string }
 * Used by the discard hint system to color-code tiles.
 *
 * Keep threshold is deliberately conservative: a tile is marked "keep" only
 * when it clearly helps a yaku. Everything else is a valid discard candidate
 * (shown with a red border). The recommendation glow picks the *worst* keeper
 * or the best discard among those candidates.
 */
export function getDiscardHints(
  handTiles: Tile[],
  unlockedYakuIds: string[],
): Map<string, { keep: boolean; reason: string }> {
  const hints = new Map<string, { keep: boolean; reason: string }>();

  for (const tile of handTiles) {
    let keep = false;
    let reason = 'Loose tile — safe to discard.';

    const sameTypeCount = handTiles.filter(t => t.suit === tile.suit && t.rank === tile.rank).length;
    const sameSuit = handTiles.filter(t => t.suit === tile.suit && t.id !== tile.id);
    const hasRank = (r: number) => sameSuit.some(t => t.rank === r);
    const hasShape = sameTypeCount >= 2
      || (tile.suit !== 'wind' && tile.suit !== 'dragon' && (
        hasRank(tile.rank - 1) || hasRank(tile.rank + 1)
        || hasRank(tile.rank - 2) || hasRank(tile.rank + 2)
      ));

    // Yakuhai: a dragon pair/triplet is valuable
    if (unlockedYakuIds.includes('yakuhai') && tile.suit === 'dragon') {
      if (sameTypeCount >= 2) {
        keep = true;
        reason = sameTypeCount >= 3
          ? 'Dragon triplet — Yakuhai ready!'
          : 'Dragon pair — one more for Yakuhai.';
        hints.set(tile.id, { keep, reason });
        continue;
      }
      // A lone dragon is still a discard unless Tanyao wants it gone
      reason = 'Lone dragon — hard to complete Yakuhai.';
    }

    // Tanyao: simple tiles (2-8) are keepers if they also help form a shape;
    // isolated simples are not automatically precious.
    if (unlockedYakuIds.includes('tanyao')) {
      if (isTerminal(tile) || isHonorTile(tile)) {
        keep = false;
        reason = 'Terminal or honor — breaks Tanyao.';
      } else if (isSimple(tile)) {
        if (!hasShape) {
          keep = false;
          reason = 'Simple but isolated — Tanyao wants simples, but this needs neighbors.';
        } else {
          keep = true;
          reason = 'Simple tile — good for Tanyao.';
        }
      }
    }

    // Pinfu: keep tiles that are already in a run or a strong partial run
    if (unlockedYakuIds.includes('pinfu') && tile.suit !== 'wind' && tile.suit !== 'dragon') {
      const inSequence = hasRank(tile.rank - 1) && hasRank(tile.rank + 1);
      const inPartial = hasRank(tile.rank - 1) || hasRank(tile.rank + 1);
      if (inSequence) {
        keep = true;
        reason = 'Inside a run — great for Pinfu.';
      } else if (inPartial) {
        keep = true;
        reason = 'Next to another tile — could become a run.';
      }
    }

    // A lone pair (especially a simple pair) is worth keeping for the required pair slot
    if (sameTypeCount === 2 && (tile.suit === 'wind' || tile.suit === 'dragon' || isTerminal(tile))) {
      keep = true;
      reason = 'Useful pair — every winning hand needs one.';
    }

    hints.set(tile.id, { keep, reason });
  }
  return hints;
}