import { Tile, Hand, Meld } from '@/types';
import { isSameTile, isHonorTile, tileKey } from './tiles';

export function sortHand(tiles: Tile[]): Tile[] {
  const suitOrder: Record<string, number> = { man: 0, pin: 1, sou: 2, wind: 3, dragon: 4 };
  return [...tiles].sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
    return a.rank - b.rank;
  });
}

export function createHand(tiles: Tile[] = []): Hand {
  return { tiles: sortHand(tiles), drawnTile: null };
}

export function addTileToHand(hand: Hand, tile: Tile): Hand {
  const newTiles = sortHand([...hand.tiles, tile]);
  return { tiles: newTiles, drawnTile: null };
}

export function discardTile(hand: Hand, tileId: string): { hand: Hand; discarded: Tile | null } {
  const tileIndex = hand.tiles.findIndex(t => t.id === tileId);
  if (tileIndex === -1) return { hand, discarded: null };

  const discarded = hand.tiles[tileIndex];
  const remaining = hand.tiles.filter((_, i) => i !== tileIndex);
  return {
    hand: { tiles: sortHand(remaining), drawnTile: null },
    discarded,
  };
}

// Count how many of a specific tile type exist in the hand
export function countTileType(tiles: Tile[], target: Tile): number {
  return tiles.filter(t => isSameTile(t, target)).length;
}

// Get all unique tile types in the hand
export function getUniqueTileTypes(tiles: Tile[]): Tile[] {
  const seen = new Set<string>();
  const unique: Tile[] = [];
  for (const tile of tiles) {
    const key = tileKey(tile);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(tile);
    }
  }
  return unique;
}

// Check if tiles form a sequence (3 consecutive same suit, suited tiles only)
export function isSequence(tiles: Tile[]): boolean {
  if (tiles.length !== 3) return false;
  if (isHonorTile(tiles[0])) return false;
  if (tiles.some(t => t.suit !== tiles[0].suit)) return false;
  const ranks = tiles.map(t => t.rank).sort((a, b) => a - b);
  return ranks[1] === ranks[0] + 1 && ranks[2] === ranks[1] + 1;
}

// Check if tiles form a triplet (3 identical)
export function isTriplet(tiles: Tile[]): boolean {
  if (tiles.length !== 3) return false;
  return tiles.every(t => isSameTile(t, tiles[0]));
}

// Check if tiles form a pair (2 identical)
export function isPair(tiles: Tile[]): boolean {
  if (tiles.length !== 2) return false;
  return isSameTile(tiles[0], tiles[1]);
}

// Get all tiles as a flat array (hand tiles + drawn tile)
export function getAllTiles(hand: Hand): Tile[] {
  const all = [...hand.tiles];
  if (hand.drawnTile) all.push(hand.drawnTile);
  return all;
}

// Find all possible pairs in the tiles
export function findPairs(tiles: Tile[]): Meld[] {
  const pairs: Meld[] = [];
  const used = new Set<number>();
  for (let i = 0; i < tiles.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < tiles.length; j++) {
      if (used.has(j)) continue;
      if (isSameTile(tiles[i], tiles[j])) {
        pairs.push({ type: 'pair', tiles: [tiles[i], tiles[j]] });
        used.add(i);
        used.add(j);
        break;
      }
    }
  }
  return pairs;
}
