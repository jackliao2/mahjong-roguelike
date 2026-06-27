import { Relic } from '@/types';

// 10 starter relics for M3
export const RELICS: Relic[] = [
  {
    id: 'amber-lantern',
    name: 'Amber Lantern',
    description: '+20% score for all Pin (circle) tiles',
    multiplier: 0,
    flatBonus: 0,
  },
  {
    id: 'bamboo-flute',
    name: 'Bamboo Flute',
    description: '+20% score for all Sou (bamboo) tiles',
    multiplier: 0,
    flatBonus: 0,
  },
  {
    id: 'ink-brush',
    name: 'Ink Brush',
    description: '+20% score for all Man (character) tiles',
    multiplier: 0,
    flatBonus: 0,
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
    description: 'Dragon yakuhai triples in value (x1.5 total multiplier)',
    multiplier: 0.5,
    flatBonus: 0,
  },
  {
    id: 'wind-chime',
    name: 'Wind Chime',
    description: '+25% score when you have a wind triplet',
    multiplier: 0.25,
    flatBonus: 0,
  },
  {
    id: 'tanyao-charm',
    name: 'Tanyao Charm',
    description: 'Tanyao hand scores double (x1.0 extra multiplier)',
    multiplier: 1.0,
    flatBonus: 0,
  },
  {
    id: 'riichi-stone',
    name: 'Riichi Stone',
    description: 'Riichi gives +300 bonus points',
    multiplier: 0,
    flatBonus: 300,
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
  },
];

export function getRelicById(id: string): Relic | undefined {
  return RELICS.find(r => r.id === id);
}

export function getRandomRelics(count: number, excludeIds: string[] = []): Relic[] {
  const available = RELICS.filter(r => !excludeIds.includes(r.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
