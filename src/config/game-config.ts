/**
 * Game Configuration — Centralized, single-source-of-truth for all tunable values.
 *
 * For white-label licensing: swap this file with your own config.
 * Everything that affects game appearance, rules, scoring, and UI
 * lives here. No need to touch game logic files.
 */

export const GameConfig = {
  // ===== Canvas & Display =====
  canvas: {
    width: 1024,
    height: 720,
    backgroundColor: '#2b1810',
    pixelArt: true,
  },

  // ===== Color Palette (Izakaya Theme) =====
  colors: {
    woodDark: 0x2b1810,
    woodMid: 0x3d2418,
    woodLight: 0x5c3825,
    amber: 0xd4a574,
    amberBright: 0xe8c088,
    vermillion: 0xc73e3a,
    vermillionDark: 0x9b2b28,
    cream: 0xf5e6d3,
    creamDim: 0xc9b89a,
    gold: 0xe5b567,
    ink: 0x1a0e08,
    // Hex equivalents for text rendering
    hex: {
      woodDark: '#2b1810',
      woodMid: '#3d2418',
      woodLight: '#5c3825',
      amber: '#d4a574',
      amberBright: '#e8c088',
      vermillion: '#c73e3a',
      vermillionDark: '#9b2b28',
      cream: '#f5e6d3',
      creamDim: '#c9b89a',
      gold: '#e5b567',
      ink: '#1a0e08',
    } as Record<string, string>,
  },

  // ===== Round Configuration =====
  rounds: {
    maxRounds: 12,
    baseScore: 1000,
    scoreMultiplier: 1.5,
    bossRoundMultiplier: 1.5,
    lives: 1,            // NORMAL: 1 wrong = game over (rogue tension)
  },

  // ===== Beginner Mode =====
  beginner: {
    maxRounds: 8,
    scoreMultiplier: 0.4, // 40% of normal target scores — a single basic yaku clears round 1
    unlockedYaku: ['riichi', 'tanyao', 'pinfu', 'yakuhai'],
    completedKey: 'mjrg_beginner_done',
    tutorialSeenKey: 'mjrg_tutorial_seen',
    lives: 2,            // BEGINNER: 2 lives — more forgiving for learners
    trainingLevels: [
      {
        id: 'win-hand',
        title: 'LESSON 1: WINNING HAND',
        subtitle: 'Shape first',
        description: 'Learn the basic win shape: four groups plus one pair.',
        objective: 'Find the tile that completes the missing group.',
        tip: 'Look for an unfinished two-tile shape like 2-3 or 7-8.',
        type: 'tenpai-win',
      },
      {
        id: 'waiting-tiles',
        title: 'LESSON 2: WAITING TILES',
        subtitle: 'Read the wait',
        description: 'Some hands can win on more than one tile.',
        objective: 'Pick every tile that completes the hand.',
        tip: 'Two-sided waits are usually stronger than closed or edge waits.',
        type: 'waiting-tiles',
      },
      {
        id: 'yaku-form',
        title: 'LESSON 3: YAKU PATTERNS',
        subtitle: 'Build a scoring hand',
        description: 'A winning hand still needs a yaku to score.',
        objective: 'Choose the tile that keeps the target yaku alive.',
        tip: 'Tanyao wants only simple tiles: numbers 2 through 8.',
        type: 'yaku-form',
      },
      {
        id: 'discard-best',
        title: 'LESSON 4: BEST DISCARD',
        subtitle: 'Improve the hand',
        description: 'Good discards remove tiles that do not connect.',
        objective: 'Throw the tile that helps the hand least.',
        tip: 'Isolated honors and lonely terminals are often first cuts.',
        type: 'discard-best',
      },
      {
        id: 'safe-discard',
        title: 'LESSON 5: SAFE DISCARDS',
        subtitle: 'Survive riichi',
        description: 'Pick the safest tile to throw — won\'t help your opponent.',
        objective: 'Pick the safest fold, not the fastest attack.',
        tip: 'Terminals and honors are useful defensive anchors in this drill.',
        type: 'safe-discard',
      },
    ],
    tutorialSteps: [
      {
        id: 'welcome',
        text: 'MAHJONG QUIZ\n\nYou will answer 4-option questions about mahjong hands.\nNo mahjong experience needed — you will learn as you play!',
        button: 'START TUTORIAL',
      },
      {
        id: 'hand',
        text: 'This is your hand. A winning hand in mahjong has 14 tiles: 4 sets + 1 pair.\n\nFor now, just notice the shapes and colors.',
        highlight: 'hand',
      },
      {
        id: 'question',
        text: 'Each question asks something about the hand above.\nRead it slowly — you have enough time.',
        highlight: 'prompt',
      },
      {
        id: 'options',
        text: 'Pick ONE of the four options.\nThe correct answer is highlighted this time. Just click it!',
        highlight: 'correct-option',
      },
      {
        id: 'feedback',
        text: 'Correct! You will always see an explanation so you learn WHY it is right.',
        highlight: 'feedback',
      },
      {
        id: 'hud',
        text: 'Watch the top bar: Round, Lives, Combo, Score, and Timer.\nKeep your combo alive for bigger scores!',
        highlight: 'topbar',
      },
      {
        id: 'done',
        text: 'That is everything!\nMistakes are OK — you learn from explanations.\nGood luck!',
        button: 'PLAY NOW',
      },
    ],
  },

  // ===== Scoring =====
  scoring: {
    baseFu: 30,
    manganHan: 5,
    manganPoints: 2000,
    hanLimit: 13, // yakuman threshold
    yakumanPoints: 8000,
  },

  // ===== Tile Dimensions =====
  tiles: {
    width: 56,
    height: 72,
    gap: 4,
  },

  // ===== Tile Suit Colors =====
  tileColors: {
    man: '#1A1A2E',
    pin: '#2C5F8A',
    sou: '#2D6A4F',
    wind: '#5C4033',
    dragon: '#C73E3A',
  },

  // ===== UI Text =====
  ui: {
    gameTitle: 'MAHJONG QUIZ',
    roundLabel: 'ROUND',
    scoreLabel: 'SCORE',
    targetLabel: 'TARGET',
    drawButton: 'DRAW TILE',
    riichiButton: 'RIICHI',
    winButton: 'WIN!',
    nextRoundButton: 'NEXT ROUND',
    newRunButton: 'NEW RUN',
    undoButton: 'UNDO',
    phaseMessages: {
      idle: 'Draw a tile or declare Riichi',
      drew: 'Click a tile to discard, or declare Win',
      won: 'Round won!',
      survived: 'Round survived!',
      lost: 'Round failed — enjoy your reward!',
    },
    onboardingTips: [
      'GOAL: Answer mahjong questions correctly.',
      'Each question shows a hand and 4 tile options.',
      '',
      'HOW TO PLAY:',
      '1. READ the question above the hand',
      '2. PICK one of the 4 options (A/B/C/D)',
      '3. LEARN from the explanation after each answer',
      '4. SURVIVE all rounds to win!',
      '',
      'Question types:',
      '· Which tile completes the hand?',
      '· Which tile forms a yaku?',
      '· What is the hand waiting for?',
      '· Which tile should you discard?',
      '',
      'Lives, combo, and relics add strategy.',
    ],
    onboardingTitle: 'WELCOME TO MAHJONG QUIZ',
    onboardingButton: 'LET\'S GO',
  },

  // ===== Round Challenge Goals =====
  // Each round has a required primary goal (teaches a yaku) and optional
  // secondary goals for extra bonus. Optional goals add replay value without
  // blocking learning progress.
  challenges: {
    goalsByRound: [
      // Round 1
      [
        { id: 'r1-primary', type: 'yaku', targetId: 'riichi', bonus: 500, desc: 'Win with RIICHI', optional: false },
        { id: 'r1-opt1', type: 'fastWin', count: 12, bonus: 300, desc: 'Win in 12 turns or fewer', optional: true },
      ],
      // Round 2
      [
        { id: 'r2-primary', type: 'yaku', targetId: 'tanyao', bonus: 500, desc: 'Win with TANYAO', optional: false },
        { id: 'r2-opt1', type: 'noHint', bonus: 400, desc: 'Win with hints turned off', optional: true },
      ],
      // Round 3
      [
        { id: 'r3-primary', type: 'yaku', targetId: 'pinfu', bonus: 500, desc: 'Win with PINFU', optional: false },
        { id: 'r3-opt1', type: 'han', count: 2, bonus: 400, desc: 'Win with 2+ han', optional: true },
      ],
      // Round 4
      [
        { id: 'r4-primary', type: 'multiYaku', count: 2, bonus: 800, desc: 'Win with 2+ yaku combined', optional: false },
        { id: 'r4-opt1', type: 'fastWin', count: 10, bonus: 500, desc: 'Win in 10 turns or fewer', optional: true },
      ],
      // Round 5
      [
        { id: 'r5-primary', type: 'han', count: 3, bonus: 1000, desc: 'Win with 3+ han', optional: false },
        { id: 'r5-opt1', type: 'noHint', bonus: 600, desc: 'Win without using hints', optional: true },
      ],
    ] as import('@/types').ChallengeGoal[][],
  },

  // ===== Optional Pressure Mode =====
  // Switched on in deck select. Adds a strict move limit per round for players
  // who want extra tension. Never forced on beginner runs.
  pressure: {
    modes: ['off', 'moves'] as const,
    moveLimit: { normal: 15, beginner: 20 },
    bonus: 300,
  },

  // ===== Puzzle Mode =====
  // Fixed-hand training scenarios. Each puzzle teaches a specific yaku or
  // efficient path to tenpai. No run progress is saved — pure practice.
  puzzles: {
    items: [
      {
        id: 'puzzle-riichi-one-away',
        name: 'One Tile Away',
        description: 'You are 1 tile from a ready Riichi hand. Find the correct discard.',
        goalYaku: 'riichi',
        optimalMoves: 1,
        tiles: [
          { suit: 'man', rank: 2 }, { suit: 'man', rank: 3 }, { suit: 'man', rank: 4 },
          { suit: 'pin', rank: 4 }, { suit: 'pin', rank: 5 }, { suit: 'pin', rank: 6 },
          { suit: 'sou', rank: 6 }, { suit: 'sou', rank: 7 }, { suit: 'sou', rank: 8 },
          { suit: 'man', rank: 5 }, { suit: 'man', rank: 5 },
          { suit: 'dragon', rank: 1 }, { suit: 'dragon', rank: 1 },
        ] as import('@/types').Tile[],
      },
      {
        id: 'puzzle-tanyao-cleanup',
        name: 'Clean Up for Tanyao',
        description: 'Remove the 1-man and 9-pin to aim for Tanyao (all simples).',
        goalYaku: 'tanyao',
        optimalMoves: 3,
        tiles: [
          { suit: 'man', rank: 1 }, { suit: 'man', rank: 2 }, { suit: 'man', rank: 3 },
          { suit: 'man', rank: 6 }, { suit: 'man', rank: 7 }, { suit: 'man', rank: 8 },
          { suit: 'pin', rank: 2 }, { suit: 'pin', rank: 3 }, { suit: 'pin', rank: 9 },
          { suit: 'sou', rank: 4 }, { suit: 'sou', rank: 5 }, { suit: 'sou', rank: 6 },
          { suit: 'wind', rank: 1 },
        ] as import('@/types').Tile[],
      },
      {
        id: 'puzzle-pinfu-shape',
        name: 'Shape into Pinfu',
        description: 'Build 4 sequences and a non-dragon pair for Pinfu.',
        goalYaku: 'pinfu',
        optimalMoves: 4,
        tiles: [
          { suit: 'man', rank: 2 }, { suit: 'man', rank: 3 }, { suit: 'man', rank: 4 },
          { suit: 'pin', rank: 3 }, { suit: 'pin', rank: 4 }, { suit: 'pin', rank: 5 },
          { suit: 'sou', rank: 4 }, { suit: 'sou', rank: 5 }, { suit: 'sou', rank: 6 },
          { suit: 'man', rank: 6 }, { suit: 'man', rank: 7 }, { suit: 'man', rank: 8 },
          { suit: 'dragon', rank: 1 },
        ] as import('@/types').Tile[],
      },
    ],
  },

  // ===== localStorage Keys =====
  storageKeys: {
    run: 'mjrg_run',
    meta: 'mjrg_meta',
    settings: 'mjrg_settings',
    yakuBonuses: 'mjrg_yaku_bonuses',
    onboarded: 'mjrg_onboarded',
    cookiesAccepted: 'mjrg_cookies_accepted',
  },

  // ===== Sound =====
  sound: {
    muteKey: 'mjrg_sound_muted',
  },

  // ===== Branding (for white-label) =====
  branding: {
    name: 'Mahjong Quiz',
    shortName: 'MJ Quiz',
    domain: 'mahjongroguelike.com',
    contactEmail: 'hello@mahjongroguelike.com',
  },
} as const;

export type GameConfigType = typeof GameConfig;
