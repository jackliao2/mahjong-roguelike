import { Relic, CustomTile, Yaku } from '@/types';
import { getRandomRelics } from './relics';
import { getRandomCustomTiles } from './customTiles';
import { YAKU_LIST } from '@/game/yaku';

export type RewardType = 'relic' | 'customTile' | 'yakuBoost';

export interface Reward {
  type: RewardType;
  name: string;
  description: string;
  data: Relic | CustomTile | { yaku: Yaku; hanBonus: number };
}

/**
 * Generate 3 random rewards for the player to pick one.
 * excludeIds: reward ids to exclude (used for rerolls to avoid showing the same rewards)
 */
export function generateRewards(
  ownedRelicIds: string[] = [],
  ownedTileIds: string[] = [],
  unlockedYakuIds: string[] = [],
  excludeIds: string[] = []
): Reward[] {
  const rewards: Reward[] = [];
  const types: RewardType[] = ['relic', 'customTile', 'yakuBoost'];

  // Combined exclusion list (owned + reroll-excluded)
  const allExcludeRelic = [...ownedRelicIds, ...excludeIds];
  const allExcludeTile = [...ownedTileIds, ...excludeIds];

  // Shuffle types and pick 3
  const shuffledTypes = [...types].sort(() => Math.random() - 0.5);

  for (const type of shuffledTypes) {
    if (rewards.length >= 3) break;
    const reward = generateRewardByType(type, allExcludeRelic, allExcludeTile, unlockedYakuIds);
    if (reward) rewards.push(reward);
  }

  // Fill remaining slots with relics if needed
  while (rewards.length < 3) {
    const relic = getRandomRelics(1, [...allExcludeRelic, ...rewards.filter(r => r.type === 'relic').map(r => (r.data as Relic).id)]);
    if (relic.length > 0) {
      rewards.push({
        type: 'relic',
        name: relic[0].name,
        description: relic[0].description,
        data: relic[0],
      });
    } else {
      break;
    }
  }

  return rewards;
}

function generateRewardByType(
  type: RewardType,
  ownedRelicIds: string[],
  ownedTileIds: string[],
  unlockedYakuIds: string[]
): Reward | null {
  switch (type) {
    case 'relic': {
      const relic = getRandomRelics(1, ownedRelicIds);
      if (relic.length === 0) return null;
      return {
        type: 'relic',
        name: relic[0].name,
        description: relic[0].description,
        data: relic[0],
      };
    }
    case 'customTile': {
      const tile = getRandomCustomTiles(1, ownedTileIds);
      if (tile.length === 0) return null;
      return {
        type: 'customTile',
        name: tile[0].name,
        description: tile[0].description,
        data: tile[0],
      };
    }
    case 'yakuBoost': {
      // Pick a yaku the player has unlocked and boost its han by 1
      const available = YAKU_LIST.filter(y => unlockedYakuIds.includes(y.id) && y.han < 6 && y.han < 13);
      if (available.length === 0) return null;
      const yaku = available[Math.floor(Math.random() * available.length)];
      return {
        type: 'yakuBoost',
        name: `${yaku.name} Boost`,
        description: `${yaku.romaji}: +1 han bonus (now ${yaku.han + 1} han)`,
        data: { yaku, hanBonus: 1 },
      };
    }
    default:
      return null;
  }
}
