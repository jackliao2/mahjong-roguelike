import { Relic, RelicContext, RelicEffect } from '@/types';
import { isTerminal, isHonorTile } from '@/game/tiles';

export const RELICS: Relic[] = [
  {
    id: 'lucky-draw',
    name: 'Lucky Draw',
    description: 'Once per round: draw 2 tiles instead of 1',
    multiplier: 0,
    flatBonus: 0,
    effect: { type: 'extraDraw', value: 1 },
  },
  {
    id: 'smooth-discard',
    name: 'Smooth Discard',
    description: 'Once per round: skip discarding after drawing',
    multiplier: 0,
    flatBonus: 0,
    effect: { type: 'skipDiscard', value: 1 },
  },
  {
    id: 'pin-focus',
    name: 'Pin Focus',
    description: 'Increases chance of drawing Pin tiles',
    multiplier: 0,
    flatBonus: 0,
    effect: { type: 'wallWeight', suit: 'pin', value: 1.5 },
  },
  {
    id: 'sou-focus',
    name: 'Sou Focus',
    description: 'Increases chance of drawing Sou tiles',
    multiplier: 0,
    flatBonus: 0,
    effect: { type: 'wallWeight', suit: 'sou', value: 1.5 },
  },
  {
    id: 'man-focus',
    name: 'Man Focus',
    description: 'Increases chance of drawing Man tiles',
    multiplier: 0,
    flatBonus: 0,
    effect: { type: 'wallWeight', suit: 'man', value: 1.5 },
  },
  {
    id: 'early-tenpai',
    name: 'Early Tenpai',
    description: 'Start each round with 14 tiles instead of 13',
    multiplier: 0,
    flatBonus: 0,
    effect: { type: 'extraInitialTiles', value: 1 },
  },
  {
    id: 'riichi-accelerator',
    name: 'Riichi Accelerator',
    description: 'Auto-draw winning tile immediately after Riichi',
    multiplier: 0,
    flatBonus: 0,
    effect: { type: 'autoRiichi' },
  },
  {
    id: 'lucky-coin',
    name: 'Lucky Coin',
    description: '+200 flat points to every win',
    multiplier: 0,
    flatBonus: 200,
  },
  {
    id: 'izakaya-menu',
    name: 'Izakaya Menu',
    description: '+10% score to all wins',
    multiplier: 0.1,
    flatBonus: 0,
  },
  {
    id: 'nine-tails',
    name: "Nine Tails Fox",
    description: 'Terminal tiles (1s, 9s) each add +50 bonus chips',
    multiplier: 0,
    flatBonus: 0,
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
