import { MetaProgression, Unlockable } from '@/types';
import { GameConfig } from '@/config/game-config';

const META_KEY = 'mjrg_meta';

const DEFAULT_META: MetaProgression = {
  totalRuns: 0,
  bestScore: 0,
  totalWins: 0,
  unlockedDecks: ['default'],
  currency: 0,
  achievements: [],
  purchasedUnlocks: [],
};

export interface Achievement {
  id: string;
  name: string;
  description: string;
  condition: (meta: MetaProgression) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-run',
    name: 'First Steps',
    description: 'Complete your first run',
    condition: (meta) => meta.totalRuns >= 1,
  },
  {
    id: 'first-win',
    name: 'Mahjong Master',
    description: 'Win your first run',
    condition: (meta) => meta.totalWins >= 1,
  },
  {
    id: 'score-5000',
    name: 'High Roller',
    description: 'Score 5000+ points in a single run',
    condition: (meta) => meta.bestScore >= 5000,
  },
  {
    id: 'score-10000',
    name: 'Izakaya Legend',
    description: 'Score 10000+ points in a single run',
    condition: (meta) => meta.bestScore >= 10000,
  },
  {
    id: 'runs-10',
    name: 'Dedicated Player',
    description: 'Complete 10 runs',
    condition: (meta) => meta.totalRuns >= 10,
  },
  {
    id: 'wins-5',
    name: 'Consistent Winner',
    description: 'Win 5 runs',
    condition: (meta) => meta.totalWins >= 5,
  },
];

export function loadMetaProgression(): MetaProgression {
  try {
    const data = localStorage.getItem(META_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      return { ...DEFAULT_META, ...parsed };
    }
  } catch {
    // corrupted data
  }
  return { ...DEFAULT_META };
}

export function saveMetaProgression(meta: MetaProgression): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (e) {
    console.error('Failed to save meta:', e);
  }
}

export function recordRunResult(meta: MetaProgression, score: number, won: boolean): MetaProgression {
  const updated: MetaProgression = {
    ...meta,
    totalRuns: meta.totalRuns + 1,
    totalWins: meta.totalWins + (won ? 1 : 0),
    bestScore: Math.max(meta.bestScore, score),
    currency: meta.currency + Math.floor(score / 100),
  };

  // Check for new achievements
  for (const achievement of ACHIEVEMENTS) {
    if (!updated.achievements.includes(achievement.id) && achievement.condition(updated)) {
      updated.achievements.push(achievement.id);
    }
  }

  saveMetaProgression(updated);
  return updated;
}

export function getNewAchievements(oldMeta: MetaProgression, newMeta: MetaProgression): Achievement[] {
  return ACHIEVEMENTS.filter(a =>
    !oldMeta.achievements.includes(a.id) && newMeta.achievements.includes(a.id)
  );
}

// Starting decks for unlock system
export interface StartingDeck {
  id: string;
  name: string;
  description: string;
  unlockCondition: string;
  startingRelics: string[];
}

export const STARTING_DECKS: StartingDeck[] = [
  {
    id: 'default',
    name: 'Beginner Deck',
    description: 'A balanced starting hand. No special bonuses.',
    unlockCondition: 'Available from start',
    startingRelics: [],
  },
  {
    id: 'riichi-master',
    name: 'Riichi Master',
    description: 'Start with Riichi Stone relic. Focus on riichi plays.',
    unlockCondition: 'Win 1 run',
    startingRelics: ['riichi-stone'],
  },
  {
    id: 'dragon-deck',
    name: 'Dragon Deck',
    description: 'Start with Dragon Pendant. Dragon tiles are your power.',
    unlockCondition: 'Win 3 runs',
    startingRelics: ['dragon-pendant'],
  },
  {
    id: 'tanyao-deck',
    name: 'Tanyao Deck',
    description: 'Start with Tanyao Charm. All Simples scores double.',
    unlockCondition: 'Score 5000+ in a run',
    startingRelics: ['tanyao-charm'],
  },
  {
    id: 'izakaya-deck',
    name: 'Izakaya Deck',
    description: 'Start with Lucky Coin and Izakaya Menu. Pure bonus build.',
    unlockCondition: 'Complete 5 runs',
    startingRelics: ['lucky-coin', 'izakaya-menu'],
  },
];

export function getUnlockedDecks(meta: MetaProgression): StartingDeck[] {
  return STARTING_DECKS.filter(deck => {
    switch (deck.id) {
      case 'default': return true;
      case 'riichi-master': return meta.totalWins >= 1;
      case 'dragon-deck': return meta.totalWins >= 3;
      case 'tanyao-deck': return meta.bestScore >= 5000;
      case 'izakaya-deck': return meta.totalRuns >= 5;
      default: return false;
    }
  });
}

/** Permanent unlockables from config. */
export const UNLOCKABLES: Unlockable[] = GameConfig.unlockables.items;

/** Check if a permanent unlock has already been purchased. */
export function hasUnlock(meta: MetaProgression, unlockId: string): boolean {
  return meta.purchasedUnlocks?.includes(unlockId) ?? false;
}

/** Attempt to buy a permanent unlock. Returns success flag and updated meta. */
export function buyUnlock(meta: MetaProgression, unlockId: string): { success: boolean; meta: MetaProgression } {
  const item = UNLOCKABLES.find(u => u.id === unlockId);
  if (!item) return { success: false, meta };
  if (hasUnlock(meta, unlockId)) return { success: false, meta };
  if ((meta.currency || 0) < item.cost) return { success: false, meta };

  const updated: MetaProgression = {
    ...meta,
    currency: meta.currency - item.cost,
    purchasedUnlocks: [...(meta.purchasedUnlocks || []), unlockId],
  };
  saveMetaProgression(updated);
  return { success: true, meta: updated };
}
