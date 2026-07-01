// Core type definitions for Mahjong Roguelike

export type Suit = 'man' | 'pin' | 'sou' | 'wind' | 'dragon';

export interface Tile {
  suit: Suit;
  rank: number; // 1-9 for suited tiles, 1-4 for winds (E/S/W/N), 1-3 for dragons (Red/White/Green)
  id: string; // unique instance ID
}

export interface Hand {
  tiles: Tile[]; // 13 tiles (or 14 when drawn)
  drawnTile: Tile | null; // the tile drawn from wall, separated for UI
}

export type MeldType = 'sequence' | 'triplet' | 'pair';

export interface Meld {
  type: MeldType;
  tiles: Tile[];
}

export interface WinningHand {
  melds: Meld[]; // 4 sets + 1 pair
  pairs: Meld[]; // just the pair
}

export interface Yaku {
  id: string;
  name: string; // English name
  romaji: string; // Japanese romaji
  han: number; // han value (1-6, or 13 for yakuman)
  description: string;
  check: (hand: WinningHand, rawTiles: Tile[], isRiichi: boolean) => boolean;
}

export interface RunState {
  round: number;
  score: number;
  targetScore: number;
  maxRounds: number;
  unlockedYaku: string[];
  isRiichi: boolean;
  riichiTurns: number; // turns since riichi declared (for ippatsu)
  doraIndicators: Tile[]; // revealed dora indicators from wall
}

export interface MetaProgression {
  totalRuns: number;
  bestScore: number;
  totalWins: number;
  unlockedDecks: string[];
  achievements: string[];
}

/** A single challenge goal for a round. */
export interface ChallengeGoal {
  id: string;
  type: 'yaku' | 'multiYaku' | 'han' | 'noHint' | 'fastWin';
  /** Yaku ID when type === 'yaku'. */
  targetId?: string;
  count?: number;
  bonus: number;
  desc: string;
  /** Optional goals are for extra bonus; required goals gate learning progress. */
  optional: boolean;
}

export interface ScoreResult {
  basePoints: number;
  yakuList: { yaku: Yaku; han: number }[];
  totalHan: number;
  finalScore: number;
  doraCount: number;
  isIppatsu: boolean;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  baseHan: number;
  doraHan: number;
  ippatsuHan: number;
  uraDoraHan: number;
  basePoints: number;
  finalScore: number;
}
