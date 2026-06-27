import { Relic, RelicContext } from '@/types';
import { isTerminal, isHonorTile } from '@/game/tiles';

// 10 starter relics for M3 — each condition is evaluated at score time.
export const RELICS: Relic[] = [
  {
    id: 'amber-lantern',
    name: 'Amber Lantern',
    description: '+20% score for wins containing Pin (circle) tiles',
    multiplier: 0.2,
    flatBonus: 0,
    condition: (ctx: RelicContext) => ctx.rawTiles.some(t => t.suit === 'pin'),
  },
  {
    id: 'bamboo-flute',
    name: 'Bamboo Flute',
    description: '+20% score for wins containing Sou (bamboo) tiles',
    multiplier: 0.2,
    flatBonus: 0,
    condition: (ctx: RelicContext) => ctx.rawTiles.some(t => t.suit === 'sou'),
  },
  {
    id: 'ink-brush',
    name: 'Ink Brush',
    description: '+20% score for wins containing Man (character) tiles',
    multiplier: 0.2,
    flatBonus: 0,
    condition: (ctx: RelicContext) => ctx.rawTiles.some(t => t.suit === 'man'),
  },
  {
    id: 'lucky-coin',
    name: 'Lucky Coin',
    description: '+200 flat points to every win',
    multiplier: 0,
    flatBonus: 200,
  },
  {
    id: 'dragon-pendant',
    name: 'Dragon Pendant',
    description: 'x1.5 score multiplier when you have a dragon triplet',
    multiplier: 0.5,
    flatBonus: 0,
    condition: (ctx: RelicContext) => {
      const triplets = ctx.winningHand.melds.filter(m => m.type === 'triplet');
      return triplets.some(m => m.tiles[0].suit === 'dragon');
    },
  },
  {
    id: 'wind-chime',
    name: 'Wind Chime',
    description: '+25% score when you have a wind triplet',
    multiplier: 0.25,
    flatBonus: 0,
    condition: (ctx: RelicContext) => {
      const triplets = ctx.winningHand.melds.filter(m => m.type === 'triplet');
      return triplets.some(m => m.tiles[0].suit === 'wind');
    },
  },
  {
    id: 'tanyao-charm',
    name: 'Tanyao Charm',
    description: 'Tanyao hand scores double (x1.0 extra multiplier)',
    multiplier: 1.0,
    flatBonus: 0,
    condition: (ctx: RelicContext) => ctx.yakuList.some(y => y.yaku.id === 'tanyao'),
  },
  {
    id: 'riichi-stone',
    name: 'Riichi Stone',
    description: 'Riichi gives +300 bonus points',
    multiplier: 0,
    flatBonus: 300,
    condition: (ctx: RelicContext) => ctx.isRiichi,
  },
  {
    id: 'izakaya-menu',
    name: 'Izakaya Menu',
    description: '+10% score to all wins (flat multiplier)',
    multiplier: 0.1,
    flatBonus: 0,
  },
  {
    id: 'nine-tails',
    name: "Nine Tails Fox",
    description: 'Terminal tiles (1s, 9s) each add +50 bonus chips',
    multiplier: 0,
    flatBonus: 0,
    // Dynamic flat bonus: condition returns true always, but we compute flat via a side channel.
    // Since Relic.condition is boolean, we encode the per-tile bonus as a flatBonus evaluated
    // by overriding flatBonus at runtime — but to keep the type simple, we use a multiplier of 0
    // and let the dedicated Nine Tails handler in scoring pick it up via the relic list.
    // Implementation note: the scoring engine checks for relic id 'nine-tails' specially.
    condition: (ctx: RelicContext) => ctx.rawTiles.some(t => isTerminal(t)),
  },
];

/**
 * Special handling for Nine Tails Fox: +50 per terminal tile in the winning hand.
 * Called by scoring when computing relic flat bonuses.
 */
export function nineTailsBonus(rawTiles: import('@/types').Tile[]): number {
  return rawTiles.filter(t => isTerminal(t)).length * 50;
}

/**
 * Evaluate all relic bonuses for a given context, including special-case relics.
 * Returns the total multiplier (additive, on top of base 1.0) and total flat bonus.
 */
export function evaluateRelics(relics: Relic[], ctx: RelicContext): { multiplier: number; flat: number } {
  let multiplier = 0;
  let flat = 0;
  for (const relic of relics) {
    if (!relic.condition || relic.condition(ctx)) {
      multiplier += relic.multiplier;
      // Nine Tails: special dynamic flat bonus
      if (relic.id === 'nine-tails') {
        flat += nineTailsBonus(ctx.rawTiles);
      } else {
        flat += relic.flatBonus;
      }
    }
  }
  return { multiplier, flat };
}

export function getRelicById(id: string): Relic | undefined {
  return RELICS.find(r => r.id === id);
}

export function getRandomRelics(count: number, excludeIds: string[] = []): Relic[] {
  const available = RELICS.filter(r => !excludeIds.includes(r.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
