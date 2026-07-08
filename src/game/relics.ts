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
  | 'shield-tile'
  | 'red-five';

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
    description: 'Eliminate 2 wrong options (instead of 1)',
    rarity: 'common',
  },
  'time-charm': {
    id: 'time-charm',
    name: 'Time Charm',
    description: '+2 extra lives',
    rarity: 'rare',
  },
  'double-talisman': {
    id: 'double-talisman',
    name: 'Double Talisman',
    description: 'Your next 3 correct answers give double score',
    rarity: 'rare',
  },
  'perspective-glass': {
    id: 'perspective-glass',
    name: 'Perspective Glass',
    description: 'Correct answer highlighted with bright golden glow (impossible to miss)',
    rarity: 'common',
  },
  'combo-feather': {
    id: 'combo-feather',
    name: 'Combo Feather',
    description: 'Combo never resets on wrong answer; combo bonuses are stronger',
    rarity: 'rare',
  },
  'hourglass': {
    id: 'hourglass',
    name: 'Hourglass',
    description: '+10 extra seconds per question',
    rarity: 'common',
  },
  'lucky-coin': {
    id: 'lucky-coin',
    name: 'Lucky Coin',
    description: '+30% bonus score',
    rarity: 'epic',
  },
  'shield-tile': {
    id: 'shield-tile',
    name: 'Shield Tile',
    description: 'First wrong answer each chapter is free; +1 life on pickup',
    rarity: 'epic',
  },
  'red-five': {
    id: 'red-five',
    name: 'Red Five',
    description: '+750 score when the hand or chosen tile contains a 5',
    rarity: 'rare',
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
