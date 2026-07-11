export type BuildId = 'balanced' | 'tanyao' | 'pinfu' | 'yakuhai';

export interface BuildDef {
  id: BuildId;
  name: string;
  shortName: string;
  label: string;
  difficulty: string;
  description: string;
  bonusText: string;
  targetYaku?: string;
}

export const BUILD_FOCUS_TARGET = 3;
export const BUILD_FOCUS_BONUS = 1200;

export const BUILD_DEFS: Record<BuildId, BuildDef> = {
  balanced: {
    id: 'balanced',
    name: 'Closed Hand',
    shortName: 'CLOSED',
    label: 'Balanced',
    difficulty: 'Easy',
    description: 'No yaku lock-in.',
    bonusText: 'Boss score +15%',
  },
  tanyao: {
    id: 'tanyao',
    name: 'All Simples Engine',
    shortName: 'TANYAO',
    label: 'Simple tiles',
    difficulty: 'Easy',
    description: 'Use numbers 2-8.',
    bonusText: 'Tanyao score +60%',
    targetYaku: 'tanyao',
  },
  pinfu: {
    id: 'pinfu',
    name: 'Sequence Engine',
    shortName: 'PINFU',
    label: 'Shape reading',
    difficulty: 'Medium',
    description: 'Sequences and waits.',
    bonusText: 'Pinfu score +60%',
    targetYaku: 'pinfu',
  },
  yakuhai: {
    id: 'yakuhai',
    name: 'Dragon Engine',
    shortName: 'DRAGON',
    label: 'High variance',
    difficulty: 'Hard',
    description: 'Dragon triplet route.',
    bonusText: 'Yakuhai score +70%',
    targetYaku: 'yakuhai',
  },
};

export function getBuildScoreMultiplier(buildId: BuildId, targetYaku?: string, isBoss: boolean = false): number {
  if (buildId === 'balanced') {
    return isBoss ? 1.15 : 1;
  }

  const build = BUILD_DEFS[buildId];
  if (build.targetYaku && targetYaku === build.targetYaku) {
    return buildId === 'yakuhai' ? 1.7 : 1.6;
  }

  return 1;
}

export function getBuildQuestionType(
  buildId: BuildId,
  round: number,
  isBoss: boolean,
  roll: number = Math.random()
): string | undefined {
  if (buildId === 'balanced' || isBoss || round <= 2) {
    return undefined;
  }

  const build = BUILD_DEFS[buildId];
  if (!build.targetYaku) {
    return undefined;
  }

  return roll < 0.55 ? `yaku-form:${build.targetYaku}` : undefined;
}

export function isBuildRouteMatch(buildId: BuildId, targetYaku?: string): boolean {
  const build = BUILD_DEFS[buildId];
  return !!build.targetYaku && build.targetYaku === targetYaku;
}
