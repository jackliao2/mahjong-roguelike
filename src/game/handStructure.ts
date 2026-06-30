/**
 * Hand Structure Analyzer — Teaching tool for beginners.
 * Decomposes a 13-tile hand into meld groups so newcomers can SEE
 * which tiles form sequences, triplets, pairs, and which are isolated.
 *
 * A winning mahjong hand = 4 melds (sequences or triplets) + 1 pair.
 * This module mirrors that structure visually and conceptually.
 */
import { Tile } from '@/types';

export type GroupType = 'sequence' | 'triplet' | 'pair' | 'partial' | 'isolated';

export interface MeldGroup {
  type: GroupType;
  tiles: Tile[];
  label: string;       // e.g., "2-3-4 Man"
  complete: boolean;   // true if sequence/triplet/pair is "done"
}

export interface HandStructure {
  groups: MeldGroup[];
  completeMelds: number;  // count of completed sequences + triplets
  pairs: number;          // count of pairs
  partials: number;       // count of partial sequences (2 of 3)
  isolated: number;       // count of floating tiles
  /** 0 = ready to win (tenpai), higher = farther away */
  shantenApprox: number;
  /** Human-readable summary, e.g. "2 melds, 1 pair, 2 partials — 1 tile from ready" */
  summary: string;
}

const WIND_NAMES = ['East', 'South', 'West', 'North'];
const DRAGON_NAMES = ['Red', 'White', 'Green'];

function tileName(t: Tile): string {
  if (t.suit === 'wind') return WIND_NAMES[t.rank - 1] ?? '?';
  if (t.suit === 'dragon') return DRAGON_NAMES[t.rank - 1] ?? '?';
  const suitName = t.suit === 'man' ? 'Man' : t.suit === 'pin' ? 'Pin' : 'Sou';
  return `${t.rank} ${suitName}`;
}

function suitOf(suit: string): string {
  return suit === 'man' ? 'Man' : suit === 'pin' ? 'Pin' : suit === 'sou' ? 'Sou' : '';
}

/**
 * Analyze a 13-tile hand and decompose it into meld groups for teaching.
 * Greedy decomposition — tries sequences before pairs so that a tile like 2
 * in {2,2,3,4} is shown as part of the run rather than trapped in a pair.
 */
export function analyzeHandStructure(tiles: Tile[]): HandStructure {
  const working = [...tiles].sort((a, b) => {
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    return a.rank - b.rank;
  });

  const groups: MeldGroup[] = [];
  const used = new Set<string>();

  // Pass 1: extract triplets (3 identical)
  const counts = new Map<string, Tile[]>();
  for (const t of working) {
    const key = `${t.suit}-${t.rank}`;
    if (!counts.has(key)) counts.set(key, []);
    counts.get(key)!.push(t);
  }
  for (const [, group] of counts) {
    while (group.length >= 3) {
      const tri = group.splice(0, 3);
      tri.forEach(t => used.add(t.id));
      groups.push({
        type: 'triplet',
        tiles: tri,
        label: `Triplet: ${tileName(tri[0])} x3`,
        complete: true,
      });
    }
  }

  // Pass 2: extract sequences within each suit (skip honors)
  const remainingAfterTriplets = working.filter(t => !used.has(t.id));
  const bySuit = new Map<string, Tile[]>();
  for (const t of remainingAfterTriplets) {
    if (!bySuit.has(t.suit)) bySuit.set(t.suit, []);
    bySuit.get(t.suit)!.push(t);
  }
  for (const [suit, suitTiles] of bySuit) {
    if (suit === 'wind' || suit === 'dragon') continue;
    suitTiles.sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < suitTiles.length - 2; i++) {
      if (used.has(suitTiles[i].id)) continue;
      const a = suitTiles[i];
      const b = suitTiles.find(t => !used.has(t.id) && t.suit === suit && t.rank === a.rank + 1);
      const c = suitTiles.find(t => !used.has(t.id) && t.suit === suit && t.rank === a.rank + 2);
      if (b && c) {
        used.add(a.id); used.add(b.id); used.add(c.id);
        groups.push({
          type: 'sequence',
          tiles: [a, b, c],
          label: `Sequence: ${a.rank}-${b.rank}-${c.rank} ${suitOf(suit)}`,
          complete: true,
        });
      }
    }
  }

  // Pass 3: extract pairs from what is left (keep all visible pairs)
  const remainingAfterSeqs = working.filter(t => !used.has(t.id));
  const pairCounts = new Map<string, Tile[]>();
  for (const t of remainingAfterSeqs) {
    const key = `${t.suit}-${t.rank}`;
    if (!pairCounts.has(key)) pairCounts.set(key, []);
    pairCounts.get(key)!.push(t);
  }
  for (const [, group] of pairCounts) {
    while (group.length >= 2) {
      const p = group.splice(0, 2);
      p.forEach(t => used.add(t.id));
      groups.push({
        type: 'pair',
        tiles: p,
        label: `Pair: ${tileName(p[0])} x2`,
        complete: true,
      });
    }
  }

  // Pass 4: extract partial sequences (2 of 3 consecutive)
  const stillLeft = working.filter(t => !used.has(t.id));
  const bySuit2 = new Map<string, Tile[]>();
  for (const t of stillLeft) {
    if (!bySuit2.has(t.suit)) bySuit2.set(t.suit, []);
    bySuit2.get(t.suit)!.push(t);
  }
  for (const [suit, suitTiles] of bySuit2) {
    if (suit === 'wind' || suit === 'dragon') continue;
    suitTiles.sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < suitTiles.length - 1; i++) {
      if (used.has(suitTiles[i].id)) continue;
      const a = suitTiles[i];
      const b = suitTiles.find(t => !used.has(t.id) && t.suit === suit && t.rank === a.rank + 1);
      if (b) {
        used.add(a.id); used.add(b.id);
        groups.push({
          type: 'partial',
          tiles: [a, b],
          label: `Partial: ${a.rank}-${b.rank} ${suitOf(suit)} (need ${b.rank + 1} or ${a.rank - 1})`,
          complete: false,
        });
      }
    }
  }

  // Pass 5: anything left is isolated
  const floating = working.filter(t => !used.has(t.id));
  for (const t of floating) {
    groups.push({
      type: 'isolated',
      tiles: [t],
      label: `Isolated: ${tileName(t)}`,
      complete: false,
    });
  }

  const completeMelds = groups.filter(g => g.type === 'sequence' || g.type === 'triplet').length;
  const pairs = groups.filter(g => g.type === 'pair').length;
  const partials = groups.filter(g => g.type === 'partial').length;
  const isolated = groups.filter(g => g.type === 'isolated').length;

  // Approximate shanten: how many useful tiles away from tenpai.
  // We need 4 melds + 1 pair. Complete melds and partials (near-sequences)
  // plus any extra pairs count toward progress; isolated tiles do not.
  const extraPairs = Math.max(0, pairs - 1);
  const effectiveBlocks = completeMelds + Math.min(partials + extraPairs, 4 - completeMelds);
  const shantenApprox = Math.max(0, 4 - effectiveBlocks);

  // Build human summary — keep terminology simple for first-time players.
  const parts: string[] = [];
  if (completeMelds > 0) parts.push(`${completeMelds} meld${completeMelds > 1 ? 's' : ''}`);
  if (pairs > 0) parts.push(`${pairs} pair`);
  if (partials > 0) parts.push(`${partials} shape${partials > 1 ? 's' : ''}`);

  // Avoid dumping a huge "N loose tiles" count on beginners; instead give a goal.
  let looseNote = '';
  if (isolated > 0) {
    looseNote = isolated >= 6
      ? 'replace honors/terminals with simple tiles (2-8)'
      : isolated >= 3
        ? 'keep forming runs and a pair'
        : 'almost there — tighten up the shape';
  }

  let readiness: string;
  if (shantenApprox === 0) {
    readiness = 'READY — 1 tile from winning!';
  } else if (shantenApprox === 1) {
    readiness = 'close — 2 tiles from ready';
  } else if (shantenApprox === 2) {
    readiness = 'building — 3 tiles from ready';
  } else {
    readiness = 'early — keep forming melds + 1 pair';
  }

  const structurePart = parts.length === 0 ? 'No shapes yet' : parts.join(', ');
  const summary = looseNote
    ? `${structurePart} — ${readiness} · ${looseNote}`
    : `${structurePart} — ${readiness}`;

  return { groups, completeMelds, pairs, partials, isolated, shantenApprox, summary };
}

/**
 * Approximate shanten for a 13-tile hand.
 * 0 = tenpai (ready), 1 = one tile away from tenpai, etc.
 * Uses the same decomposition logic as analyzeHandStructure.
 */
export function calculateShanten(tiles: Tile[]): number {
  return analyzeHandStructure(tiles).shantenApprox;
}

/**
 * Score how useful a tile is to the hand. Higher = more valuable.
 * Used as a fallback when no tile is explicitly marked as discard.
 */
function tileUsefulness(tile: Tile, handTiles: Tile[]): number {
  const sameType = handTiles.filter(t => t.suit === tile.suit && t.rank === tile.rank);
  const sameSuit = handTiles.filter(t => t.suit === tile.suit && t.id !== tile.id);
  const hasRank = (r: number) => sameSuit.some(t => t.rank === r);

  // Base value: simples are better raw material than terminals/honors
  let score = 30;
  if (tile.suit === 'wind') score = 5;
  else if (tile.suit === 'dragon') score = 15;
  else if (tile.rank === 1 || tile.rank === 9) score = 10;

  // Slight preference for central simples (more ways to form sequences)
  if (tile.suit !== 'wind' && tile.suit !== 'dragon') {
    if (tile.rank >= 4 && tile.rank <= 6) score += 4;
    else if (tile.rank === 3 || tile.rank === 7) score += 2;
  }

  // Complete triplet / pair
  if (sameType.length >= 3) score += 80;
  else if (sameType.length === 2) score += 40;

  // Sequence potential (suit tiles only)
  if (tile.suit !== 'wind' && tile.suit !== 'dragon') {
    if (hasRank(tile.rank - 1) && hasRank(tile.rank + 1)) {
      score += 70; // already a run
    } else if (hasRank(tile.rank - 1) || hasRank(tile.rank + 1)) {
      score += 35; // strong partial
    } else if (hasRank(tile.rank - 2) || hasRank(tile.rank + 2)) {
      score += 12; // weak partial (gap of one)
    }
  }

  return score;
}

/**
 * Recommend a discard tile for beginners.
 * Prioritizes red-border tiles (safe discards), then uses tile efficiency
 * to break ties. Always returns a tile so the yellow glow and banner
 * never go blank.
 */
export function recommendDiscard(tiles: Tile[], hints: Map<string, { keep: boolean; reason: string }>): Tile | null {
  if (tiles.length === 0) return null;

  // Prefer tiles explicitly marked as discard (red border).
  const discards = tiles.filter(t => {
    const h = hints.get(t.id);
    return h && !h.keep;
  });

  const candidates = discards.length > 0 ? discards : tiles;

  // Sort by usefulness ascending; break ties by favoring honors/terminals.
  const sorted = [...candidates].sort((a, b) => {
    const scoreA = tileUsefulness(a, tiles);
    const scoreB = tileUsefulness(b, tiles);
    if (scoreA !== scoreB) return scoreA - scoreB;
    // Tie-break 1: honors/terminals first
    const rankA = a.suit === 'wind' || a.suit === 'dragon' ? 3 : (a.rank === 1 || a.rank === 9 ? 2 : 1);
    const rankB = b.suit === 'wind' || b.suit === 'dragon' ? 3 : (b.rank === 1 || b.rank === 9 ? 2 : 1);
    if (rankA !== rankB) return rankB - rankA;
    // Tie-break 2: keep the drawn tile (last in array) when tied, discard an older tile
    const idxA = tiles.findIndex(t => t.id === a.id);
    const idxB = tiles.findIndex(t => t.id === b.id);
    return idxA - idxB;
  });

  return sorted[0];
}
