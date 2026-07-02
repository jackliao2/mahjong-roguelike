const fs = require('fs');
const path = 'src/game/quizGenerator.ts';
let content = fs.readFileSync(path, 'utf8');

// New function code to add
const newFunctions = @'

/**
 * Type 5: multi-wait - "This hand has MULTIPLE waits. Which tiles are you waiting for?"
 * Similar to waiting-tiles but requires 3-5 waiting tiles (higher difficulty).
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
    const correctIndices = options
      .map((t, i) => (waitingSet.has(tileKey(t)) ? i : -1))
      .filter(i => i >= 0);

    return {
      type: 'multi-wait',
      hand: hand13,
      prompt: 'This hand has MULTIPLE waits. Which tiles are you waiting for?',
      options,
      correctIndices,
      explanation: 'Multi-wait! Waiting on ' + waiting.length + ' tiles: ' + waiting.join(', ') + '.',
    };
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

    return {
      type: 'yaku-combo',
      hand: winning,
      prompt: 'This hand wins! Which YAKU does it have?',
      options: options.map(name => ({ id: name, suit: 'dragon' as Suit, rank: 1 })),
      correctIndices: [correctIndex],
      explanation: 'This hand has ' + correctYakuName + '. Yaku found: ' + yakuList.map(y => y.yaku.id.toUpperCase()).join(', ') + '.',
      targetYaku: correctYakuId,
    };
  }
  return generateFallback();
}

export function generateSafeDiscard(): QuizQuestion {
  for (let attempt = 0; attempt < 80; attempt++) {
    const melds: Tile[][] = [];
    const suits = SUITS;

    for (let i = 0; i < 3; i++) {
      const suit = rand(suits);
      const start = 2 + Math.floor(Math.random() * 6);
      melds.push(buildSequence(suit, start));
    }

    const pairSuit = rand(suits);
    const pairRank = 2 + Math.floor(Math.random() * 7);
    melds.push(buildPair(pairSuit, pairRank));

    const useTerminal = Math.random() < 0.5;
    let safeTile: Tile;

    if (useTerminal) {
      const termSuit = rand(suits);
      const termRank = Math.random() < 0.5 ? 1 : 9;
      safeTile = createTile(termSuit, termRank);
    } else {
      const honorSuit = rand(['wind', 'dragon'] as Suit[]);
      const honorRank = honorSuit === 'wind' ? 1 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 3);
      safeTile = createTile(honorSuit, honorRank);
    }

    melds.push([safeTile]);

    const hand14 = melds.flat();
    if (hand14.length !== 14) continue;
    if (detectWin(hand14)) continue;

    const otherTiles = hand14.filter(t => t.id !== safeTile.id);
    const wrongTiles = shuffle(otherTiles).slice(0, 3);
    if (wrongTiles.length < 3) continue;

    const options = shuffle([safeTile, ...wrongTiles]);
    const correctIndex = options.findIndex(t => t.id === safeTile.id);

    return {
      type: 'safe-discard',
      hand: hand14,
      prompt: 'Someone declared RIICHI! Which tile is SAFEST to discard?',
      options,
      correctIndices: [correctIndex],
      explanation: tileKey(safeTile).toUpperCase() + ' is a terminal or isolated honor - unlikely to be a winning tile. Safest!',
    };
  }
  return generateFallback();
}

'@;

// Insert before Chapter system
content = content.replace('// ===== Chapter / BOSS system =====', newFunctions + '// ===== Chapter / BOSS system =====');

// Update round logic
content = content.replace(
  'q = generateWaitingTiles();',
  'q = generateMultiWait();'
);
content = content.replace(
  'q = generateDiscardBest();',
  'q = generateSafeDiscard();'
);
content = content.replace(
  'q = generateWaitingTiles();',
  'q = generateYakuCombo();'
);
content = content.replace(
  'const generators = [generateTenpaiWin, generateWaitingTiles, generateDiscardBest];',
  'const generators = [generateTenpaiWin, generateWaitingTiles, generateDiscardBest, generateMultiWait, generateYakuCombo, generateSafeDiscard];'
);

// Update comments
content = content.replace(
  '// Chapter 1 (1-2): tenpai-win basics; BOSS at 3 = waiting-tiles',
  '// Chapter 1 (1-2): tenpai-win basics; BOSS at 3 = multi-wait'
);
content = content.replace(
  '// Chapter 2 (4-5): tanyao; BOSS at 6 = discard-best',
  '// Chapter 2 (4-5): tanyao; BOSS at 6 = safe-discard'
);
content = content.replace(
  '// Chapter 3 (7-8): pinfu; BOSS at 9 = waiting-tiles',
  '// Chapter 3 (7-8): pinfu; BOSS at 9 = yaku-combo'
);

fs.writeFileSync(path, content, 'utf8');
console.log('File updated successfully');
