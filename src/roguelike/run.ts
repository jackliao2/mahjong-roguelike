import { RunState, MetaProgression } from '@/types';
import { calculateTargetScore } from '@/game/scoring';
import { loadRun, saveRun, clearRun, loadMeta } from '@/data/storage';
import { recordRunResult, getNewAchievements, Achievement, loadMetaProgression, RunStats } from './meta';

export function createNewRun(maxRounds: number = 5): RunState {
  return {
    round: 1,
    score: 0,
    targetScore: calculateTargetScore(1, maxRounds),
    maxRounds,
    unlockedYaku: ['riichi', 'tanyao', 'pinfu', 'yakuhai', 'iipeikou'],
    isRiichi: false,
    riichiTurns: 0,
    doraIndicators: [],
  };
}

export function loadOrCreateRun(): RunState {
  const existing = loadRun();
  if (existing) {
    // Backfill new fields for runs saved before the upgrade
    if (existing.riichiTurns === undefined) existing.riichiTurns = 0;
    if (existing.doraIndicators === undefined) existing.doraIndicators = [];
    return existing;
  }
  return createNewRun(5);
}

export function persistRun(run: RunState): void {
  saveRun(run);
}

export interface EndRunResult {
  meta: MetaProgression;
  newAchievements: Achievement[];
}

export function endRun(run: RunState, won: boolean, stats?: Partial<RunStats>): EndRunResult {
  const oldMeta = loadMetaProgression();
  const fullStats: RunStats = {
    score: stats?.score ?? run.score,
    won: stats?.won ?? won,
    difficulty: stats?.difficulty ?? 'beginner',
    maxRound: stats?.maxRound ?? run.round,
    bestCombo: stats?.bestCombo ?? 0,
    perfectRun: stats?.perfectRun ?? false,
    bossKills: stats?.bossKills ?? 0,
    relicsCollected: stats?.relicsCollected ?? 0,
  };
  const newMeta = recordRunResult(oldMeta, fullStats);
  const newAchievements = getNewAchievements(oldMeta, newMeta);
  clearRun();
  return { meta: newMeta, newAchievements };
}

export function advanceRound(run: RunState): RunState {
  const newRound = run.round + 1;
  return {
    ...run,
    round: newRound,
    isRiichi: false,
    targetScore: calculateTargetScore(newRound, run.maxRounds),
  };
}

export function checkRunComplete(run: RunState): boolean {
  return run.round >= run.maxRounds;
}

export function getMetaProgression(): MetaProgression {
  return loadMeta();
}
