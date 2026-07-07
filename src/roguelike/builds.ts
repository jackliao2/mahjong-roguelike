export type BuildId = 'balanced' | 'tanyao' | 'pinfu' | 'yakuhai';

export interface BuildDef {
  id: BuildId;
  name: string;
  shortName: string;
  description: string;
  bonusText: string;
  targetYaku?: string;
}

export const BUILD_DEFS: Record<BuildId, BuildDef> = {
  balanced: {
    id: 'balanced',
    name: 'Closed Hand',
    shortName: 'CLOSED',
    description: 'Flexible route. No yaku lock-in, stronger boss clears.',
    bonusText: '+15% score on BOSS questions',
  },
  tanyao: {
    id: 'tanyao',
    name: 'All Simples Engine',
    shortName: 'TANYAO',
    description: 'Build around clean 2-8 tile shapes and fast low-risk wins.',
    bonusText: '+60% score on Tanyao questions',
    targetYaku: 'tanyao',
  },
  pinfu: {
    id: 'pinfu',
    name: 'Sequence Engine',
    shortName: 'PINFU',
    description: 'Prioritize sequence reading and efficient two-sided waits.',
    bonusText: '+60% score on Pinfu questions',
    targetYaku: 'pinfu',
  },
  yakuhai: {
    id: 'yakuhai',
    name: 'Dragon Engine',
    shortName: 'DRAGON',
    description: 'Hunt value-tile triplets for fewer but bigger spikes.',
    bonusText: '+70% score on Yakuhai questions',
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
