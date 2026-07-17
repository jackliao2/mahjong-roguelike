import { MetaProgression, RunState } from '@/types';
import { GameConfig } from '@/config/game-config';

const { run: RUN_KEY, meta: META_KEY, settings: SETTINGS_KEY } = GameConfig.storageKeys;
const LEADERBOARD_KEY = 'mjrg_leaderboard';
const DAILY_KEY = 'mjrg_daily';
const MISTAKES_KEY = 'mjrg_mistakes';

export interface DailyProgress {
  lastCompleted: string;
  streak: number;
  bestScore: number;
}

export interface LeaderboardEntry {
  score: number;
  round: number;
  maxRounds: number;
  won: boolean;
  difficulty: string;
  build: string;
  date: string;
}

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch (e) {
    console.error('Failed to save run:', e);
  }
}

export function loadRun(): RunState | null {
  try {
    const data = localStorage.getItem(RUN_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  localStorage.removeItem(RUN_KEY);
}

export function loadMeta(): MetaProgression {
  try {
    const data = localStorage.getItem(META_KEY);
    if (data) return JSON.parse(data);
  } catch {
    // corrupted data, return default
  }
  return {
    totalRuns: 0,
    bestScore: 0,
    totalWins: 0,
    unlockedDecks: ['default'],
    achievements: [],
    beginnerCompleted: 0,
    normalCompleted: 0,
    endlessBestRound: 0,
    bestCombo: 0,
    perfectRuns: 0,
    bossKills: 0,
    relicsCollected: 0,
  };
}

export function saveMeta(meta: MetaProgression): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (e) {
    console.error('Failed to save meta:', e);
  }
}

export function loadSettings<T>(defaults: T): T {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? { ...defaults, ...JSON.parse(data) } : defaults;
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: unknown): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const data = localStorage.getItem(LEADERBOARD_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addLeaderboardEntry(entry: LeaderboardEntry): LeaderboardEntry[] {
  const next = [...loadLeaderboard(), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(next));
  } catch (e) {
    console.error('Failed to save leaderboard:', e);
  }
  return next;
}

export function getTodayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function loadDailyProgress(): DailyProgress {
  try {
    const data = localStorage.getItem(DAILY_KEY);
    return data ? JSON.parse(data) : { lastCompleted: '', streak: 0, bestScore: 0 };
  } catch {
    return { lastCompleted: '', streak: 0, bestScore: 0 };
  }
}

export function completeDailyChallenge(score: number): DailyProgress {
  const current = loadDailyProgress();
  const today = getTodayKey();
  if (current.lastCompleted === today) {
    const updated = { ...current, bestScore: Math.max(current.bestScore, score) };
    localStorage.setItem(DAILY_KEY, JSON.stringify(updated));
    return updated;
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const updated: DailyProgress = {
    lastCompleted: today,
    streak: current.lastCompleted === getTodayKey(yesterday) ? current.streak + 1 : 1,
    bestScore: Math.max(current.bestScore, score),
  };
  localStorage.setItem(DAILY_KEY, JSON.stringify(updated));
  return updated;
}

export function recordMistake(questionType: string): void {
  try {
    const mistakes = loadMistakeTypes();
    const next = [questionType, ...mistakes.filter(type => type !== questionType)].slice(0, 5);
    localStorage.setItem(MISTAKES_KEY, JSON.stringify(next));
  } catch {
    // Practice history must never interrupt a run.
  }
}

export function loadMistakeTypes(): string[] {
  try {
    const data = localStorage.getItem(MISTAKES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function resolveMistake(questionType: string): void {
  try {
    const next = loadMistakeTypes().filter(type => type !== questionType);
    localStorage.setItem(MISTAKES_KEY, JSON.stringify(next));
  } catch {
    // Practice history must never interrupt a run.
  }
}
