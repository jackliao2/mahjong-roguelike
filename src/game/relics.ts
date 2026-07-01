/**
 * Relic (遗物) system — roguelike progression between chapters.
 *
 * After each BOSS round, player chooses 1 of 3 relics.
 * Relics provide passive bonuses that affect gameplay.
 */

export type RelicId =
  | 'hint-scroll'
  | 'time-charm'
  | 'double-talisman'
  | 'perspective-glass'
  | 'combo-feather'
  | 'hourglass'
  | 'lucky-coin'
  | 'shield-tile';

export interface Relic {
  id: RelicId;
  name: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic';
}

export const RELICS: Record<RelicId, Relic> = {
  'hint-scroll': {
    id: 'hint-scroll',
    name: 'Hint Scroll',
    description: 'Remove 1 wrong option from each question',
    rarity: 'common',
  },
  'time-charm': {
    id: 'time-charm',
    name: 'Time Charm',
    description: '+1 extra life',
    rarity: 'rare',
  },
  'double-talisman': {
    id: 'double-talisman',
    name: 'Double Talisman',
    description: 'Next 3 questions give double score',
    rarity: 'rare',
  },
  'perspective-glass': {
    id: 'perspective-glass',
    name: 'Perspective Glass',
    description: 'Correct answer glows faintly on each question',
    rarity: 'epic',
  },
  'combo-feather': {
    id: 'combo-feather',
    name: 'Combo Feather',
    description: 'Combo bonus +50% stronger',
    rarity: 'common',
  },
  'hourglass': {
    id: 'hourglass',
    name: 'Hourglass',
    description: '+5 extra seconds per question',
    rarity: 'common',
  },
  'lucky-coin': {
    id: 'lucky-coin',
    name: 'Lucky Coin',
    description: '+10% bonus score on all questions',
    rarity: 'rare',
  },
  'shield-tile': {
    id: 'shield-tile',
    name: 'Shield Tile',
    description: 'First wrong answer each chapter is free',
    rarity: 'epic',
  },
};

export function getAllRelics(): Relic[] {
  return Object.values(RELICS);
}

export function getRandomRelics(count: number, exclude: RelicId[] = []): Relic[] {
  const pool = getAllRelics().filter(r => !exclude.includes(r.id));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function getRelic(id: RelicId): Relic {
  return RELICS[id];
}
