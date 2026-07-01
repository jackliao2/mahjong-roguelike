import { MetaProgression } from '@/types';

const META_KEY = 'mjrg_meta';

const DEFAULT_META: MetaProgression = {
  totalRuns: 0,
  bestScore: 0,
  totalWins: 0,
  unlockedDecks: ['default'],
  achievements: [],
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

// Starting decks are cosmetic practice themes — no mechanical effect.
// Unlocked as milestone rewards to give long-term progression goals.
export interface StartingDeck {
  id: string;
  name: string;
  description: string;
  unlockCondition: string;
  theme: string; // short flavor label shown in place of the old relic line
}

export const STARTING_DECKS: StartingDeck[] = [
  {
    id: 'default',
    name: 'Practice Deck',
    description: 'Balanced standard tile distribution. The recommended starting point for learning yaku.',
    unlockCondition: 'Available from start',
    theme: 'Balanced practice',
  },
  {
    id: 'riichi-master',
    name: 'Riichi Focus',
    description: 'A thematic practice theme for drilling riichi hands.',
    unlockCondition: 'Win 1 run',
    theme: 'Riichi drill theme',
  },
  {
    id: 'dragon-deck',
    name: 'Dragon Focus',
    description: 'A thematic practice theme for hands centered on dragon tiles.',
    unlockCondition: 'Win 3 runs',
    theme: 'Dragon drill theme',
  },
  {
    id: 'tanyao-deck',
    name: 'Tanyao Focus',
    description: 'A thematic practice theme for all-simples (tanyao) hands.',
    unlockCondition: 'Score 5000+ in a run',
    theme: 'Tanyao drill theme',
  },
  {
    id: 'izakaya-deck',
    name: 'Free Practice',
    description: 'Open-ended practice with no specific focus. Mix any yaku you have learned.',
    unlockCondition: 'Complete 5 runs',
    theme: 'Free practice theme',
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
