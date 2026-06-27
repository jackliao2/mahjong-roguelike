import { Tile, Meld, WinningHand } from '@/types';
import { isSameTile, isHonorTile, isTerminal } from './tiles';

// Terminal and honor tile types required for Kokushi (13 Orphans)
const KOKUSHI_TYPES = [
  'man-1', 'man-9', 'pin-1', 'pin-9', 'sou-1', 'sou-9',
  'wind-1', 'wind-2', 'wind-3', 'wind-4',
  'dragon-1', 'dragon-2', 'dragon-3',
];

/**
 * Detects if 14 tiles form a winning mahjong hand.
 * Supports: 4 sets + 1 pair, 7 pairs (Chiitoitsu), 13 Orphans (Kokushi).
 */
export function detectWin(tiles: Tile[]): WinningHand | null {
  if (tiles.length !== 14) return null;

  // Check Kokushi (13 Orphans) first — it's a special form
  if (isKokushi(tiles)) {
    return { melds: [], pairs: extractAllPairs(tiles) };
  }

  // Try each possible pair (4 sets + 1 pair)
  const pairCandidates = findPairCandidates(tiles);
  for (const pair of pairCandidates) {
    const remaining = tiles.filter(t => t.id !== pair[0].id && t.id !== pair[1].id);
    const melds = tryDecomposeSets(remaining);
    if (melds) {
      return {
        melds: [...melds, { type: 'pair', tiles: pair }],
        pairs: [{ type: 'pair', tiles: pair }],
      };
    }
  }

  // Check for seven pairs (Chiitoitsu)
  if (isSevenPairs(tiles)) {
    return { melds: [], pairs: extractAllPairs(tiles) };
  }

  return null;
}

/**
 * Check if 14 tiles form Kokushi Musou (13 Orphans):
 * one of each terminal/honor type (13 unique) + 1 duplicate of any.
 */
function isKokushi(tiles: Tile[]): boolean {
  if (tiles.length !== 14) return false;
  const counts = new Map<string, number>();
  for (const t of tiles) {
    const key = `${t.suit}-${t.rank}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  // Must have all 13 required terminal/honor types
  for (const req of KOKUSHI_TYPES) {
    if (!counts.has(req)) return false;
  }
  // Must have exactly one duplicate (14 = 13 unique + 1 extra)
  let extraCount = 0;
  for (const [, count] of counts) {
    if (count > 1) extraCount += count - 1;
  }
  return extraCount === 1;
}

/**
 * Check if 13 tiles are in Kokushi tenpai (12 unique terminals/honors + 1 pair).
 */
function isKokushiTenpai(tiles: Tile[]): string[] {
  if (tiles.length !== 13) return [];
  const counts = new Map<string, number>();
  for (const t of tiles) {
    const key = `${t.suit}-${t.rank}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  // Count how many of the 13 required types are present
  const present = KOKUSHI_TYPES.filter(k => counts.has(k));
  if (present.length === 13) {
    // All 13 present, one must be a pair — waiting for the 13th unique + duplicate
    // This means we have 12 unique + 1 pair = 13 tiles
    // Waiting for any of the 13 types (completing to 14)
    return KOKUSHI_TYPES;
  }
  if (present.length === 12) {
    // Missing exactly one type, and all others are singles (no pairs)
    const missing = KOKUSHI_TYPES.filter(k => !counts.has(k));
    if (missing.length === 1) {
      // Check no duplicates among present tiles
      const hasDup = Array.from(counts.values()).some(c => c > 1);
      if (!hasDup) return [missing[0]];
    }
  }
  return [];
}

// Check if 14 tiles form 7 pairs (Chiitoitsu)
export function isSevenPairs(tiles: Tile[]): boolean {
  if (tiles.length !== 14) return false;
  const counts = new Map<string, number>();
  for (const t of tiles) {
    const key = `${t.suit}-${t.rank}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size !== 7) return false;
  for (const count of counts.values()) {
    if (count !== 2) return false;
  }
  return true;
}

function extractAllPairs(tiles: Tile[]): Meld[] {
  const pairs: Meld[] = [];
  const used = new Set<string>();
  for (let i = 0; i < tiles.length; i++) {
    if (used.has(tiles[i].id)) continue;
    for (let j = i + 1; j < tiles.length; j++) {
      if (used.has(tiles[j].id)) continue;
      if (isSameTile(tiles[i], tiles[j])) {
        pairs.push({ type: 'pair', tiles: [tiles[i], tiles[j]] });
        used.add(tiles[i].id);
        used.add(tiles[j].id);
        break;
      }
    }
  }
  return pairs;
}

// Find one pair candidate per unique tile type (avoids redundant work for 4-of-a-kind)
function findPairCandidates(tiles: Tile[]): [Tile, Tile][] {
  const candidates: [Tile, Tile][] = [];
  const seenTypes = new Set<string>();
  for (let i = 0; i < tiles.length; i++) {
    const typeKey = `${tiles[i].suit}-${tiles[i].rank}`;
    if (seenTypes.has(typeKey)) continue;
    for (let j = i + 1; j < tiles.length; j++) {
      if (isSameTile(tiles[i], tiles[j])) {
        candidates.push([tiles[i], tiles[j]]);
        seenTypes.add(typeKey);
        break;
      }
    }
  }
  return candidates;
}

/**
 * Try to decompose 12 tiles into 4 sets (sequences or triplets).
 * Returns the melds if successful, null otherwise.
 */
function tryDecomposeSets(tiles: Tile[]): Meld[] | null {
  if (tiles.length === 0) return [];
  if (tiles.length % 3 !== 0) return null;

  // Group tiles by suit
  const bySuit = groupBySuit(tiles);

  // Process each suit group independently
  const allMelds: Meld[] = [];
  for (const [suit, suitTiles] of bySuit) {
    const melds = decomposeSuit(suit, suitTiles);
    if (melds === null) return null;
    allMelds.push(...melds);
  }

  return allMelds;
}

function groupBySuit(tiles: Tile[]): Map<string, Tile[]> {
  const groups = new Map<string, Tile[]>();
  for (const tile of tiles) {
    const key = tile.suit;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tile);
  }
  return groups;
}

/**
 * Decompose tiles of a single suit into sets.
 * Uses a count-based approach: represent tiles as counts per rank.
 */
function decomposeSuit(suit: string, tiles: Tile[]): Meld[] | null {
  if (tiles.length === 0) return [];

  if (isHonorTile(tiles[0])) {
    // Honor tiles: only triplets possible
    return decomposeHonors(tiles);
  }

  // Suited tiles: triplets and sequences
  const counts = new Array(10).fill(0); // index 1-9
  const tilesByRank: Tile[][] = Array.from({ length: 10 }, () => []);
  for (const tile of tiles) {
    counts[tile.rank]++;
    tilesByRank[tile.rank].push(tile);
  }

  const result = decomposeSuitedRecursive(counts, tilesByRank, 1);
  return result;
}

function decomposeHonors(tiles: Tile[]): Meld[] | null {
  const melds: Meld[] = [];
  const groups = new Map<string, Tile[]>();
  for (const t of tiles) {
    const key = `${t.suit}-${t.rank}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  for (const group of groups.values()) {
    if (group.length !== 3) return null;
    melds.push({ type: 'triplet', tiles: group });
  }
  return melds;
}

function decomposeSuitedRecursive(
  counts: number[],
  tilesByRank: Tile[][],
  startRank: number
): Meld[] | null {
  // Find the first rank with tiles
  let rank = startRank;
  while (rank <= 9 && counts[rank] === 0) rank++;
  if (rank > 9) return []; // all tiles used

  // Try triplet
  if (counts[rank] >= 3) {
    counts[rank] -= 3;
    const tripletTiles = tilesByRank[rank].splice(0, 3);
    const rest = decomposeSuitedRecursive(counts, tilesByRank, rank);
    if (rest !== null) {
      return [{ type: 'triplet', tiles: tripletTiles }, ...rest];
    }
    // Restore
    counts[rank] += 3;
    tilesByRank[rank].unshift(...tripletTiles);
  }

  // Try sequence (rank, rank+1, rank+2)
  if (rank <= 7 && counts[rank] >= 1 && counts[rank + 1] >= 1 && counts[rank + 2] >= 1) {
    counts[rank]--;
    counts[rank + 1]--;
    counts[rank + 2]--;
    const seqTiles = [tilesByRank[rank].shift()!, tilesByRank[rank + 1].shift()!, tilesByRank[rank + 2].shift()!];
    const rest = decomposeSuitedRecursive(counts, tilesByRank, rank);
    if (rest !== null) {
      return [{ type: 'sequence', tiles: seqTiles }, ...rest];
    }
    // Restore
    counts[rank]++;
    counts[rank + 1]++;
    counts[rank + 2]++;
    tilesByRank[rank].unshift(seqTiles[0]);
    tilesByRank[rank + 1].unshift(seqTiles[1]);
    tilesByRank[rank + 2].unshift(seqTiles[2]);
  }

  return null; // can't decompose
}

/**
 * Check if adding a specific tile would complete a winning hand.
 * Useful for checking if the player is in tenpai (ready).
 */
export function isWinningTile(currentTiles: Tile[], drawTile: Tile): boolean {
  const allTiles = [...currentTiles, drawTile];
  return detectWin(allTiles) !== null;
}

/**
 * Find all tiles that would complete the hand (tenpai detection).
 * Checks standard wins, Chiitoitsu, and Kokushi (13 Orphans) waits.
 */
export function findWaitingTiles(currentTiles: Tile[]): string[] {
  if (currentTiles.length !== 13) return [];
  const waiting = new Set<string>();

  // Check Kokushi tenpai
  const kokushiWaits = isKokushiTenpai(currentTiles);
  for (const w of kokushiWaits) waiting.add(w);

  // Check standard + Chiitoitsu waits
  const allSuits = ['man', 'pin', 'sou', 'wind', 'dragon'] as const;
  const maxRanks: Record<string, number> = { man: 9, pin: 9, sou: 9, wind: 4, dragon: 3 };
  let testCounter = 0;
  for (const suit of allSuits) {
    for (let rank = 1; rank <= maxRanks[suit]; rank++) {
      const testTile: Tile = { suit, rank, id: `wait-test-${testCounter++}` };
      if (isWinningTile(currentTiles, testTile)) {
        waiting.add(`${suit}-${rank}`);
      }
    }
  }
  return Array.from(waiting);
}
