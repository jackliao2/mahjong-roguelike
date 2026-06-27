import { Tile, Suit } from '@/types';

// Tile display info for Western players
export interface TileDisplayInfo {
  suit: Suit;
  rank: number;
  englishName: string;
  romaji: string;
  westernHint: string; // e.g., "2 Bamboo", "East Wind"
  color: string; // hex color for rendering
  symbol: string; // simplified symbol for pixel rendering
}

// Display info for all tile types
export const TILE_DISPLAY: Record<string, TileDisplayInfo> = {
  // Man (Characters) - red ink
  'man-1': { suit: 'man', rank: 1, englishName: '1 Character', romaji: 'Ichi-man', westernHint: '1 Char', color: '#1a1a2e', symbol: '一' },
  'man-2': { suit: 'man', rank: 2, englishName: '2 Character', romaji: 'Ni-man', westernHint: '2 Char', color: '#1a1a2e', symbol: '二' },
  'man-3': { suit: 'man', rank: 3, englishName: '3 Character', romaji: 'San-man', westernHint: '3 Char', color: '#1a1a2e', symbol: '三' },
  'man-4': { suit: 'man', rank: 4, englishName: '4 Character', romaji: 'Yon-man', westernHint: '4 Char', color: '#1a1a2e', symbol: '四' },
  'man-5': { suit: 'man', rank: 5, englishName: '5 Character', romaji: 'Go-man', westernHint: '5 Char', color: '#1a1a2e', symbol: '五' },
  'man-6': { suit: 'man', rank: 6, englishName: '6 Character', romaji: 'Roku-man', westernHint: '6 Char', color: '#1a1a2e', symbol: '六' },
  'man-7': { suit: 'man', rank: 7, englishName: '7 Character', romaji: 'Nana-man', westernHint: '7 Char', color: '#1a1a2e', symbol: '七' },
  'man-8': { suit: 'man', rank: 8, englishName: '8 Character', romaji: 'Hachi-man', westernHint: '8 Char', color: '#1a1a2e', symbol: '八' },
  'man-9': { suit: 'man', rank: 9, englishName: '9 Character', romaji: 'Kyu-man', westernHint: '9 Char', color: '#1a1a2e', symbol: '九' },

  // Pin (Circles/Dots) - blue
  'pin-1': { suit: 'pin', rank: 1, englishName: '1 Circle', romaji: 'Ii-pin', westernHint: '1 Dot', color: '#2c5f8a', symbol: '●' },
  'pin-2': { suit: 'pin', rank: 2, englishName: '2 Circles', romaji: 'Ryaa-pin', westernHint: '2 Dots', color: '#2c5f8a', symbol: '●●' },
  'pin-3': { suit: 'pin', rank: 3, englishName: '3 Circles', romaji: 'Sabu-pin', westernHint: '3 Dots', color: '#2c5f8a', symbol: '●●●' },
  'pin-4': { suit: 'pin', rank: 4, englishName: '4 Circles', romaji: 'Suu-pin', westernHint: '4 Dots', color: '#2c5f8a', symbol: '●●●●' },
  'pin-5': { suit: 'pin', rank: 5, englishName: '5 Circles', romaji: 'Uu-pin', westernHint: '5 Dots', color: '#2c5f8a', symbol: '●●●●●' },
  'pin-6': { suit: 'pin', rank: 6, englishName: '6 Circles', romaji: 'Rou-pin', westernHint: '6 Dots', color: '#2c5f8a', symbol: '●●●●●●' },
  'pin-7': { suit: 'pin', rank: 7, englishName: '7 Circles', romaji: 'Chii-pin', westernHint: '7 Dots', color: '#2c5f8a', symbol: '●●●●●●●' },
  'pin-8': { suit: 'pin', rank: 8, englishName: '8 Circles', romaji: 'Paa-pin', westernHint: '8 Dots', color: '#2c5f8a', symbol: '●●●●●●●●' },
  'pin-9': { suit: 'pin', rank: 9, englishName: '9 Circles', romaji: 'Kyuu-pin', westernHint: '9 Dots', color: '#2c5f8a', symbol: '●●●●●●●●●' },

  // Sou (Bamboo) - green
  'sou-1': { suit: 'sou', rank: 1, englishName: '1 Bamboo', romaji: 'Ii-sou', westernHint: '1 Bam', color: '#2d6a4f', symbol: '丨' },
  'sou-2': { suit: 'sou', rank: 2, englishName: '2 Bamboo', romaji: 'Ryaa-sou', westernHint: '2 Bam', color: '#2d6a4f', symbol: '丨丨' },
  'sou-3': { suit: 'sou', rank: 3, englishName: '3 Bamboo', romaji: 'Sabu-sou', westernHint: '3 Bam', color: '#2d6a4f', symbol: '丨丨丨' },
  'sou-4': { suit: 'sou', rank: 4, englishName: '4 Bamboo', romaji: 'Suu-sou', westernHint: '4 Bam', color: '#2d6a4f', symbol: '丨丨丨丨' },
  'sou-5': { suit: 'sou', rank: 5, englishName: '5 Bamboo', romaji: 'Uu-sou', westernHint: '5 Bam', color: '#2d6a4f', symbol: '丨丨丨丨丨' },
  'sou-6': { suit: 'sou', rank: 6, englishName: '6 Bamboo', romaji: 'Rou-sou', westernHint: '6 Bam', color: '#2d6a4f', symbol: '丨丨丨丨丨丨' },
  'sou-7': { suit: 'sou', rank: 7, englishName: '7 Bamboo', romaji: 'Chii-sou', westernHint: '7 Bam', color: '#2d6a4f', symbol: '丨丨丨丨丨丨丨' },
  'sou-8': { suit: 'sou', rank: 8, englishName: '8 Bamboo', romaji: 'Paa-sou', westernHint: '8 Bam', color: '#2d6a4f', symbol: '丨丨丨丨丨丨丨丨' },
  'sou-9': { suit: 'sou', rank: 9, englishName: '9 Bamboo', romaji: 'Kyuu-sou', westernHint: '9 Bam', color: '#2d6a4f', symbol: '丨丨丨丨丨丨丨丨丨' },

  // Winds
  'wind-1': { suit: 'wind', rank: 1, englishName: 'East Wind', romaji: 'Ton', westernHint: 'East', color: '#5c4033', symbol: 'E' },
  'wind-2': { suit: 'wind', rank: 2, englishName: 'South Wind', romaji: 'Nan', westernHint: 'South', color: '#5c4033', symbol: 'S' },
  'wind-3': { suit: 'wind', rank: 3, englishName: 'West Wind', romaji: 'Shaa', westernHint: 'West', color: '#5c4033', symbol: 'W' },
  'wind-4': { suit: 'wind', rank: 4, englishName: 'North Wind', romaji: 'Pei', westernHint: 'North', color: '#5c4033', symbol: 'N' },

  // Dragons
  'dragon-1': { suit: 'dragon', rank: 1, englishName: 'Red Dragon', romaji: 'Chun', westernHint: 'Red Dragon', color: '#c73e3a', symbol: '中' },
  'dragon-2': { suit: 'dragon', rank: 2, englishName: 'White Dragon', romaji: 'Haku', westernHint: 'White Dragon', color: '#f5e6d3', symbol: '□' },
  'dragon-3': { suit: 'dragon', rank: 3, englishName: 'Green Dragon', romaji: 'Hatsu', westernHint: 'Green Dragon', color: '#2d6a4f', symbol: '發' },
};

export function tileKey(tile: Tile): string {
  return `${tile.suit}-${tile.rank}`;
}

export function getTileDisplay(tile: Tile): TileDisplayInfo {
  return TILE_DISPLAY[tileKey(tile)];
}

let tileIdCounter = 0;
export function createTile(suit: Suit, rank: number): Tile {
  return { suit, rank, id: `tile-${tileIdCounter++}` };
}

// Create a full set of 136 mahjong tiles (4 copies of each)
export function createFullTileSet(): Tile[] {
  const tiles: Tile[] = [];
  const suits: [Suit, number][] = [
    ['man', 9], ['pin', 9], ['sou', 9], ['wind', 4], ['dragon', 3],
  ];
  for (const [suit, maxRank] of suits) {
    for (let rank = 1; rank <= maxRank; rank++) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push(createTile(suit, rank));
      }
    }
  }
  return tiles;
}

// Check if two tiles are the same type (same suit + rank)
export function isSameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

// Check if a tile is an honor tile (wind or dragon)
export function isHonorTile(tile: Tile): boolean {
  return tile.suit === 'wind' || tile.suit === 'dragon';
}

// Check if a tile is a terminal (1 or 9 of suited tiles)
export function isTerminal(tile: Tile): boolean {
  if (isHonorTile(tile)) return false;
  return tile.rank === 1 || tile.rank === 9;
}

// Check if a tile is a simple (2-8 of suited tiles)
export function isSimple(tile: Tile): boolean {
  if (isHonorTile(tile)) return false;
  return tile.rank >= 2 && tile.rank <= 8;
}
