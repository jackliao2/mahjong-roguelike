import { CustomTile, Tile } from '@/types';
import { createTile } from '@/game/tiles';

// 5 starter custom tiles for M3
export const CUSTOM_TILES: CustomTile[] = [
  {
    id: 'red-five-man',
    name: 'Red Five (Man)',
    description: 'This 5-man tile glows red. +100 chips when used in a win.',
    baseTile: createTile('man', 5),
    bonusChips: 100,
    multiplier: 0,
  },
  {
    id: 'red-five-pin',
    name: 'Red Five (Pin)',
    description: 'This 5-pin tile glows red. +100 chips when used in a win.',
    baseTile: createTile('pin', 5),
    bonusChips: 100,
    multiplier: 0,
  },
  {
    id: 'red-five-sou',
    name: 'Red Five (Sou)',
    description: 'This 5-sou tile glows red. +100 chips when used in a win.',
    baseTile: createTile('sou', 5),
    bonusChips: 100,
    multiplier: 0,
  },
  {
    id: 'golden-dragon',
    name: 'Golden Dragon',
    description: 'A radiant Red Dragon. x2 score multiplier if in winning hand.',
    baseTile: createTile('dragon', 1),
    bonusChips: 0,
    multiplier: 1.0,
  },
  {
    id: 'lucky-east',
    name: 'Lucky East',
    description: 'A shimmering East Wind. +250 flat bonus when in winning hand.',
    baseTile: createTile('wind', 1),
    bonusChips: 250,
    multiplier: 0,
  },
];

export function getCustomTileById(id: string): CustomTile | undefined {
  return CUSTOM_TILES.find(t => t.id === id);
}

export function getRandomCustomTiles(count: number, excludeIds: string[] = []): CustomTile[] {
  const available = CUSTOM_TILES.filter(t => !excludeIds.includes(t.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
