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
    maxRounds: 5,
    baseScore: 1000,
    scoreMultiplier: 1.5,
    bossRoundMultiplier: 1.5,
  },

  // ===== Beginner Mode =====
  beginner: {
    maxRounds: 3,
    scoreMultiplier: 0.7, // 70% of normal target scores
    unlockedYaku: ['riichi', 'tanyao', 'pinfu', 'yakuhai'],
    completedKey: 'mjrg_beginner_done',
    tutorialSteps: [
      'Welcome! In Mahjong, you build a 14-tile hand. Each turn: draw a tile, then discard one. Goal: form a winning pattern called a YAKU.',
      'Your hand: number suits (man/pin/sou 1-9), winds (E S W N), dragons (Rd Wh Gr). Hover any tile for details.',
      'Click DRAW TILE (or press D) to draw from the wall.',
      'Now click a tile to discard. Green border = keep, Red = discard. Tiles 2-8 are good for Tanyao!',
      'To win, you need a YAKU pattern. Watch the progress bars below.',
      'You are ready! Keep drawing and discarding. Press H to toggle hints. Good luck!',
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
    width: 48,
    height: 64,
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
    gameTitle: 'MAHJONG ROGUELIKE',
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
      'GOAL: Win rounds by forming a winning 14-tile hand.',
      'Each win needs at least one YAKU (winning pattern).',
      '',
      'HOW TO PLAY:',
      '1. DRAW a tile from the wall',
      '2. Click a tile in your hand to DISCARD it',
      '3. When ready, declare RIICHI (locks your hand)',
      '4. WIN! when your hand is complete',
      '',
      'Easy yaku: Tanyao (simples 2-8) · Pinfu (sequences)',
      '         Riichi (ready) · Yakuhai (dragon triplet)',
      '',
      'KEYBOARD: D=Draw  W=Win  R=Riichi  N=Next',
    ],
    onboardingTitle: 'WELCOME, TRAVELER',
    onboardingButton: 'BEGIN',
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
    name: 'Mahjong Roguelike',
    shortName: 'MJ Roguelike',
    domain: 'mahjongroguelike.com',
    contactEmail: 'hello@mahjongroguelike.com',
  },
} as const;

export type GameConfigType = typeof GameConfig;