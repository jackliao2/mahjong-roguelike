import { MetaProgression, RunState } from '@/types';
import { GameConfig } from '@/config/game-config';

const { run: RUN_KEY, meta: META_KEY, settings: SETTINGS_KEY } = GameConfig.storageKeys;

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
