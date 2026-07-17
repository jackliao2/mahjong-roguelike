/**
 * Quiz question generator for the Mahjong Learning Lab.
 *
 * Generates 4 types of questions:
 * 1. tenpai-win: "Which tile completes this hand to WIN?"
 * 2. yaku-form:  "Which tile makes this a [YAKU] hand?"
 * 3. waiting-tiles: "This hand is READY. What are you waiting for?"
 * 4. discard-best: "Which tile should you discard?"
 *
 * All questions are generated from procedurally built winning hands,
 * so they're always solvable and educationally sound.
 */

import { Tile, Suit } from '@/types';
import { createTile, getTileDisplay, tileKey } from './tiles';
import { detectWin, findWaitingTiles } from './winDetector';
import { checkAllYaku } from './yaku';

// ===== Types =====

export type QuestionType = 'tenpai-win' | 'yaku-form' | 'waiting-tiles' | 'discard-best' | 'ukeire-choice' | 'table-decision' | 'multi-wait' | 'yaku-combo' | 'safe-discard';

export interface QuizQuestion {
  type: QuestionType;
  hand: Tile[];               // 13 tiles (tenpai) or 14 tiles (discard)
  prompt: string;
  options: Tile[];            // 4 options
  correctIndices: number[];   // indices into options (multiple for waiting-tiles)
  explanation: string;
  context?: string;             // table information needed to make the decision
  optionLabels?: string[];      // semantic labels when an option represents more than a tile
  targetYaku?: string;
  isBoss?: boolean;           // BOSS round — styled differently
  chapter?: string;           // e.g. "CH 1: TENPAI"
}

// ===== Helpers =====

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function keyToNotation(key: string): string {
  const [suit, rankText] = key.split('-');
  const rank = Number(rankText);
  if (suit === 'man') return `${rank}m`;
  if (suit === 'pin') return `${rank}p`;
  if (suit === 'sou') return `${rank}s`;
  if (suit === 'wind') return ['E', 'S', 'W', 'N'][rank - 1] ?? key;
  if (suit === 'dragon') return ['Red', 'White', 'Green'][rank - 1] ?? key;
  return key;
}

function tileNotation(tile: Tile): string {
  return keyToNotation(tileKey(tile));
}

const SUITS: Suit[] = ['man', 'pin', 'sou'];
const ALL_SUITS: Suit[] = ['man', 'pin', 'sou', 'wind', 'dragon'];

// Build meld helpers
function buildSequence(suit: Suit, start: number): Tile[] {
  return [createTile(suit, start), createTile(suit, start + 1), createTile(suit, start + 2)];
}

function buildTriplet(suit: Suit, rank: number): Tile[] {
  return [createTile(suit, rank), createTile(suit, rank), createTile(suit, rank)];
}

function buildPair(suit: Suit, rank: number): Tile[] {
  return [createTile(suit, rank), createTile(suit, rank)];
}

/** Build a random winning 14-tile hand (4 melds + 1 pair) */
function buildWinningHand(opts?: { tanyao?: boolean; pinfu?: boolean }): Tile[] {
  const tanyao = opts?.tanyao ?? false;
  const pinfu = opts?.pinfu ?? false;

  for (let attempt = 0; attempt < 50; attempt++) {
    const melds: Tile[][] = [];
    const seqStartMin = tanyao || pinfu ? 2 : 1;
    const seqStartMax = tanyao || pinfu ? 7 : 7;

    for (let i = 0; i < 4; i++) {
      const suit = rand(SUITS);
      const useSequence = pinfu || tanyao || Math.random() < 0.7;
      if (useSequence) {
        melds.push(buildSequence(suit, seqStartMin + Math.floor(Math.random() * (seqStartMax - seqStartMin + 1))));
      } else {
        const rankMin = tanyao ? 2 : 1;
        const rankMax = tanyao ? 8 : 9;
        melds.push(buildTriplet(suit, rankMin + Math.floor(Math.random() * (rankMax - rankMin + 1))));
      }
    }

    const pairSuit = rand(SUITS);
    const pairRankMin = tanyao || pinfu ? 2 : 1;
    const pairRankMax = tanyao || pinfu ? 8 : 9;
    melds.push(buildPair(pairSuit, pairRankMin + Math.floor(Math.random() * (pairRankMax - pairRankMin + 1))));

    const hand = melds.flat();
    if (isValidTileCount(hand)) return hand;
  }
  return buildFallbackHand();
}

function isValidTileCount(hand: Tile[]): boolean {
  const counts: Record<string, number> = {};
  for (const t of hand) {
    const key = tileKey(t);
    counts[key] = (counts[key] || 0) + 1;
    if (counts[key] > 4) return false;
  }
  return true;
}

function buildFallbackHand(): Tile[] {
  return [
    ...buildSequence('man', 1),
    ...buildSequence('pin', 4),
    ...buildSequence('sou', 7),
    ...buildTriplet('man', 8),
    ...buildPair('pin', 2),
  ];
}

/** Random tile of any type (for wrong options) */
function randomTile(exclude: Set<string> = new Set()): Tile | null {
  const candidates: { suit: Suit; rank: number }[] = [];
  for (const suit of ALL_SUITS) {
    const maxRank = suit === 'wind' ? 4 : suit === 'dragon' ? 3 : 9;
    for (let rank = 1; rank <= maxRank; rank++) {
      if (!exclude.has(`${suit}-${rank}`)) {
        candidates.push({ suit, rank });
      }
    }
  }
  if (candidates.length === 0) return null;
  const c = rand(candidates);
  return createTile(c.suit, c.rank);
}

// ===== Question generators =====

/**
 * Type 1: tenpai-win — "Which tile completes this hand to WIN?"
 * Build a winning hand, remove 1 tile, ask which tile wins.
 */
export function generateTenpaiWin(): QuizQuestion {
  for (let attempt = 0; attempt < 80; attempt++) {
    const winning = buildWinningHand();
    const win = detectWin(winning);
    if (!win) continue;

    // Remove a random tile
    const removeIdx = Math.floor(Math.random() * 14);
    const removed = winning.splice(removeIdx, 1)[0];
    const hand13 = winning;

    const waiting = findWaitingTiles(hand13);
    if (waiting.length === 0) continue;

    // Correct = removed tile (guaranteed to be a waiting tile)
    const correctKey = tileKey(removed);
    // Verify removed tile is in waiting list
    if (!waiting.includes(correctKey)) continue;

    // Wrong options: tiles NOT in waiting list
    const waitingSet = new Set(waiting);
    const wrongTiles: Tile[] = [];
    for (let i = 0; i < 30 && wrongTiles.length < 3; i++) {
      const t = randomTile(waitingSet);
      if (t && !wrongTiles.some(w => tileKey(w) === tileKey(t))) {
        wrongTiles.push(t);
      }
    }
    if (wrongTiles.length < 3) continue;

    const options = shuffle([removed, ...wrongTiles]);
    const correctIndex = options.findIndex(t => t.id === removed.id);

    return {
      type: 'tenpai-win',
      hand: hand13,
      prompt: 'Which tile completes this hand to WIN?',
      options,
      correctIndices: [correctIndex],
      explanation: `Waits: ${waiting.map(keyToNotation).join(', ')}. ${keyToNotation(correctKey)} completes the four-groups-and-a-pair structure.`,
    };
  }
  // Fallback (should rarely happen)
  return generateFallback();
}

/**
 * Type 2: yaku-form — "Which tile makes this a [YAKU] hand?"
 * Build a winning hand with the target yaku, remove 1 tile, ask which restores it.
 */
export function generateYakuForm(targetYaku: string): QuizQuestion {
  const yakuNames: Record<string, string> = {
    tanyao: 'TANYAO',
    pinfu: 'PINFU',
    yakuhai: 'YAKUHAI',
  };
  const yakuDisplay = yakuNames[targetYaku] || targetYaku.toUpperCase();

  for (let attempt = 0; attempt < 80; attempt++) {
    const opts: { tanyao?: boolean; pinfu?: boolean } = {};
    if (targetYaku === 'tanyao') opts.tanyao = true;
    if (targetYaku === 'pinfu') opts.pinfu = true;
    if (targetYaku === 'yakuhai') {
      // Yakuhai needs a dragon triplet — build manually
      return generateYakuhaiForm();
    }

    const winning = buildWinningHand(opts);
    const win = detectWin(winning);
    if (!win) continue;

    // Verify the yaku is present (use riichi=true to include riichi-dependent checks)
    const yakuList = checkAllYaku(win, winning, true);
    const hasTarget = yakuList.some(y => y.yaku.id === targetYaku);
    if (!hasTarget) continue;

    // Remove a tile from a sequence (safest for preserving yaku structure)
    // Find a tile whose removal still allows the target yaku when restored
    const indices = shuffle(range(14));
    let found = false;
    let removedTile: Tile | null = null;
    let hand13: Tile[] = [];

    for (const idx of indices) {
      const testHand = [...winning];
      const removed = testHand.splice(idx, 1)[0];
      const waiting = findWaitingTiles(testHand);
      if (waiting.length === 0) continue;

      // Check that adding the removed tile back restores the yaku
      const restoredWin = detectWin([...testHand, removed]);
      if (!restoredWin) continue;
      const restoredYaku = checkAllYaku(restoredWin, [...testHand, removed], true);
      if (restoredYaku.some(y => y.yaku.id === targetYaku)) {
        removedTile = removed;
        hand13 = testHand;
        found = true;
        break;
      }
    }
    if (!found) continue;

    // Wrong options: tiles that DON'T complete the hand, or complete without the yaku
    const wrongTiles: Tile[] = [];
    const waiting = findWaitingTiles(hand13);
    const waitingSet = new Set(waiting);

    for (let i = 0; i < 40 && wrongTiles.length < 3; i++) {
      const t = randomTile(new Set([tileKey(removedTile!)]));
      if (!t) continue;
      if (wrongTiles.some(w => tileKey(w) === tileKey(t))) continue;

      // Check if this tile completes the hand
      const testWin = detectWin([...hand13, t]);
      if (testWin) {
        // It completes the hand — check if it has the target yaku
        const testYaku = checkAllYaku(testWin, [...hand13, t], true);
        if (testYaku.some(y => y.yaku.id === targetYaku)) {
          // This would also be correct — skip it (don't use as wrong)
          continue;
        }
        // Completes hand but without target yaku — good wrong option
        wrongTiles.push(t);
      } else {
        // Doesn't complete — good wrong option
        wrongTiles.push(t);
      }
    }
    if (wrongTiles.length < 3) continue;

    const options = shuffle([removedTile!, ...wrongTiles]);
    const correctIndex = options.findIndex(t => t.id === removedTile!.id);

    return {
      type: 'yaku-form',
      hand: hand13,
      prompt: `Which tile makes this a ${yakuDisplay} hand?`,
      options,
      correctIndices: [correctIndex],
      targetYaku,
      explanation: `Adding ${tileNotation(removedTile!)} completes the hand with ${yakuDisplay}.\nWinning tiles: ${waiting.map(keyToNotation).join(', ')}`,
    };
  }
  return generateFallback();
}

/** Special case: yakuhai needs a dragon/wind triplet */
function generateYakuhaiForm(): QuizQuestion {
  for (let attempt = 0; attempt < 80; attempt++) {
    const melds: Tile[][] = [];
    for (let i = 0; i < 3; i++) {
      const suit = rand(SUITS);
      const start = 1 + Math.floor(Math.random() * 7);
      melds.push(buildSequence(suit, start));
    }
    const dragonRank = 1 + Math.floor(Math.random() * 3);
    melds.push(buildTriplet('dragon', dragonRank));
    const pairSuit = rand(SUITS);
    const pairRank = 1 + Math.floor(Math.random() * 9);
    melds.push(buildPair(pairSuit, pairRank));

    const winning = melds.flat();
    if (!isValidTileCount(winning)) continue;
    
    const win = detectWin(winning);
    if (!win) continue;

    const yakuList = checkAllYaku(win, winning, true);
    if (!yakuList.some(y => y.yaku.id === 'yakuhai')) continue;

    const dragonIdx = winning.findIndex(t => t.suit === 'dragon' && t.rank === dragonRank);
    if (dragonIdx === -1) continue;
    const removed = winning.splice(dragonIdx, 1)[0];
    const hand13 = winning;

    const waiting = findWaitingTiles(hand13);
    if (waiting.length === 0) continue;
    if (!waiting.includes(tileKey(removed))) continue;

    const waitingSet = new Set(waiting);
    const wrongTiles: Tile[] = [];
    for (let i = 0; i < 30 && wrongTiles.length < 3; i++) {
      const t = randomTile(waitingSet);
      if (!t) continue;
      if (wrongTiles.some(w => tileKey(w) === tileKey(t))) continue;
      const testWin = detectWin([...hand13, t]);
      if (testWin) {
        const testYaku = checkAllYaku(testWin, [...hand13, t], true);
        if (testYaku.some(y => y.yaku.id === 'yakuhai')) continue;
      }
      wrongTiles.push(t);
    }
    if (wrongTiles.length < 3) continue;

    const options = shuffle([removed, ...wrongTiles]);
    const correctIndex = options.findIndex(t => t.id === removed.id);

    return {
      type: 'yaku-form',
      hand: hand13,
      prompt: 'Which tile makes this a YAKUHAI hand?',
      options,
      correctIndices: [correctIndex],
      targetYaku: 'yakuhai',
      explanation: `Adding ${tileNotation(removed)} completes the dragon triplet for YAKUHAI.`,
    };
  }
  return generateFallback();
}

/**
 * Type 3: waiting-tiles — "This hand is READY. Which tile are you waiting for?"
 * Multiple correct answers possible.
 */
export function generateWaitingTiles(): QuizQuestion {
  for (let attempt = 0; attempt < 80; attempt++) {
    const winning = buildWinningHand();
    const win = detectWin(winning);
    if (!win) continue;

    const removeIdx = Math.floor(Math.random() * 14);
    winning.splice(removeIdx, 1)[0];
    const hand13 = winning;

    const waiting = findWaitingTiles(hand13);
    // Want hands with 1-3 waiting tiles for good quiz options
    if (waiting.length === 0 || waiting.length > 4) continue;

    const waitingSet = new Set(waiting);
    const waitingTileObjs = waiting.map(key => {
      const [suit, rank] = key.split('-');
      return createTile(suit as Suit, parseInt(rank));
    });

    // Fill remaining slots with non-waiting tiles
    const wrongCount = Math.max(1, 4 - waitingTileObjs.length);
    const wrongTiles: Tile[] = [];
    for (let i = 0; i < 30 && wrongTiles.length < wrongCount; i++) {
      const t = randomTile(waitingSet);
      if (!t) continue;
      if (wrongTiles.some(w => tileKey(w) === tileKey(t))) continue;
      wrongTiles.push(t);
    }
    if (wrongTiles.length < wrongCount) continue;

    const options = shuffle([...waitingTileObjs, ...wrongTiles]);
    const correctIndices = options
      .map((t, i) => (waitingSet.has(tileKey(t)) ? i : -1))
      .filter(i => i >= 0);

    return {
      type: 'waiting-tiles',
      hand: hand13,
      prompt: 'This hand is READY (tenpai). Which tile are you waiting for?',
      options,
      correctIndices,
      explanation: `Winning tiles: ${waiting.map(keyToNotation).join(', ')}. Each one completes a legal hand shape.`,
    };
  }
  return generateFallback();
}

/**
 * Type 4: discard-best — "Which tile should you discard?"
 * Give a 14-tile hand, pick the best discard.
 */
export function generateDiscardBest(): QuizQuestion {
  for (let attempt = 0; attempt < 80; attempt++) {
    const melds: Tile[][] = [];
    const suits = SUITS;
    for (let i = 0; i < 3; i++) {
      const suit = rand(suits);
      const start = 1 + Math.floor(Math.random() * 7);
      melds.push(buildSequence(suit, start));
    }

    const pairSuit = rand(suits);
    const pairRank = 2 + Math.floor(Math.random() * 7);
    melds.push(buildPair(pairSuit, pairRank));

    const honorSuit = rand(['wind', 'dragon'] as Suit[]);
    const honorRank = honorSuit === 'wind' ? 1 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 3);
    const badTile = createTile(honorSuit, honorRank);
    melds.push([badTile]);

    const hand14 = melds.flat();
    if (hand14.length !== 14) continue;
    if (!isValidTileCount(hand14)) continue;
    if (detectWin(hand14)) continue;

    const otherTiles = hand14.filter(t => t.id !== badTile.id);
    const wrongTiles = shuffle(otherTiles).slice(0, 3);
    if (wrongTiles.length < 3) continue;

    const options = shuffle([badTile, ...wrongTiles]);
    const correctIndex = options.findIndex(t => t.id === badTile.id);

    return {
      type: 'discard-best',
      hand: hand14,
      prompt: 'Which tile should you discard for best efficiency?',
      options,
      correctIndices: [correctIndex],
      explanation: `${tileNotation(badTile)} is an isolated honor: it cannot form a sequence and has no matching copy here. Cutting it preserves the connected shapes.`,
    };
  }
  return generateFallback();
}

interface DiscardMetric {
  tile: Tile;
  waits: string[];
  liveTiles: number;
}

/** Count remaining winning tiles after discarding one tile type. */
function measureDiscardUkeire(hand14: Tile[], discardKey: string): DiscardMetric | null {
  const discardIndex = hand14.findIndex(tile => tileKey(tile) === discardKey);
  if (discardIndex < 0) return null;
  const hand13 = [...hand14];
  const [discarded] = hand13.splice(discardIndex, 1);
  const waits = findWaitingTiles(hand13);
  const visibleCounts = new Map<string, number>();
  hand14.forEach(tile => visibleCounts.set(tileKey(tile), (visibleCounts.get(tileKey(tile)) ?? 0) + 1));
  const liveTiles = waits.reduce((sum, wait) => sum + Math.max(0, 4 - (visibleCounts.get(wait) ?? 0)), 0);
  return { tile: discarded, waits, liveTiles };
}

/**
 * Authentic efficiency question: every candidate is evaluated by the win
 * detector, and the answer is the unique discard with the most live tiles.
 */
export function generateUkeireChoice(): QuizQuestion {
  for (let attempt = 0; attempt < 300; attempt++) {
    const winning = buildWinningHand();
    if (!detectWin(winning)) continue;
    winning.splice(Math.floor(Math.random() * winning.length), 1);
    if (findWaitingTiles(winning).length === 0) continue;

    const extra = randomTile();
    if (!extra) continue;
    const hand14 = [...winning, extra];
    if (!isValidTileCount(hand14) || detectWin(hand14)) continue;

    const uniqueKeys = [...new Set(hand14.map(tileKey))];
    const metrics = uniqueKeys
      .map(key => measureDiscardUkeire(hand14, key))
      .filter((metric): metric is DiscardMetric => metric !== null)
      .sort((a, b) => b.liveTiles - a.liveTiles);
    if (metrics.length < 4 || metrics[0].liveTiles <= 0) continue;
    if (metrics[0].liveTiles === metrics[1].liveTiles || metrics[1].liveTiles <= 0) continue;

    // Use the strongest alternatives, so the question compares plausible
    // choices instead of padding the answers with obviously dead tiles.
    const candidates = metrics.slice(0, 4);
    const options = shuffle(candidates.map(metric => metric.tile));
    const bestKey = tileKey(metrics[0].tile);
    const correctIndex = options.findIndex(tile => tileKey(tile) === bestKey);
    const metricByKey = new Map(candidates.map(metric => [tileKey(metric.tile), metric]));
    const breakdown = options.map(tile => {
      const metric = metricByKey.get(tileKey(tile))!;
      const waits = metric.waits.length ? metric.waits.map(keyToNotation).join('/') : 'none';
      return `${tileNotation(tile)} → ${metric.liveTiles} live (${waits})`;
    }).join(' · ');

    return {
      type: 'ukeire-choice',
      hand: hand14,
      prompt: 'Which discard gives the highest UKEIRE?',
      context: 'Count every unseen tile that leaves this hand ready to win.',
      options,
      correctIndices: [correctIndex],
      explanation: `${tileNotation(metrics[0].tile)} has the largest verified acceptance: ${metrics[0].liveTiles} live tiles.\n${breakdown}`,
    };
  }
  return generateDiscardBest();
}

type TableDecision = {
  context: string;
  prompt: string;
  choices: string[];
  correct: string;
  explanation: string;
};

const TABLE_DECISIONS: TableDecision[] = [
  {
    context: 'EAST 1 · NON-DEALER · TURN 5 · CLOSED RYANMEN TENPAI · NO YAKU · NO THREATS',
    prompt: 'What is the best default decision?',
    choices: ['RIICHI', 'STAY DAMA', 'FOLD'],
    correct: 'RIICHI',
    explanation: 'RIICHI gives this closed no-yaku hand a legal yaku for ron, adds value, and pressures the table. With an early two-sided wait and no threat, folding wastes a strong tenpai.',
  },
  {
    context: 'SOUTH 4 · 2ND PLACE · 700 BEHIND · TURN 8 · CLOSED TANYAO · RYANMEN · 1,000-POINT RON IS ENOUGH',
    prompt: 'How should you play the tenpai?',
    choices: ['RIICHI', 'STAY DAMA', 'FOLD'],
    correct: 'STAY DAMA',
    explanation: 'STAY DAMA. Tanyao already supplies a yaku, and the current hand value is enough to take first. Concealing tenpai avoids announcing the wait and keeps every opponent discard live.',
  },
  {
    context: 'SOUTH 4 · 1ST PLACE BY 12,000 · TURN 15 · DEALER RIICHI · YOUR HAND IS 1-SHANTEN, CHEAP · TWO GENBUTSU AVAILABLE',
    prompt: 'What protects the win condition?',
    choices: ['PUSH', 'STAY DAMA', 'FOLD'],
    correct: 'FOLD',
    explanation: 'FOLD with genbutsu. A late, cheap 1-shanten hand does not justify risking a large first-place lead against dealer riichi. Placement value matters more than hand completion here.',
  },
  {
    context: 'EAST 3 · DEALER · TURN 6 · CLOSED PINFU + DORA 1 · RYANMEN TENPAI · NO THREATS',
    prompt: 'What is the strongest default?',
    choices: ['RIICHI', 'STAY DAMA', 'FOLD'],
    correct: 'RIICHI',
    explanation: 'RIICHI is the strong default: early dealer ryanmen, existing value, and no opposing threat. The declaration raises the hand from a modest dama win toward a much more valuable dealer score.',
  },
];

/** Curated placement and pressure decisions with intentionally clear defaults. */
export function generateTableDecision(): QuizQuestion {
  const scenario = rand(TABLE_DECISIONS);
  const iconTiles = [createTile('wind', 1), createTile('pin', 5), createTile('dragon', 2)];
  const options = scenario.choices.map((_, index) => iconTiles[index]);
  const correctIndex = scenario.choices.indexOf(scenario.correct);
  return {
    type: 'table-decision',
    hand: [],
    prompt: scenario.prompt,
    context: scenario.context,
    options,
    optionLabels: scenario.choices,
    correctIndices: [correctIndex],
    explanation: scenario.explanation,
  };
}

/**
 * Type 5: multi-wait
 */
export function generateMultiWait(): QuizQuestion {
  for (let attempt = 0; attempt < 100; attempt++) {
    const winning = buildWinningHand();
    const win = detectWin(winning);
    if (!win) continue;
    const removeIdx = Math.floor(Math.random() * 14);
    winning.splice(removeIdx, 1)[0];
    const hand13 = winning;
    const waiting = findWaitingTiles(hand13);
    if (waiting.length < 3 || waiting.length > 5) continue;
    const waitingSet = new Set(waiting);
    const waitingTileObjs = waiting.map(key => {
      const [suit, rank] = key.split('-');
      return createTile(suit as Suit, parseInt(rank));
    });
    const wrongCount = Math.max(1, 4 - waitingTileObjs.length);
    const wrongTiles: Tile[] = [];
    for (let i = 0; i < 30 && wrongTiles.length < wrongCount; i++) {
      const t = randomTile(waitingSet);
      if (!t) continue;
      if (wrongTiles.some(w => tileKey(w) === tileKey(t))) continue;
      wrongTiles.push(t);
    }
    if (wrongTiles.length < wrongCount) continue;
    const options = shuffle([...waitingTileObjs, ...wrongTiles]);
    const correctIndices = options.map((t, i) => (waitingSet.has(tileKey(t)) ? i : -1)).filter(i => i >= 0);
    return { type: 'multi-wait', hand: hand13, prompt: 'Which option is one of this hand\'s multiple waits?', options, correctIndices, explanation: `This shape has ${waiting.length} winning tile types: ${waiting.map(keyToNotation).join(', ')}.` };
  }
  return generateFallback();
}

export function generateYakuCombo(): QuizQuestion {
  for (let attempt = 0; attempt < 80; attempt++) {
    const winning = buildWinningHand();
    const win = detectWin(winning);
    if (!win) continue;
    // Riichi is a declaration, not a pattern visible in the tiles. Only ask
    // about yaku the player can actually infer from this completed hand.
    const visibleYaku = checkAllYaku(win, winning, false)
      .filter(match => ['tanyao', 'pinfu', 'yakuhai'].includes(match.yaku.id));
    if (visibleYaku.length === 0) continue;
    const correctYakuId = rand(visibleYaku).yaku.id;
    const correctYakuName = correctYakuId.toUpperCase();
    const allYakuOptions = ['TANYAO', 'PINFU', 'YAKUHAI', 'RIICHI'];
    const wrongOptions = allYakuOptions.filter(y => y !== correctYakuName).slice(0, 3);
    if (wrongOptions.length < 3) continue;

    const optionTiles: Tile[] = [];
    const yakuTileMap: Record<string, { suit: Suit; rank: number }> = {
      'TANYAO': { suit: 'man', rank: 5 },
      'PINFU': { suit: 'pin', rank: 5 },
      'YAKUHAI': { suit: 'dragon', rank: 1 },
      'RIICHI': { suit: 'wind', rank: 1 },
    };

    [correctYakuName, ...wrongOptions].forEach(name => {
      const tileDef = yakuTileMap[name];
      if (tileDef) {
        optionTiles.push(createTile(tileDef.suit, tileDef.rank));
      }
    });

    const options = shuffle(optionTiles);
    const optionLabels = options.map(t => (
      t.suit === 'man' ? 'TANYAO'
        : t.suit === 'pin' ? 'PINFU'
          : t.suit === 'dragon' ? 'YAKUHAI'
            : 'RIICHI'
    ));
    const correctIndex = options.findIndex(t => {
      const name = t.suit === 'man' ? 'TANYAO' : t.suit === 'pin' ? 'PINFU' : t.suit === 'dragon' ? 'YAKUHAI' : 'RIICHI';
      return name === correctYakuName;
    });
    if (correctIndex === -1) continue;

    return {
      type: 'yaku-combo',
      hand: winning,
      prompt: 'Which of these YAKU is visible in the completed hand?',
      options,
      optionLabels,
      correctIndices: [correctIndex],
      explanation: `This hand visibly satisfies ${correctYakuName}. RIICHI is not inferable from the tiles alone because it requires a declaration.`,
      targetYaku: correctYakuId,
    };
  }
  return generateFallback();
}

export function generateSafeDiscard(): QuizQuestion {
  for (let attempt = 0; attempt < 80; attempt++) {
    const melds: Tile[][] = [];
    for (let i = 0; i < 3; i++) { 
      melds.push(buildSequence(rand(SUITS), 2 + Math.floor(Math.random() * 6))); 
    }
    melds.push(buildPair(rand(SUITS), 2 + Math.floor(Math.random() * 7)));
    
    // The correct option is genbutsu: a tile already discarded by the
    // riichi player. It is therefore 100% safe against ron from that player.
    const safeTile = randomTile();
    if (!safeTile) continue;
    melds.push([safeTile]);
    melds.push([
      createTile(rand(SUITS), 2 + Math.floor(Math.random() * 6)),
      createTile(rand(SUITS), 2 + Math.floor(Math.random() * 6)),
    ]);
    
    const hand14 = melds.flat();
    if (hand14.length !== 14) continue;
    if (!isValidTileCount(hand14)) continue;
    if (detectWin(hand14)) continue;
    
    const safeKey = tileKey(safeTile);
    const wrongTiles: Tile[] = [];
    for (const tile of shuffle(hand14.filter(t => tileKey(t) !== safeKey))) {
      if (wrongTiles.some(wrong => tileKey(wrong) === tileKey(tile))) continue;
      wrongTiles.push(tile);
      if (wrongTiles.length === 3) break;
    }
    if (wrongTiles.length < 3) continue;

    const river: Tile[] = [createTile(safeTile.suit, safeTile.rank)];
    const riverKeys = new Set([safeKey]);
    for (let i = 0; i < 40 && river.length < 6; i++) {
      const tile = randomTile(new Set([...riverKeys, ...wrongTiles.map(tileKey)]));
      if (!tile) continue;
      river.push(tile);
      riverKeys.add(tileKey(tile));
    }
    if (river.length < 6) continue;
    const shuffledRiver = shuffle(river);
    
    const options = shuffle([safeTile, ...wrongTiles]);
    const correctIndex = options.findIndex(t => t.id === safeTile.id);
    
    return { 
      type: 'safe-discard', 
      hand: hand14, 
      prompt: 'Opponent declared RIICHI. Which discard is guaranteed safe?',
      context: `RIICHI PLAYER'S RIVER: ${shuffledRiver.map(tileNotation).join(' · ')}`,
      options, 
      correctIndices: [correctIndex], 
      explanation: `${getTileDisplay(safeTile).englishName} is genbutsu: the riichi player already discarded it, so furiten prevents them from winning by ron on that tile. The other choices are not proven safe from the river alone.`,
    };
  }
  return generateFallback();
}
// ===== Chapter / BOSS system =====

/** Chapter metadata for a given round. Every 3rd round is a BOSS. */
export interface ChapterInfo {
  chapter: string;     // e.g. "CH 1"
  title: string;       // e.g. "TENPAI BASICS"
  isBoss: boolean;
}

const CHAPTER_DEFS: { name: string; title: string }[] = [
  { name: 'CH 1', title: 'TENPAI BASICS' },
  { name: 'CH 2', title: 'TANYAO PATH' },
  { name: 'CH 3', title: 'PINFU MASTERY' },
  { name: 'CH 4', title: 'RIICHI DEFENSE' },
  { name: 'CH 5', title: 'ADVANCED TRIALS' },
];

export function getChapterForRound(round: number): ChapterInfo {
  // Chapter index (0-based): rounds 1-3 → ch0, 4-6 → ch1, etc.
  const chIdx = Math.floor((round - 1) / 3);
  const within = ((round - 1) % 3); // 0,1,2
  const isBoss = within === 2;
  const def = CHAPTER_DEFS[Math.min(chIdx, CHAPTER_DEFS.length - 1)];
  return { chapter: def.name, title: def.title, isBoss };
}

// ===== Round-based generation =====

/** Generate a question for the given round number */
export function generateQuestionForRound(round: number, maxRounds: number = 8, forcedType?: string): QuizQuestion {
  const ch = getChapterForRound(round);
  let q: QuizQuestion;

  if (forcedType) {
    const [type, detail] = forcedType.split(':');
    switch (type) {
      case 'tenpai-win': q = generateTenpaiWin(); break;
      case 'waiting-tiles': q = generateWaitingTiles(); break;
      case 'yaku-form': q = generateYakuForm(detail || 'tanyao'); break;
      case 'discard-best': q = generateDiscardBest(); break;
      case 'ukeire-choice': q = generateUkeireChoice(); break;
      case 'table-decision': q = generateTableDecision(); break;
      case 'safe-discard': q = generateSafeDiscard(); break;
      case 'multi-wait': q = generateMultiWait(); break;
      case 'yaku-combo': q = generateYakuCombo(); break;
      default: q = generateTenpaiWin(); break;
    }
  } else {
    if (round <= 2) {
      q = generateTenpaiWin();
    } else if (round === 3) {
      q = generateMultiWait();
    } else if (round === 4 || round === 5) {
      q = generateYakuForm('tanyao');
    } else if (round === 6) {
      q = generateSafeDiscard();
    } else if (round === 7) {
      q = generateUkeireChoice();
    } else if (round === 8) {
      q = generateYakuForm('pinfu');
    } else if (round === 9) {
      q = generateTableDecision();
    } else if (round === 10 || round === 11) {
      q = generateSafeDiscard();
    } else if (round === 12) {
      q = generateSafeDiscard();
    } else {
      const generators = [
        generateTenpaiWin,
        generateWaitingTiles,
        generateDiscardBest,
        generateUkeireChoice,
        generateTableDecision,
        generateMultiWait,
        generateYakuCombo,
        generateSafeDiscard,
        generateSafeDiscard,
      ];
      q = rand(generators)();
    }
  }

  q.isBoss = ch.isBoss;
  q.chapter = `${ch.chapter}: ${ch.title}`;
  return q;
}

// ===== Fallback =====

function generateFallback(): QuizQuestion {
  // Simple known tenpai hand: 123m 456p 789s 23m + waiting 1m or 4m
  const hand: Tile[] = [
    ...buildSequence('man', 1),
    ...buildSequence('pin', 4),
    ...buildSequence('sou', 7),
    createTile('man', 2), createTile('man', 3),
    ...buildPair('pin', 9),
  ];
  // hand is 13 tiles, waiting on 1m or 4m
  const correct = createTile('man', 1);
  const wrong1 = createTile('man', 5);
  const wrong2 = createTile('sou', 1);
  const wrong3 = createTile('dragon', 1);
  const options = shuffle([correct, wrong1, wrong2, wrong3]);
  const correctIndex = options.findIndex(t => t.id === correct.id);

  return {
    type: 'tenpai-win',
    hand,
    prompt: 'Which tile completes this hand to WIN?',
    options,
    correctIndices: [correctIndex],
    explanation: 'The hand is waiting on 1m or 4m to complete the 23m ryanmen.',
  };
}
