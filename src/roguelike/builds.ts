import { Tile } from '@/types';
import { isHonorTile, isSimple, tileKey } from '@/game/tiles';

export type BuildId = 'balanced' | 'tanyao' | 'pinfu' | 'yakuhai';

export interface DiscardValueAssessment {
  score: number;
  hanPotential: number;
  route: string;
  reason: string;
}

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

/** Estimate route potential after a discard. This is a strategic heuristic,
 * not a final scoring calculation for an unfinished hand. */
export function assessDiscardValue(hand14: Tile[], discardKey: string, buildId: BuildId): DiscardValueAssessment {
  const discardIndex = hand14.findIndex(tile => tileKey(tile) === discardKey);
  const remaining = [...hand14];
  if (discardIndex >= 0) remaining.splice(discardIndex, 1);

  if (buildId === 'tanyao') {
    const breakers = remaining.filter(tile => !isSimple(tile)).length;
    const score = clamp(100 - breakers * 22);
    return {
      score,
      hanPotential: breakers === 0 ? 2 : breakers <= 2 ? 1 : 0,
      route: 'TANYAO',
      reason: breakers === 0 ? 'All remaining tiles are simples.' : `${breakers} terminal/honor blocker${breakers === 1 ? '' : 's'} remain.`,
    };
  }

  if (buildId === 'yakuhai') {
    const dragonCounts = [1, 2, 3].map(rank => remaining.filter(tile => tile.suit === 'dragon' && tile.rank === rank).length);
    const maxDragons = Math.max(...dragonCounts);
    return {
      score: clamp(maxDragons * 34),
      hanPotential: maxDragons >= 3 ? 2 : maxDragons === 2 ? 1 : 0,
      route: 'YAKUHAI',
      reason: maxDragons >= 3 ? 'Dragon triplet is secured.' : maxDragons === 2 ? 'Dragon pair is one tile from Yakuhai.' : 'No protected dragon pair yet.',
    };
  }

  const suited = remaining.filter(tile => !isHonorTile(tile));
  const connected = suited.filter(tile => suited.some(other =>
    other.id !== tile.id && other.suit === tile.suit && Math.abs(other.rank - tile.rank) <= 2,
  )).length;
  const honors = remaining.length - suited.length;
  const tripletExcess = [...new Set(remaining.map(tileKey))]
    .filter(key => remaining.filter(tile => tileKey(tile) === key).length >= 3).length;
  const connectionScore = remaining.length > 0 ? (connected / remaining.length) * 100 : 0;

  if (buildId === 'pinfu') {
    const score = clamp(connectionScore - honors * 14 - tripletExcess * 10);
    return {
      score,
      hanPotential: score >= 75 ? 2 : score >= 48 ? 1 : 0,
      route: 'PINFU',
      reason: honors > 0 ? `${honors} honor tile${honors === 1 ? '' : 's'} still obstruct a sequence hand.` : 'Connected suited tiles preserve the Pinfu route.',
    };
  }

  const score = clamp(45 + connectionScore * 0.4 - honors * 4);
  return {
    score,
    hanPotential: score >= 72 ? 2 : 1,
    route: 'CLOSED',
    reason: 'Closed-hand value follows shape quality and future riichi potential.',
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
