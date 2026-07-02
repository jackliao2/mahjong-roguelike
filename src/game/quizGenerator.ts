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
import { createTile, tileKey } from './tiles';
import { detectWin, findWaitingTiles } from './winDetector';
import { checkAllYaku } from './yaku';

// ===== Types =====

export type QuestionType = 'tenpai-win' | 'yaku-form' | 'waiting-tiles' | 'discard-best' | 'multi-wait' | 'yaku-combo' | 'safe-discard';

export interface QuizQuestion {
  type: QuestionType;
  hand: Tile[];               // 13 tiles (tenpai) or 14 tiles (discard)
  prompt: string;
  options: Tile[];            // 4 options
  correctIndices: number[];   // indices into options (multiple for waiting-tiles)
  explanation: string;
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

  const melds: Tile[][] = [];
  // Sequence start range: tanyao/pinfu → 2-7 (so sequences are 234..678), normal → 1-7
  const seqStartMin = tanyao || pinfu ? 2 : 1;
  const seqStartMax = tanyao || pinfu ? 7 : 7;

  for (let i = 0; i < 4; i++) {
    const suit = rand(SUITS);
    // Pinfu: always sequences. Tanyao: mostly sequences. Normal: mix.
    const useSequence = pinfu || tanyao || Math.random() < 0.7;
    if (useSequence) {
      melds.push(buildSequence(suit, seqStartMin + Math.floor(Math.random() * (seqStartMax - seqStartMin + 1))));
    } else {
      const rankMin = tanyao ? 2 : 1;
      const rankMax = tanyao ? 8 : 9;
      melds.push(buildTriplet(suit, rankMin + Math.floor(Math.random() * (rankMax - rankMin + 1))));
    }
  }

  // Pair: tanyao/pinfu → simple suited tile (2-8), normal → any
  const pairSuit = rand(SUITS);
  const pairRankMin = tanyao || pinfu ? 2 : 1;
  const pairRankMax = tanyao || pinfu ? 8 : 9;
  melds.push(buildPair(pairSuit, pairRankMin + Math.floor(Math.random() * (pairRankMax - pairRankMin + 1))));

  return melds.flat();
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
      explanation: `The hand is tenpai, waiting on: ${waiting.join(', ')}. Drawing ${correctKey} wins!`,
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
      explanation: `Adding ${tileKey(removedTile!)} completes the hand with ${yakuDisplay}.\nWaiting tiles: ${waiting.join(', ')}`,
    };
  }
  return generateFallback();
}

/** Special case: yakuhai needs a dragon/wind triplet */
function generateYakuhaiForm(): QuizQuestion {
  for (let attempt = 0; attempt < 80; attempt++) {
    const melds: Tile[][] = [];
    // 3 sequences
    for (let i = 0; i < 3; i++) {
      const suit = rand(SUITS);
      const start = 1 + Math.floor(Math.random() * 7);
      melds.push(buildSequence(suit, start));
    }
    // 1 dragon triplet (yakuhai)
    const dragonRank = 1 + Math.floor(Math.random() * 3); // 1=Red, 2=White, 3=Green
    melds.push(buildTriplet('dragon', dragonRank));
    // Pair
    const pairSuit = rand(SUITS);
    const pairRank = 1 + Math.floor(Math.random() * 9);
    melds.push(buildPair(pairSuit, pairRank));

    const winning = melds.flat();
    const win = detectWin(winning);
    if (!win) continue;

    const yakuList = checkAllYaku(win, winning, true);
    if (!yakuList.some(y => y.yaku.id === 'yakuhai')) continue;

    // Remove one tile from the dragon triplet
    const dragonIdx = winning.findIndex(t => t.suit === 'dragon' && t.rank === dragonRank);
    if (dragonIdx === -1) continue;
    const removed = winning.splice(dragonIdx, 1)[0];
    const hand13 = winning;

    const waiting = findWaitingTiles(hand13);
    if (waiting.length === 0) continue;
    if (!waiting.includes(tileKey(removed))) continue;

    // Wrong options
    const waitingSet = new Set(waiting);
    const wrongTiles: Tile[] = [];
    for (let i = 0; i < 30 && wrongTiles.length < 3; i++) {
      const t = randomTile(waitingSet);
      if (!t) continue;
      if (wrongTiles.some(w => tileKey(w) === tileKey(t))) continue;
      // Don't use a tile that also completes with yakuhai
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
      explanation: `Adding ${tileKey(removed)} completes the dragon triplet for YAKUHAI.`,
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
      explanation: `Waiting on: ${waiting.join(', ')}. Any of these completes the hand.`,
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
    // Build a hand with an obvious bad tile (isolated honor or terminal)
    const melds: Tile[][] = [];
    const suits = SUITS;
    for (let i = 0; i < 3; i++) {
      const suit = rand(suits);
      const start = 1 + Math.floor(Math.random() * 7);
      melds.push(buildSequence(suit, start));
    }
    // Add a pair
    const pairSuit = rand(suits);
    const pairRank = 2 + Math.floor(Math.random() * 7);
    melds.push(buildPair(pairSuit, pairRank));

    // Add an isolated honor tile (the "bad" tile to discard)
    const honorSuit = rand(['wind', 'dragon'] as Suit[]);
    const honorRank = honorSuit === 'wind' ? 1 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 3);
    const badTile = createTile(honorSuit, honorRank);
    melds.push([badTile]);

    const hand14 = melds.flat();
    if (hand14.length !== 14) continue;
    // Should not be a winning hand
    if (detectWin(hand14)) continue;

    // The best discard is the isolated honor tile
    // Wrong options: 3 other tiles from the hand (from sequences/pair)
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
      explanation: `${tileKey(badTile).toUpperCase()} is an isolated honor tile — it can't form a sequence and is hard to pair. Discard it first.`,
    };
  }
  return generateFallback();
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
    return { type: 'multi-wait', hand: hand13, prompt: 'This hand has MULTIPLE waits. Which tiles are you waiting for?', options, correctIndices, explanation: 'Multi-wait! Waiting on ' + waiting.length + ' tiles: ' + waiting.join(', ') + '.' };
  }
  return generateFallback();
}

export function generateYakuCombo(): QuizQuestion {
  for (let attempt = 0; attempt < 80; attempt++) {
    const winning = buildWinningHand();
    const win = detectWin(winning);
    if (!win) continue;
    const yakuList = checkAllYaku(win, winning, true);
    if (yakuList.length === 0) continue;
    const correctYakuId = yakuList[0].yaku.id;
    const correctYakuName = correctYakuId.toUpperCase();
    const allYakuOptions = ['TANYAO', 'PINFU', 'YAKUHAI', 'RIICHI', 'IPPATSU', 'MENZEN'];
    const wrongOptions = allYakuOptions.filter(y => y !== correctYakuName).slice(0, 3);
    const options = shuffle([correctYakuName, ...wrongOptions.slice(0, 3)]);
    const correctIndex = options.indexOf(correctYakuName);
    return { type: 'yaku-combo', hand: winning, prompt: 'This hand wins! Which YAKU does it have?', options: options.map(name => ({ id: name, suit: 'dragon' as Suit, rank: 1 })), correctIndices: [correctIndex], explanation: 'This hand has ' + correctYakuName + '.', targetYaku: correctYakuId };
  }
  return generateFallback();
}

export function generateSafeDiscard(): QuizQuestion {
  for (let attempt = 0; attempt < 80; attempt++) {
    const melds: Tile[][] = [];
    for (let i = 0; i < 3; i++) { melds.push(buildSequence(rand(SUITS), 2 + Math.floor(Math.random() * 6))); }
    melds.push(buildPair(rand(SUITS), 2 + Math.floor(Math.random() * 7)));
    const useTerminal = Math.random() < 0.5;
    let safeTile: Tile;
    if (useTerminal) { safeTile = createTile(rand(SUITS), Math.random() < 0.5 ? 1 : 9); }
    else { const hs = rand(['wind','dragon'] as Suit[]); safeTile = createTile(hs, hs === 'wind' ? 1 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 3)); }
    melds.push([safeTile]);
    const hand14 = melds.flat();
    if (hand14.length !== 14 || detectWin(hand14)) continue;
    const wrongTiles = shuffle(hand14.filter(t => t.id !== safeTile.id)).slice(0, 3);
    if (wrongTiles.length < 3) continue;
    const options = shuffle([safeTile, ...wrongTiles]);
    return { type: 'safe-discard', hand: hand14, prompt: 'Someone declared RIICHI! Which tile is SAFEST to discard?', options, correctIndices: [options.findIndex(t => t.id === safeTile.id)], explanation: tileKey(safeTile).toUpperCase() + ' is safest!' };
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
  { name: 'CH 4', title: 'YAKUHAI DRAGONS' },
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
export function generateQuestionForRound(round: number, maxRounds: number = 8): QuizQuestion {
  const ch = getChapterForRound(round);
  let q: QuizQuestion;

  // Chapter 1 (1-2): tenpai-win basics; BOSS at 3 = multi-wait
  // Chapter 2 (4-5): tanyao; BOSS at 6 = safe-discard
  // Chapter 3 (7-8): pinfu; BOSS at 9 = yaku-combo
  // Chapter 4 (10-11): yakuhai; BOSS at 12 = mixed (final)
  if (round <= 2) {
    q = generateTenpaiWin();
  } else if (round === 3) {
    q = generateMultiWait();
  } else if (round === 4 || round === 5) {
    q = generateYakuForm('tanyao');
  } else if (round === 6) {
    q = generateSafeDiscard();
  } else if (round === 7 || round === 8) {
    q = generateYakuForm('pinfu');
  } else if (round === 9) {
    q = generateYakuCombo();
  } else if (round === 10 || round === 11) {
    q = generateYakuForm('yakuhai');
  } else {
    // Final / beyond: random mix
    const generators = [generateTenpaiWin, generateWaitingTiles, generateDiscardBest, generateMultiWait, generateYakuCombo, generateSafeDiscard];
    q = rand(generators)();
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
