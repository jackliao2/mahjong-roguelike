import { Tile, WinningHand, Yaku } from '@/types';
import { isHonorTile, isTerminal, isSimple, isSameTile } from './tiles';
import { isSequence } from './hand';

// Core 5 yaku for M2 (defined now for immediate use)
export const YAKU_LIST: Yaku[] = [
  {
    id: 'riichi',
    name: 'Riichi',
    romaji: 'Riichi',
    han: 1,
    description: 'Declared readiness: you are one tile away from winning. In this game, riichi is declared before your final draw.',
    check: (_hand, _raw, isRiichi) => isRiichi,
  },
  {
    id: 'tanyao',
    name: 'All Simples',
    romaji: 'Tanyao',
    han: 1,
    description: 'All tiles are simples (2-8). No terminals (1, 9) or honor tiles (winds, dragons).',
    check: (_hand, rawTiles) => rawTiles.every(t => isSimple(t)),
  },
  {
    id: 'pinfu',
    name: 'All Sequences',
    romaji: 'Pinfu',
    han: 1,
    description: 'All 4 sets are sequences. The pair is not a dragon or seat wind. A clean, elegant hand.',
    check: (hand) => {
      const sets = hand.melds.filter(m => m.type !== 'pair');
      if (sets.length !== 4) return false;
      if (!sets.every(m => m.type === 'sequence')) return false;
      // Pair should not be a dragon (simplified: not dragon)
      const pair = hand.pairs[0];
      if (pair && pair.tiles[0].suit === 'dragon') return false;
      return true;
    },
  },
  {
    id: 'yakuhai',
    name: 'Value Tiles',
    romaji: 'Yakuhai',
    han: 1,
    description: 'A triplet of dragon tiles (Red, White, or Green). Each type of dragon triplet adds 1 han.',
    check: (hand) => {
      const triplets = hand.melds.filter(m => m.type === 'triplet');
      return triplets.some(m => m.tiles[0].suit === 'dragon');
    },
  },
  {
    id: 'iipeikou',
    name: 'Pure Double Sequence',
    romaji: 'Iipeikou',
    han: 1,
    description: 'Two identical sequences in the same suit (e.g., two 2-3-4 of bamboo).',
    check: (hand) => {
      const sequences = hand.melds.filter(m => m.type === 'sequence');
      for (let i = 0; i < sequences.length; i++) {
        for (let j = i + 1; j < sequences.length; j++) {
          if (sameSequence(sequences[i].tiles, sequences[j].tiles)) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'sanshoku',
    name: 'Mixed Triple Sequence',
    romaji: 'Sanshoku Doujun',
    han: 2,
    description: 'The same sequence across all three suits (man, pin, sou). e.g., 2-3-4 of each suit.',
    check: (hand) => {
      const sequences = hand.melds.filter(m => m.type === 'sequence');
      const byRank = new Map<string, string[]>();
      for (const seq of sequences) {
        const ranks = seq.tiles.map(t => t.rank).sort((a, b) => a - b).join('-');
        if (!byRank.has(ranks)) byRank.set(ranks, []);
        byRank.get(ranks)!.push(seq.tiles[0].suit);
      }
      for (const [, suits] of byRank) {
        if (suits.length >= 3) {
          const suitSet = new Set(suits);
          if (suitSet.has('man') && suitSet.has('pin') && suitSet.has('sou')) return true;
        }
      }
      return false;
    },
  },
  {
    id: 'ittsu',
    name: 'Pure Straight',
    romaji: 'Ikkitsuukan',
    han: 2,
    description: 'Three consecutive sequences (1-2-3, 4-5-6, 7-8-9) in the same suit.',
    check: (hand) => {
      const sequences = hand.melds.filter(m => m.type === 'sequence');
      // Group sequences by suit and check for exact 1-2-3, 4-5-6, 7-8-9
      const bySuit = new Map<string, Set<string>>();
      for (const seq of sequences) {
        const ranks = seq.tiles.map(t => t.rank).sort((a, b) => a - b).join('-');
        const suit = seq.tiles[0].suit;
        if (!bySuit.has(suit)) bySuit.set(suit, new Set());
        bySuit.get(suit)!.add(ranks);
      }
      for (const [, rankSet] of bySuit) {
        if (rankSet.has('1-2-3') && rankSet.has('4-5-6') && rankSet.has('7-8-9')) {
          return true;
        }
      }
      return false;
    },
  },
  {
    id: 'toitoi',
    name: 'All Triplets',
    romaji: 'Toitoi',
    han: 2,
    description: 'All 4 sets are triplets (no sequences). A heavy, powerful hand.',
    check: (hand) => {
      const sets = hand.melds.filter(m => m.type !== 'pair');
      return sets.length === 4 && sets.every(m => m.type === 'triplet');
    },
  },
  {
    id: 'chiitoitsu',
    name: 'Seven Pairs',
    romaji: 'Chiitoitsu',
    han: 2,
    description: 'Seven different pairs instead of the standard 4 sets + 1 pair.',
    check: (hand) => hand.melds.length === 0 && hand.pairs.length === 7,
  },
  {
    id: 'honroutou',
    name: 'All Terminals & Honors',
    romaji: 'Honroutou',
    han: 2,
    description: 'Every tile is either a terminal (1 or 9) or an honor tile (winds, dragons).',
    check: (_hand, rawTiles) => rawTiles.every(t => isTerminal(t) || isHonorTile(t)),
  },
  {
    id: 'sanankou',
    name: 'Three Concealed Triplets',
    romaji: 'Sanankou',
    han: 2,
    description: 'Three triplets formed entirely from your own draws (concealed).',
    check: (hand) => {
      const triplets = hand.melds.filter(m => m.type === 'triplet');
      return triplets.length >= 3;
    },
  },
  {
    id: 'kokushi',
    name: 'Thirteen Orphans',
    romaji: 'Kokushi Musou',
    han: 13,
    description: 'One of each terminal and honor tile (13 unique types) plus a duplicate of any one. A legendary yakuman hand.',
    check: (_hand, rawTiles) => {
      if (rawTiles.length !== 14) return false;
      const required = [
        'man-1', 'man-9', 'pin-1', 'pin-9', 'sou-1', 'sou-9',
        'wind-1', 'wind-2', 'wind-3', 'wind-4',
        'dragon-1', 'dragon-2', 'dragon-3',
      ];
      const tileKeys = rawTiles.map(t => `${t.suit}-${t.rank}`);
      const counts = new Map<string, number>();
      for (const key of tileKeys) counts.set(key, (counts.get(key) || 0) + 1);
      // Must have all 13 required types
      for (const req of required) {
        if (!counts.has(req)) return false;
      }
      // Must have exactly one duplicate
      let dupes = 0;
      for (const [key, count] of counts) {
        if (count > 1) dupes += count - 1;
      }
      return dupes === 1;
    },
  },
];

function sameSequence(a: Tile[], b: Tile[]): boolean {
  if (a.length !== 3 || b.length !== 3) return false;
  if (a[0].suit !== b[0].suit) return false;
  return a.every((t, i) => t.rank === b[i].rank);
}

export function getYakuById(id: string): Yaku | undefined {
  return YAKU_LIST.find(y => y.id === id);
}

export function checkAllYaku(
  winningHand: WinningHand,
  rawTiles: Tile[],
  isRiichi: boolean,
  unlockedYaku?: string[],
  yakuBonuses?: Record<string, number>
): { yaku: Yaku; han: number }[] {
  const matched: { yaku: Yaku; han: number }[] = [];
  for (const yaku of YAKU_LIST) {
    // Skip yaku not yet unlocked (if filter is provided)
    if (unlockedYaku && !unlockedYaku.includes(yaku.id)) continue;
    if (yaku.check(winningHand, rawTiles, isRiichi)) {
      // Apply yaku boost bonus if any
      const bonus = yakuBonuses?.[yaku.id] || 0;
      matched.push({ yaku, han: yaku.han + bonus });
    }
  }
  return matched;
}
