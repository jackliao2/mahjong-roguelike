import { RunState, Relic, CustomTile, MetaProgression } from '@/types';
import { calculateTargetScore } from '@/game/scoring';
import { loadRun, saveRun, clearRun, loadMeta, saveMeta } from '@/data/storage';

// Yaku han bonuses applied during the run (from yakuBoost rewards)
const yakuBonusesKey = 'mjrg_yaku_bonuses';

export function createNewRun(maxRounds: number = 5): RunState {
  return {
    round: 1,
    score: 0,
    targetScore: calculateTargetScore(1, maxRounds),
    maxRounds,
    relics: [],
    customTiles: [],
    unlockedYaku: ['riichi', 'tanyao', 'pinfu', 'yakuhai', 'iipeikou'],
    isRiichi: false,
  };
}

export function loadOrCreateRun(): RunState {
  const existing = loadRun();
  if (existing) return existing;
  return createNewRun(5);
}

export function persistRun(run: RunState): void {
  saveRun(run);
}

export function endRun(run: RunState, won: boolean): void {
  const meta = loadMeta();
  meta.totalRuns++;
  if (won) meta.totalWins++;
  if (run.score > meta.bestScore) meta.bestScore = run.score;
  // Earn currency: 1 per 100 points scored
  meta.currency += Math.floor(run.score / 100);
  saveMeta(meta);
  clearRun();
}

export function addRelicToRun(run: RunState, relic: Relic): RunState {
  return {
    ...run,
    relics: [...run.relics, relic],
  };
}

export function addCustomTileToRun(run: RunState, tile: CustomTile): RunState {
  return {
    ...run,
    customTiles: [...run.customTiles, tile],
  };
}

export function applyYakuBoost(run: RunState, yakuId: string, bonus: number): RunState {
  // Store yaku bonuses in localStorage (separate from run state)
  const bonuses = loadYakuBonuses();
  bonuses[yakuId] = (bonuses[yakuId] || 0) + bonus;
  localStorage.setItem(yakuBonusesKey, JSON.stringify(bonuses));
  return run;
}

export function loadYakuBonuses(): Record<string, number> {
  try {
    const data = localStorage.getItem(yakuBonusesKey);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function clearYakuBonuses(): void {
  localStorage.removeItem(yakuBonusesKey);
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
