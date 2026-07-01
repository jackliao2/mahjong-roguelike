import Phaser from 'phaser';
import { Tile, Hand, RunState, Yaku, ChallengeGoal } from '@/types';
import { TileWall } from '@/game/wall';
import { createHand, sortHand, getAllTiles, findPairs } from '@/game/hand';
import { detectWin, findWaitingTiles } from '@/game/winDetector';
import { calculateScore, createRunState } from '@/game/scoring';
import { tileKey, getTileDisplay } from '@/game/tiles';
import { TILE_WIDTH, TILE_HEIGHT } from '@/render/tileRenderer';
import { advanceRound, checkRunComplete, persistRun, endRun } from '@/roguelike/run';
import { loadRun, clearRun, loadMeta } from '@/data/storage';
import { SoundManager } from '@/render/sound';
import { getUnlockedDecks } from '@/roguelike/meta';
import { trackRunStart, trackRoundComplete, trackRunComplete, trackWin } from '@/data/analytics';
import { GameConfig } from '@/config/game-config';
import { getYakuProximity, getDiscardHints } from '@/game/yakuProximity';
import { analyzeHandStructure, recommendDiscard } from '@/game/handStructure';

type GamePhase = 'idle' | 'drew' | 'won' | 'survived' | 'lost';

type PressureMode = 'off' | 'moves';

interface GameState {
  wall: TileWall;
  hand: Hand;
  runState: RunState;
  phase: GamePhase;
  discardedTiles: Tile[];
  roundScore: number;
  pressureMode: PressureMode;
  isPuzzle: boolean;
  puzzleId?: string;
  puzzleMoves: number;
}

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private tileSprites: Phaser.GameObjects.Container[] = [];
  private uiText: Record<string, Phaser.GameObjects.Text> = {};
  private actionButtons: Record<string, Phaser.GameObjects.Container> = {};
  private messageText!: Phaser.GameObjects.Text;
  private tooltipText: Phaser.GameObjects.Text | null = null;
  private tooltipBg: Phaser.GameObjects.Rectangle | null = null;
  private yakuInfoText!: Phaser.GameObjects.Text;
  // Undo state: snapshot of hand + drawnTile before the last discard (for misclick protection)
  private undoSnapshot: { handTiles: Tile[]; drawnTile: Tile | null } | null = null;
  private soundManager!: SoundManager;
  // New-player guidance flags
  private showHints: boolean = true;
  private discardHints: Map<string, { keep: boolean; reason: string }> = new Map();
  private recommendedDiscardId: string | null = null;
  private yakuRefPanel!: Phaser.GameObjects.Container;
  // Beginner mode tutorial
  private isBeginner: boolean = false;
  private tutorialStep: number = -1; // -1 = disabled, 0-8 = steps
  private tutorialOverlay!: Phaser.GameObjects.Container;
  // Beginner assist UI
  private handStructureText!: Phaser.GameObjects.Text;
  private recommendedActionText!: Phaser.GameObjects.Text;
  private hintLegend!: Phaser.GameObjects.Text;
  private yakuRefCards: Phaser.GameObjects.Container[] = [];
  private yakuRefProgress: Phaser.GameObjects.Rectangle[] = [];
  private buttonGlowTweens: Map<string, Phaser.Tweens.Tween> = new Map();
  // 关卡挑战目标系统：每关 1 个主要目标 + 1 个可选目标
  private challengeTexts: Phaser.GameObjects.Text[] = [];
  private challengeGoals: ChallengeGoal[] = [];
  private challengeCompletion: Map<string, boolean> = new Map();
  private turnCount: number = 0;
  private hintUsedThisRound: boolean = false;
  private pressureText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('GameScene');
  }

  create(data?: { action?: string; deckId?: string; difficulty?: string; pressureMode?: PressureMode; puzzleId?: string }): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    this.soundManager = new SoundManager(this);

    this.isBeginner = data?.difficulty === 'beginner';

    if (data?.action === 'puzzle' && data?.puzzleId) {
      this.startPuzzleRun(data.puzzleId);
    } else if (data?.action === 'new_run') {
      clearRun(); // fresh run — discard any saved state
      this.startNewRun(data.deckId, data.difficulty, data?.pressureMode);
    } else if (!this.state) {
      this.startNewRun();
    }
    this.createUI();
    this.setChallengeForRound(this.state.runState.round); // 在 createUI 之后调用，确保 challengeText 已创建
    this.renderHand();
    this.updateUI();

    // First-time player onboarding (shown once, then dismissed)
    if (!localStorage.getItem(GameConfig.storageKeys.onboarded)) {
      this.showOnboardingHint();
    } else if (this.isBeginner && this.tutorialStep === -1 && !localStorage.getItem(GameConfig.beginner.tutorialSeenKey)) {
      // Show guided tutorial for beginner mode only on the first beginner run
      this.time.delayedCall(600, () => this.startTutorial());
    } else {
      // 第一局开场横幅（已 onboarding 且无 tutorial 时显示）
      this.time.delayedCall(800, () => this.showRoundIntro());
    }

    // Keyboard shortcuts
    this.setupKeyboardShortcuts();
  }

  // ===== Keyboard shortcuts: D=draw, W=win, R=riichi, N=next round =====
  private setupKeyboardShortcuts(): void {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      // Don't intercept if modifier keys are held
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toUpperCase();

      switch (key) {
        case 'D':
          if (this.state.phase === 'idle') this.drawTile();
          break;
        case 'W':
          if (this.state.phase === 'drew') this.declareWin();
          break;
        case 'R':
          if (this.state.phase === 'idle' && !this.state.runState.isRiichi) this.declareRiichi();
          break;
        case 'N':
          if (this.state.phase === 'won' || this.state.phase === 'survived') this.proceedToNextRound();
          break;
        case 'H':
          this.showHints = !this.showHints;
          this.hintUsedThisRound = this.showHints;
          this.showMessage(this.showHints ? 'Hints: ON' : 'Hints: OFF');
          if (this.hintLegend) this.hintLegend.setVisible(this.isBeginner && this.showHints);
          this.time.delayedCall(1200, () => this.updateUI());
          this.renderHand();
          break;
      }
    });
  }

  // ===== First-time onboarding overlay =====
  private showOnboardingHint(): void {
    const panelW = 600;
    const panelH = 440;
    const btnW = 220;
    const btnH = 48;
    const btnY = 360 + panelH / 2 - 44;
    const depth = 1000;

    // Track every element so we can fade and destroy them together cleanly.
    const elements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.85).setDepth(depth);
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0xd4a574).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 3, 0xe5b567).setDepth(depth);
    elements.push(overlay, panel, topAccent);

    const title = this.add.text(512, 360 - panelH / 2 + 40, GameConfig.ui.onboardingTitle, {
      fontSize: '24px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const tips = GameConfig.ui.onboardingTips;
    const tipsText = this.add.text(512, 360 - 16, tips.join('\n'), {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', lineSpacing: 5,
      wordWrap: { width: panelW - 60 },
    }).setOrigin(0.5).setDepth(depth + 1);
    elements.push(title, tipsText);

    const btnShadow = this.add.rectangle(516, btnY + 4, btnW, btnH, 0x000000, 0.5).setDepth(depth);
    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810).setDepth(depth);
    const btnHighlight = this.add.rectangle(512, btnY - btnH / 2 + 3, btnW - 6, 2, 0xffffff, 0.4).setDepth(depth + 1);
    const btnText = this.add.text(512, btnY, GameConfig.ui.onboardingButton, {
      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    elements.push(btnShadow, btnBg, btnHighlight, btnText);

    // Hit area for the button (invisible, on top)
    const hitArea = this.add.rectangle(512, btnY, btnW, btnH, 0xffffff, 0).setDepth(depth + 2);
    elements.push(hitArea);

    let closing = false;
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerover', () => { if (!closing) { btnBg.setFillStyle(0xe04e4a); hitArea.setScale(1.05); btnText.setScale(1.05); btnShadow.setScale(1.05); btnHighlight.setScale(1.05); } });
    hitArea.on('pointerout', () => { if (!closing) { btnBg.setFillStyle(0xc73e3a); hitArea.setScale(1); btnText.setScale(1); btnShadow.setScale(1); btnHighlight.setScale(1); } });
    hitArea.on('pointerdown', () => {
      if (closing) return;
      closing = true;
      this.soundManager.playClick();
      localStorage.setItem(GameConfig.storageKeys.onboarded, '1');
      hitArea.disableInteractive();
      // Fade out the entire overlay
      this.tweens.add({
        targets: elements,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          elements.forEach(el => el.destroy());
          // Start beginner tutorial after onboarding
          if (this.isBeginner) {
            this.time.delayedCall(400, () => this.startTutorial());
          }
        },
      });
    });
  }

  // ===== Guided tutorial for beginner mode (interactive: learn by doing) =====
  private startTutorial(): void {
    this.tutorialStep = 0;
    this.showInteractiveTutorial();
  }

  /** Tutorial no longer blocks any actions - just shows info boxes */
  private tutorialBlocksAction(action: 'draw' | 'discard' | 'riichi' | 'win' | 'keyboardShortcut'): boolean {
    return false;
  }

  private showInteractiveTutorial(): void {
    const steps = GameConfig.beginner.tutorialSteps;
    const stepIdx = this.tutorialStep;
    if (stepIdx < 0 || stepIdx >= steps.length) return;

    this.tutorialOverlay?.destroy();

    const step = steps[stepIdx];
    const isLast = stepIdx === steps.length - 1;

    const master = this.add.container(0, 0).setDepth(900);
    this.tutorialOverlay = master;

    const panelW = 600;
    const panelH = 180;
    const panelX = 512;
    const panelY = 140;

    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0xd4a574);
    const topAccent = this.add.rectangle(panelX, panelY - panelH / 2 + 4, panelW - 10, 3, 0xe5b567);
    master.add([panel, topAccent]);

    const stepLabel = this.add.text(panelX, panelY - panelH / 2 + 24, `STEP ${stepIdx + 1} / ${steps.length}`, {
      fontSize: '12px', color: '#8b6f47', fontFamily: 'monospace',
    }).setOrigin(0.5);
    master.add(stepLabel);

    const tutorialText = this.add.text(panelX, panelY + 8, step.text, {
      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 8,
    }).setOrigin(0.5);
    master.add(tutorialText);

    const btnW = 180;
    const btnH = 44;
    const btnX = panelX;
    const btnY = panelY + panelH / 2 - 24;
    const btnBg = this.add.rectangle(btnX, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810);
    const btnHighlight = this.add.rectangle(btnX, btnY - btnH / 2 + 3, btnW - 6, 2, 0xffffff, 0.4);
    const label = isLast ? "LET'S GO!" : 'NEXT';
    const btnText = this.add.text(btnX, btnY, label, {
      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    const btnHit = this.add.rectangle(btnX, btnY, btnW, btnH, 0xffffff, 0);
    master.add([btnBg, btnHighlight, btnText, btnHit]);

    btnHit.setInteractive({ useHandCursor: true });
    btnHit.on('pointerover', () => { btnBg.setFillStyle(0xe04e4a); btnText.setScale(1.05); btnHighlight.setScale(1.05); });
    btnHit.on('pointerout', () => { btnBg.setFillStyle(0xc73e3a); btnText.setScale(1); btnHighlight.setScale(1); });
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      localStorage.setItem(GameConfig.beginner.tutorialSeenKey, '1');
      this.advanceTutorial();
    });
  }

  private advanceTutorial(): void {
    this.tutorialStep++;
    if (this.tutorialStep >= GameConfig.beginner.tutorialSteps.length) {
      this.tutorialOverlay?.destroy();
      this.tutorialStep = -1; // tutorial ended
      // Tutorial 完成后若当前回合已赢/存活，自动进入下一关（避免卡在 won 界面）
      if (this.state.phase === 'won' || this.state.phase === 'survived') {
        this.proceedToNextRound();
      }
      return;
    }
    this.showInteractiveTutorial();
  }

  private startNewRun(deckId?: string, difficulty?: string, pressureMode?: PressureMode): void {
    // Try to resume a persisted run (preserves round, score)
    const savedRun = loadRun();
    const isBeginner = difficulty === 'beginner';
    const maxRounds = isBeginner ? GameConfig.beginner.maxRounds : GameConfig.rounds.maxRounds;
    const runState = savedRun ?? createRunState(maxRounds);
    const pressure: PressureMode = pressureMode || 'off';

    // Apply beginner mode settings
    if (isBeginner && !savedRun) {
      runState.unlockedYaku = [...GameConfig.beginner.unlockedYaku];
      runState.targetScore = Math.floor(runState.targetScore * GameConfig.beginner.scoreMultiplier);
    }

    this.state = {
      wall: new TileWall(),
      hand: createHand(),
      runState,
      phase: 'idle',
      discardedTiles: [],
      roundScore: 0,
      pressureMode: pressure,
      isPuzzle: false,
      puzzleMoves: 0,
    };
    this.dealInitialHand();
    // Analytics: track run starts (only for fresh runs, not resumes)
    if (!savedRun && deckId) {
      trackRunStart(deckId);
    }
  }

  /** Start a fixed-hand puzzle run for practice. No persistence, no rewards. */
  private startPuzzleRun(puzzleId: string): void {
    const puzzle = GameConfig.puzzles.items.find(p => p.id === puzzleId);
    if (!puzzle) {
      this.startNewRun();
      return;
    }

    // Generate instance IDs for the fixed tiles
    const tiles: Tile[] = puzzle.tiles.map((t, i) => ({
      suit: t.suit,
      rank: t.rank,
      id: `puzzle-${puzzleId}-${t.suit}-${t.rank}-${i}`,
    }));

    const runState = createRunState(1);
    runState.unlockedYaku = ['riichi', 'tanyao', 'pinfu', 'yakuhai', 'iipeikou'];

    this.state = {
      wall: new TileWall(),
      hand: createHand(tiles),
      runState,
      phase: 'idle',
      discardedTiles: [],
      roundScore: 0,
      pressureMode: 'moves',
      isPuzzle: true,
      puzzleId,
      puzzleMoves: 0,
    };
  }

  private dealInitialHand(): void {
    const tiles = this.isBeginner
      ? this.dealBeginnerFriendlyHand()
      : this.dealRandomHand();
    this.state.hand = createHand(tiles);
  }

  private dealRandomHand(): Tile[] {
    const tiles: Tile[] = [];
    for (let i = 0; i < 13; i++) {
      const tile = this.state.wall.draw();
      if (tile) tiles.push(tile);
    }
    return tiles;
  }

  /**
   * Deal a beginner-friendly starting hand.
   * Beginners need to see clear shapes and get quick, encouraging wins, so we
   * build the hand deterministically:
   * - all simple tiles (2-8) so Tanyao is automatic,
   * - 1 pair + 3 complete sequences + 1 two-sided partial,
   * - already tenpai (1 tile from winning) with at least 2 winning tiles,
   * - no honor or terminal tiles to confuse new players.
   *
   * We also gently bias the wall so one winning tile appears early, keeping
   * the first-run experience reliably short without removing randomness entirely.
   */
  private dealBeginnerFriendlyHand(): Tile[] {
    const hand = this.constructBeginnerHand();

    // Place one of the waiting tiles within the first few draws so the
    // beginner's ready hand converts to a win quickly, but vary the spot
    // slightly so every round doesn't feel identical.
    const waiting = findWaitingTiles(hand);
    if (waiting.length > 0) {
      const key = waiting[Math.floor(Math.random() * waiting.length)];
      const [suit, rankStr] = key.split('-');
      const earlyPosition = Math.floor(Math.random() * 7) + 2; // 2-8
      this.state.wall.bringToFront(suit, parseInt(rankStr, 10), earlyPosition);
    }

    return hand;
  }

  /**
   * Build a guaranteed beginner hand directly from the wall.
   * Structure: 1 pair + 3 sequences + 1 two-sided partial.
   * This is already tenpai (1 tile from winning) with a good wait.
   * All tiles are simples (rank 2-8), no honors/terminals.
   */
  private constructBeginnerHand(): Tile[] {
    const suits: Array<'man' | 'pin' | 'sou'> = ['man', 'pin', 'sou'];
    const shuffleSuits = () => {
      const arr = [...suits];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const pickRank = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    const hand: Tile[] = [];
    const requested: Array<{ suit: string; rank: number }> = [];

    // Use each suit exactly once for the three sequences so tile counts stay safe
    // and the hand looks varied.
    const suitOrder = shuffleSuits();

    // 1 pair in the middle of a suit
    const pairSuit = suitOrder[0];
    const pairRank = pickRank(3, 7);
    requested.push({ suit: pairSuit, rank: pairRank }, { suit: pairSuit, rank: pairRank });

    // 3 complete sequences, one per suit
    for (let i = 0; i < 3; i++) {
      const seqStart = pickRank(2, 6);
      requested.push(
        { suit: suitOrder[i], rank: seqStart },
        { suit: suitOrder[i], rank: seqStart + 1 },
        { suit: suitOrder[i], rank: seqStart + 2 }
      );
    }

    // 1 two-sided partial sequence (middle rank so both waits are simples)
    const partialSuit = suitOrder[1];
    const partialStart = pickRank(3, 6);
    requested.push(
      { suit: partialSuit, rank: partialStart },
      { suit: partialSuit, rank: partialStart + 1 }
    );

    // Draw the specific tiles from the wall
    for (const req of requested) {
      const tile = this.state.wall.drawSpecific(req.suit, req.rank);
      if (tile) {
        hand.push(tile);
      }
    }

    // If deterministic construction fell short (shouldn't happen with a fresh wall),
    // fill the rest with random draws.
    while (hand.length < 13) {
      const tile = this.state.wall.draw();
      if (tile) hand.push(tile);
      else break;
    }

    return hand;
  }

  // ========== UI CREATION ==========

  private scoreProgressBar!: Phaser.GameObjects.Rectangle;
  private scoreProgressBg!: Phaser.GameObjects.Rectangle;
  private handAreaBg!: Phaser.GameObjects.Container;
  private discardArea!: Phaser.GameObjects.Container;

  private createUI(): void {
    // ===== Decorative background (wood grain texture) =====
    this.createWoodBackground();

    // ===== Top bar - redesigned with sections =====
    this.createTopBar();

    // ===== Challenge goal bar (below top bar) =====
    this.createChallengeBar();

    // ===== Score progress bar (below top bar) =====
    this.createScoreProgressBar();

    // ===== Hand area background (wooden tray for tiles) =====
    this.createHandArea();

    // ===== Discard area (right side, shows recent discards) =====
    this.createDiscardArea();

    // ===== Message area (center, with decorative frame) =====
    this.createMessageArea();

    // Action buttons — positioned in the centre, between side panels and above hand
    // Three buttons at x=330, x=512, x=694 with 160px width → 22px gaps between them
    this.createButton('draw', 512, 475, GameConfig.ui.drawButton, () => this.drawTile());
    this.createButton('riichi', 330, 475, GameConfig.ui.riichiButton, () => this.declareRiichi());
    this.createButton('win', 512, 475, GameConfig.ui.winButton, () => this.declareWin(), true);
    this.createButton('nextRound', 512, 475, GameConfig.ui.nextRoundButton, () => this.proceedToNextRound());
    this.createButton('newRun', 512, 475, GameConfig.ui.newRunButton, () => {
      this.scene.start('DeckSelectScene');
    });
    this.createButton('undo', 694, 475, GameConfig.ui.undoButton, () => this.undoDiscard());
  }

  private createButton(
    key: string, x: number, y: number, label: string,
    callback: () => void, highlight: boolean = false
  ): void {
    const width = 170;
    const height = 52;
    // Pixel-art shadow (offset black rectangle behind)
    const shadow = this.add.rectangle(4, 4, width, height, 0x000000, 0.5);
    // Main button bg with bevel
    const bg = this.add.rectangle(0, 0, width, height, highlight ? 0xc73e3a : 0xd4a574)
      .setStrokeStyle(3, 0x2b1810);
    // Top highlight (pixel bevel)
    const highlight_strip = this.add.rectangle(0, -height / 2 + 3, width - 6, 2, 0xffffff, 0.4);
    const text = this.add.text(0, 0, label, {
      fontSize: '18px', color: highlight ? '#f5e6d3' : '#2b1810',
      fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [shadow, bg, highlight_strip, text])
      .setSize(width, height)
      .setInteractive({ useHandCursor: true });

    container.on('pointerover', () => {
      container.setScale(1.05);
      container.setY(y - 2);
    });
    container.on('pointerout', () => {
      container.setScale(1);
      container.setY(y);
    });
    container.on('pointerdown', () => {
      this.soundManager.playClick();
      callback();
    });

    this.actionButtons[key] = container;
    container.setDepth(60);
  }

  // ===== Wood grain decorative background =====
  private createWoodBackground(): void {
    // Base dark wood color
    this.add.rectangle(0, 0, 1024, 720, 0x2b1810).setOrigin(0);
    // Wood grain stripes (subtle horizontal lines)
    for (let y = 0; y < 720; y += 4) {
      const alpha = 0.04 + Math.random() * 0.04;
      this.add.rectangle(0, y, 1024, 2, 0x5c3825, alpha).setOrigin(0);
    }
    // Corner decorative elements (lanterns)
    this.createLantern(50, 100);
    this.createLantern(974, 100);
  }

  private createLantern(x: number, y: number): void {
    // Hanging lantern decoration
    const rope = this.add.rectangle(x, y - 40, 2, 40, 0x8b6f47);
    const lantern = this.add.ellipse(x, y, 28, 36, 0xc73e3a)
      .setStrokeStyle(2, 0x9b2b28);
    // Lantern glow
    const glow = this.add.ellipse(x, y, 50, 50, 0xc73e3a, 0.15);
    // Top and bottom caps
    this.add.rectangle(x, y - 18, 16, 4, 0x2b1810);
    this.add.rectangle(x, y + 18, 12, 3, 0xe5b567);
    // Sway animation
    this.tweens.add({
      targets: [rope, lantern, glow],
      angle: 3,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ===== Redesigned top bar =====
  private createTopBar(): void {
    // Main top bar background
    const topBg = this.add.rectangle(0, 0, 1024, 60, 0x1a0e08)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xd4a574);
    // Inner accent line
    this.add.rectangle(0, 58, 1024, 2, 0xc73e3a).setOrigin(0);

    // Round indicator (left, with icon)
    this.add.text(20, 8, GameConfig.ui.roundLabel, {
      fontSize: '16px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.round = this.add.text(20, 24, '', {
      fontSize: '24px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Score (with label)
    this.add.text(150, 8, GameConfig.ui.scoreLabel, {
      fontSize: '16px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.score = this.add.text(150, 24, '', {
      fontSize: '24px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Target (with label)
    this.add.text(320, 8, GameConfig.ui.targetLabel, {
      fontSize: '16px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.target = this.add.text(320, 24, '', {
      fontSize: '24px', color: '#c73e3a', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Wall remaining (with label)
    this.add.text(490, 8, 'WALL', {
      fontSize: '16px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.wall = this.add.text(490, 24, '', {
      fontSize: '24px', color: '#c9b89a', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Phase (right side)
    this.add.text(660, 8, 'PHASE', {
      fontSize: '16px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.phase = this.add.text(660, 24, '', {
      fontSize: '18px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Sound toggle button (top-right corner)
    this.createSoundToggleButton();
    // Hint toggle button (next to SFX)
    this.createHintToggleButton();
    this.createHelpButton();
    // Yaku reference panel (right side, always visible for new players)
    this.createYakuRefPanel();
    // Beginner-only assist UI: hand structure panel + recommended action banner
    this.createBeginnerAssistUI();
  }

  // ===== Beginner assist: hand structure panel + recommended action =====
  private createBeginnerAssistUI(): void {
    // Recommended action banner — 紧贴按钮上方（唯一显示的提示）
    this.recommendedActionText = this.add.text(512, 390, '', {
      fontSize: '16px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
      align: 'center',
      padding: { x: 16, y: 8 },
      wordWrap: { width: 560 },
    }).setOrigin(0.5).setDepth(30);
    this.recommendedActionText.setVisible(false);

    // Hand structure info 合并到 yakuInfoText 显示，不再单独占位
    this.handStructureText = this.add.text(512, 425, '', {
      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', lineSpacing: 5,
      backgroundColor: '#1a0e08', padding: { x: 16, y: 8 },
      wordWrap: { width: 560 },
    }).setOrigin(0.5).setDepth(29);
    this.handStructureText.setVisible(false);

    // Discard hint legend — bottom-left corner, beginner mode only
    this.hintLegend = this.add.text(20, 560, '[ GREEN = useful ]   [ RED = safe discard ]   [ YELLOW = best ]', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
      lineSpacing: 4,
    }).setOrigin(0, 1).setDepth(40);
    this.hintLegend.setVisible(this.isBeginner && this.showHints);
  }

  // ===== Challenge goal bar: 每关 1 个主要目标 + 1 个可选目标 =====
  private createChallengeBar(): void {
    // 横条背景
    this.add.rectangle(0, 64, 1024, 28, 0x2b1810).setOrigin(0, 0)
      .setStrokeStyle(1, 0x5c3825);
    // 左侧标签
    this.add.text(20, 78, '\u2605 GOALS', {
      fontSize: '14px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    // Pressure mode indicator
    if (this.state.pressureMode === 'moves') {
      const limit = this.isBeginner
        ? GameConfig.pressure.moveLimit.beginner
        : GameConfig.pressure.moveLimit.normal;
      this.pressureText = this.add.text(940, 78, `MOVES: ${this.turnCount}/${limit}`, {
        fontSize: '13px', color: '#c73e3a', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(1, 0.5);
    }
  }

  /** 根据 round 设置挑战目标，并刷新横条显示 */
  private setChallengeForRound(round: number): void {
    // 重置每轮追踪状态
    this.turnCount = 0;
    this.hintUsedThisRound = false;
    this.challengeCompletion.clear();

    const goalGroups = GameConfig.challenges.goalsByRound;
    this.challengeGoals = round <= goalGroups.length ? goalGroups[round - 1] : [];

    // 清理旧文本
    this.challengeTexts.forEach(t => t.destroy());
    this.challengeTexts = [];

    if (this.challengeGoals.length === 0) {
      const freeText = this.add.text(110, 78, 'Free practice — no bonus goals', {
        fontSize: '13px', color: '#8b6f47', fontFamily: 'monospace',
      }).setOrigin(0, 0.5);
      this.challengeTexts.push(freeText);
      return;
    }

    let x = 110;
    for (const goal of this.challengeGoals) {
      const prefix = goal.optional ? 'OPT:' : 'MAIN:';
      const text = this.add.text(x, 78, `${prefix} ${goal.desc} [+${goal.bonus}]`, {
        fontSize: '13px', color: goal.optional ? '#c9b89a' : '#f5e6d3', fontFamily: 'monospace',
      }).setOrigin(0, 0.5);
      text.setData('goalId', goal.id);
      this.challengeTexts.push(text);
      x += text.width + 28;
    }
  }

  /** 赢牌时检查所有挑战目标，返回累计 bonus 分数 */
  private checkChallenges(score: import('@/types').ScoreResult): number {
    let totalBonus = 0;
    for (const goal of this.challengeGoals) {
      if (this.challengeCompletion.get(goal.id)) continue;
      let done = false;
      switch (goal.type) {
        case 'yaku':
          done = goal.targetId ? score.yakuList.some(y => y.yaku.id === goal.targetId) : false;
          break;
        case 'multiYaku':
          done = goal.count ? score.yakuList.length >= goal.count : false;
          break;
        case 'han':
          done = goal.count ? score.totalHan >= goal.count : false;
          break;
        case 'noHint':
          done = !this.hintUsedThisRound;
          break;
        case 'fastWin':
          done = goal.count ? this.turnCount <= goal.count : false;
          break;
      }
      if (done) {
        this.challengeCompletion.set(goal.id, true);
        totalBonus += goal.bonus;
      }
    }
    this.updateChallengeBarDisplay();
    return totalBonus;
  }

  private updateChallengeBarDisplay(): void {
    for (const text of this.challengeTexts) {
      const goalId = text.getData('goalId') as string;
      const goal = this.challengeGoals.find(g => g.id === goalId);
      if (!goal) continue;
      const done = this.challengeCompletion.get(goal.id);
      const prefix = goal.optional ? 'OPT:' : 'MAIN:';
      text.setText(`${done ? '\u2713 ' : ''}${prefix} ${goal.desc} [+${goal.bonus}]`);
      text.setColor(done ? '#2d6a4f' : (goal.optional ? '#c9b89a' : '#f5e6d3'));
    }
  }

  // ===== Score progress bar =====
  private createScoreProgressBar(): void {
    const barY = 106; // 在 challenge bar 下方，避免重叠
    const barWidth = 560; // 收窄到中央区域，避开两侧 discard/yakuRef 面板
    const barHeight = 8;
    const barX = 512 - barWidth / 2; // 居中

    // Background
    this.scoreProgressBg = this.add.rectangle(barX + barWidth / 2, barY, barWidth, barHeight, 0x1a0e08)
      .setStrokeStyle(1, 0x5c3825);
    // Fill (starts empty)
    this.scoreProgressBar = this.add.rectangle(barX, barY - barHeight / 2, 0, barHeight, 0xe5b567)
      .setOrigin(0, 0.5);
  }

  private updateScoreProgressBar(): void {
    const rs = this.state.runState;
    const ratio = Math.min(1, rs.score / rs.targetScore);
    const maxWidth = 560;
    this.scoreProgressBar.width = maxWidth * ratio;
    // Color shift: amber -> red as it fills
    const color = ratio >= 1 ? 0xc73e3a : 0xe5b567;
    this.scoreProgressBar.fillColor = color;
  }

  // ===== Hand area (wooden tray) =====
  private createHandArea(): void {
    // Tray background — darker wood with inner shadow
    const trayY = 600;
    const trayWidth = 960;
    const trayHeight = 96;
    const trayX = 512 - trayWidth / 2;

    // Outer shadow
    this.add.rectangle(trayX + 4, trayY + 4, trayWidth, trayHeight, 0x000000, 0.4).setOrigin(0);
    // Main tray
    this.add.rectangle(trayX, trayY, trayWidth, trayHeight, 0x3d2418).setOrigin(0)
      .setStrokeStyle(3, 0x2b1810);
    // Inner highlight
    this.add.rectangle(trayX + 2, trayY + 2, trayWidth - 4, 2, 0xd4a574, 0.3).setOrigin(0);
    // Inner bottom shadow
    this.add.rectangle(trayX + 2, trayY + trayHeight - 4, trayWidth - 4, 2, 0x000000, 0.4).setOrigin(0);

    this.handAreaBg = this.add.container(0, 0);
  }

  // ===== Discard area (left panel — aligned with Yaku Ref on right) =====
  private createDiscardArea(): void {
    const panelX = 116;
    const panelY = 280; // 下移避开挑战条
    // Background panel — 200x320, aligned with right panel
    this.add.rectangle(panelX, panelY, 200, 320, 0x1a0e08, 0.7)
      .setStrokeStyle(2, 0x5c3825);
    // Label
    this.add.text(panelX, panelY - 137, 'DISCARDS', {
      fontSize: '16px', color: '#8b6f47', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    // Divider line
    this.add.rectangle(panelX, panelY - 124, 180, 1, 0x5c3825);

    this.discardArea = this.add.container(panelX, panelY);
  }

  // ===== Message area (with frame) =====
  private createMessageArea(): void {
    // Centered between left (x=16-216) and right (x=808-1008) panels
    const frameY = 165;
    this.add.rectangle(512, frameY, 580, 56, 0x1a0e08, 0.5)
      .setStrokeStyle(2, 0xd4a574, 0.5);

    this.messageText = this.add.text(512, frameY, '', {
      fontSize: '20px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', fontStyle: 'bold',
      wordWrap: { width: 560 },
    }).setOrigin(0.5);

    // Yaku info — 缩小高度，避免与按钮区拥挤
    this.add.rectangle(512, 280, 540, 110, 0x1a0e08, 0.6)
      .setStrokeStyle(2, 0xd4a574, 0.4);
    this.yakuInfoText = this.add.text(512, 280, '', {
      fontSize: '17px', color: '#e5b567', fontFamily: 'monospace',
      align: 'center', lineSpacing: 6,
      wordWrap: { width: 500 },
    }).setOrigin(0.5);
  }

  private showButton(key: string): void {
    if (this.actionButtons[key]) this.actionButtons[key].setVisible(true);
  }

  private hideButton(key: string): void {
    if (this.actionButtons[key]) this.actionButtons[key].setVisible(false);
  }

  private hideAllButtons(): void {
    Object.values(this.actionButtons).forEach(btn => btn.setVisible(false));
  }

  private soundToggleButton!: Phaser.GameObjects.Container;
  private soundToggleText!: Phaser.GameObjects.Text;

  private createSoundToggleButton(): void {
    const x = 986;
    const y = 30;
    const bg = this.add.rectangle(0, 0, 42, 34, 0x2b1810)
      .setStrokeStyle(2, 0xd4a574);
    this.soundToggleText = this.add.text(0, 0, 'SFX', {
      fontSize: '12px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.soundToggleButton = this.add.container(x, y, [bg, this.soundToggleText])
      .setSize(42, 34)
      .setInteractive({ useHandCursor: true });

    this.soundToggleButton.on('pointerover', () => bg.setScale(1.05));
    this.soundToggleButton.on('pointerout', () => bg.setScale(1));
    this.soundToggleButton.on('pointerdown', () => {
      const newState = !this.soundManager.isEnabled();
      this.soundManager.setEnabled(newState);
      this.soundToggleText.setColor(newState ? '#d4a574' : '#666666');
      this.soundToggleText.setText(newState ? 'SFX' : 'OFF');
    });
  }

  private hintToggleButton!: Phaser.GameObjects.Container;
  private hintToggleText!: Phaser.GameObjects.Text;

  private createHintToggleButton(): void {
    const x = 940;
    const y = 30;
    const bg = this.add.rectangle(0, 0, 42, 34, 0x2b1810)
      .setStrokeStyle(2, 0xd4a574);
    this.hintToggleText = this.add.text(0, 0, 'HINT', {
      fontSize: '12px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.hintToggleButton = this.add.container(x, y, [bg, this.hintToggleText])
      .setSize(42, 34)
      .setInteractive({ useHandCursor: true });

    this.hintToggleButton.on('pointerover', () => bg.setScale(1.05));
    this.hintToggleButton.on('pointerout', () => bg.setScale(1));
    this.hintToggleButton.on('pointerdown', () => {
      this.showHints = !this.showHints;
      this.hintUsedThisRound = this.showHints;
      this.hintToggleText.setColor(this.showHints ? '#d4a574' : '#666666');
      this.hintToggleText.setText(this.showHints ? 'HINT' : 'OFF');
      this.renderHand();
      this.updateUI();
    });
  }

  /** Help button linking to the how-to-play guide */
  private createHelpButton(): void {
    const x = 894;
    const y = 30;
    const bg = this.add.rectangle(0, 0, 42, 34, 0x2b1810)
      .setStrokeStyle(2, 0x5c3825);
    const text = this.add.text(0, 0, '?', {
      fontSize: '15px', color: '#8b6f47', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, text])
      .setSize(42, 34)
      .setInteractive({ useHandCursor: true });

    container.on('pointerover', () => { bg.setScale(1.05); text.setColor('#d4a574'); });
    container.on('pointerout', () => { bg.setScale(1); text.setColor('#8b6f47'); });
    container.on('pointerdown', () => {
      this.soundManager.playClick();
      window.open('/how-to-play.html', '_blank');
    });
  }

  /** Always-visible cheat sheet for the 4 easiest yaku, with live progress bars */
  private createYakuRefPanel(): void {
    const panelX = 908; // same distance from right edge as discard from left
    const panelY = 280; // 与 Discard panel 同高
    const panelW = 200;
    const panelH = 320;

    this.yakuRefPanel = this.add.container(0, 0);
    this.yakuRefPanel.setDepth(50);
    this.yakuRefCards = [];
    this.yakuRefProgress = [];

    // Panel background
    this.add.rectangle(panelX, panelY, panelW, panelH, 0x1a0e08, 0.9)
      .setStrokeStyle(2, 0x5c3825)
      .setDepth(50);

    // Title
    this.add.text(panelX, panelY - panelH / 2 + 22, 'YAKU GUIDE', {
      fontSize: '17px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(51);

    // 精简为3张卡，每张更大更清晰
    const yakuCards = [
      { id: 'riichi', name: 'Riichi', han: '1', desc: 'Ready hand. Declare when 1 tile from win.' },
      { id: 'tanyao', name: 'Tanyao', han: '1', desc: 'All simples 2-8. No 1s, 9s, honors.' },
      { id: 'pinfu', name: 'Pinfu', han: '1', desc: '4 sequences + non-dragon pair.' },
    ];

    const cardH = 90;
    const gap = 8;
    const startY = panelY - panelH / 2 + 56;
    yakuCards.forEach((card, i) => {
      const cy = startY + i * (cardH + gap) + cardH / 2;
      const cardContainer = this.add.container(panelX, cy).setDepth(51);
      // Card bg
      const cardBg = this.add.rectangle(0, 0, panelW - 16, cardH, 0x2b1810, 0.7)
        .setStrokeStyle(1, 0xd4a574, 0.4);
      cardContainer.add(cardBg);
      // Name + han
      cardContainer.add(this.add.text(-panelW / 2 + 14, -cardH / 2 + 10, card.name, {
        fontSize: '17px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
      }));
      cardContainer.add(this.add.text(panelW / 2 - 14, -cardH / 2 + 10, `${card.han} han`, {
        fontSize: '14px', color: '#8b6f47', fontFamily: 'monospace',
      }).setOrigin(1, 0));
      // Description
      cardContainer.add(this.add.text(-panelW / 2 + 14, -cardH / 2 + 34, card.desc, {
        fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace',
        lineSpacing: 3,
        wordWrap: { width: panelW - 28 },
      }));
      // Live progress bar (bottom of card)
      const barW = panelW - 28;
      const barX = -barW / 2;
      const barY = cardH / 2 - 12;
      const barBg = this.add.rectangle(0, barY, barW, 7, 0x000000, 0.6)
        .setStrokeStyle(1, 0x5c3825);
      const barFill = this.add.rectangle(barX, barY, 0, 7, 0xe5b567)
        .setOrigin(0, 0.5);
      cardContainer.add([barBg, barFill]);
      // Progress label
      const progressLabel = this.add.text(panelW / 2 - 4, barY + 12, '0%', {
        fontSize: '13px', color: '#8b6f47', fontFamily: 'monospace',
      }).setOrigin(0, 0.5);
      cardContainer.add(progressLabel);
      (cardContainer as any).progressLabel = progressLabel;
      this.yakuRefCards.push(cardContainer);
      this.yakuRefProgress.push(barFill);
    });
  }

  /** Update the live progress bars on the yaku ref panel */
  private updateYakuRefProgress(): void {
    if (!this.state) return;
    const proximity = getYakuProximity(this.state.hand.tiles, this.state.runState.unlockedYaku);
    const proxMap = new Map(proximity.map(p => [p.yakuId, p]));
    const ids = ['riichi', 'tanyao', 'pinfu'];
    const barW = 176; // panelW - 24
    ids.forEach((id, i) => {
      const bar = this.yakuRefProgress[i];
      const cardContainer = this.yakuRefCards[i];
      if (!bar || !cardContainer) return;
      const p = proxMap.get(id);
      const score = p ? p.score : 0;
      const width = Math.max(0, Math.min(barW, (score / 100) * barW));
      bar.width = width;
      // Green when ready, gold when close, amber otherwise
      bar.fillColor = score >= 100 ? 0x4a9e4a : score >= 50 ? 0xe5b567 : 0xc9b89a;
      // Update progress label
      const label = (cardContainer as any).progressLabel as Phaser.GameObjects.Text;
      if (label) {
        label.setText(score >= 100 ? 'READY' : `${Math.round(score)}%`);
        label.setColor(score >= 100 ? '#4a9e4a' : '#8b6f47');
      }
    });
  }

  // ========== GAME ACTIONS ==========

  private drawTile(): void {
    if (this.state.phase !== 'idle') return;
    if (this.tutorialBlocksAction('draw')) return;

    // Pressure mode: hard move limit
    if (this.state.pressureMode === 'moves') {
      const limit = this.isBeginner
        ? GameConfig.pressure.moveLimit.beginner
        : GameConfig.pressure.moveLimit.normal;
      if (this.turnCount >= limit) {
        this.showMessage(`Move limit reached (${limit}) — round failed!`);
        this.endRound(false);
        return;
      }
    }

    this.turnCount++;

    const tile = this.state.wall.draw();
    if (!tile) {
      this.endRound(false);
      return;
    }

    // Clear undo snapshot — drawing a new tile commits the previous discard
    this.undoSnapshot = null;

    this.state.hand.drawnTile = tile;
    this.state.phase = 'drew';

    if (this.state.runState.isRiichi) {
      this.state.runState.riichiTurns += 1;
    }
    this.soundManager.playDraw();

    const allTiles = getAllTiles(this.state.hand);
    const win = detectWin(allTiles);
    if (win) {
      this.showMessage('Tsumo! You can win with this tile!');
    } else if (this.state.isPuzzle || this.isBeginner) {
      this.showMessage('Click a tile to discard');
      this.time.delayedCall(4500, () => this.showMessage(''));
    }

    this.renderHand();
    this.updateUI();

    // Auto-advance tutorial after drawing
    if (this.isBeginner && this.tutorialStep >= 0) {
      const current = GameConfig.beginner.tutorialSteps[this.tutorialStep];
      if (current?.id === 'draw') {
        this.advanceTutorial();
      }
    }
  }

  private discardTile(tileId: string): void {
    if (this.state.phase !== 'drew') return;
    if (this.tutorialBlocksAction('discard')) return;

    // Riichi lock: can only discard the drawn tile
    if (this.state.runState.isRiichi && this.state.hand.drawnTile) {
      if (tileId !== this.state.hand.drawnTile.id) {
        this.showMessage('Riichi lock! Can only discard the drawn tile.');
        this.time.delayedCall(1200, () => this.showMessage(''));
        return;
      }
    }

    // Save snapshot for undo (only when not in riichi — riichi auto-draws, so undo wouldn't work)
    if (!this.state.runState.isRiichi) {
      this.undoSnapshot = {
        handTiles: this.state.hand.tiles.map(t => ({ ...t })),
        drawnTile: this.state.hand.drawnTile ? { ...this.state.hand.drawnTile } : null,
      };
    } else {
      this.undoSnapshot = null;
    }

    let discarded: Tile;
    if (this.state.hand.drawnTile && this.state.hand.drawnTile.id === tileId) {
      discarded = this.state.hand.drawnTile;
      this.state.hand.drawnTile = null;
    } else {
      const idx = this.state.hand.tiles.findIndex(t => t.id === tileId);
      if (idx === -1) return;
      discarded = this.state.hand.tiles[idx];
      this.state.hand.tiles.splice(idx, 1);
      if (this.state.hand.drawnTile) {
        this.state.hand.tiles.push(this.state.hand.drawnTile);
        this.state.hand.drawnTile = null;
      }
    }

    this.state.hand.tiles = sortHand(this.state.hand.tiles);
    this.state.discardedTiles.push(discarded);
    this.state.phase = 'idle';
    if (this.state.isPuzzle) this.state.puzzleMoves++;
    this.soundManager.playDiscard();

    // Capture discard hint BEFORE renderHand clears it
    let discardHint: { keep: boolean; reason: string } | undefined;
    if (this.isBeginner && this.showHints) {
      // Compute hints for the hand before discard (need the pre-discard hand)
      discardHint = this.discardHints.get(discarded.id);
    }

    if (this.state.wall.remaining === 0) {
      this.endRound(false);
      return;
    }

    // Show tenpai hint if close to winning
    const waiting = findWaitingTiles(this.state.hand.tiles);
    if (waiting.length > 0 && !this.state.runState.isRiichi) {
      this.showYakuInfo(`Tenpai! Waiting for: ${waiting.length} tile type(s)`);
      this.soundManager.playTenpai();
      // Beginner mode: bring winning tiles to the front of the wall for easier winning
      if (this.isBeginner) {
        for (const waitKey of waiting) {
          const [suit, rankStr] = waitKey.split('-');
          this.state.wall.bringToFront(suit, parseInt(rankStr, 10), 0);
        }
      }
    } else {
      this.showYakuInfo('');
    }

    if (this.state.runState.isRiichi) {
      this.time.delayedCall(300, () => this.drawTile());
    }

    this.renderHand();
    this.updateUI();

    // Beginner mode: show discard feedback
    if (this.isBeginner && discardHint) {
      const prefix = discardHint.keep ? 'Tip: that tile was useful — ' : 'Good discard — ';
      this.showMessage(`${prefix}${discardHint.reason}`);
      this.time.delayedCall(2200, () => this.showMessage(''));
    }

    // Auto-advance tutorial after discarding
    if (this.isBeginner && this.tutorialStep >= 0) {
      const current = GameConfig.beginner.tutorialSteps[this.tutorialStep];
      if (current?.id === 'discard') {
        this.advanceTutorial();
      }
    }
  }

  // ===== Undo the last discard (misclick protection) =====
  private undoDiscard(): void {
    if (!this.undoSnapshot || this.state.phase !== 'idle') return;
    // Only allow undo if we haven't drawn again since the discard
    // Restore hand state
    this.state.hand.tiles = this.undoSnapshot.handTiles;
    this.state.hand.drawnTile = this.undoSnapshot.drawnTile;
    // Remove the last discarded tile
    const lastDiscard = this.state.discardedTiles.pop();
    // Return to 'drew' phase (we're back to having a drawn tile or needing to re-evaluate)
    this.state.phase = 'drew';
    this.undoSnapshot = null;
    this.soundManager.playClick();
    if (lastDiscard) {
      this.showMessage(`Undid discard of ${lastDiscard.suit}-${lastDiscard.rank}`);
      this.time.delayedCall(3000, () => this.showMessage(''));
    }
    this.renderHand();
    this.updateUI();
  }

  private declareRiichi(): void {
    if (this.state.phase !== 'idle') return;
    if (this.tutorialBlocksAction('riichi')) return;
    if (this.state.runState.isRiichi) return;

    const waiting = findWaitingTiles(this.state.hand.tiles);
    if (waiting.length === 0) {
      this.showMessage('Not in tenpai! Cannot declare Riichi.');
      this.time.delayedCall(5000, () => this.showMessage(''));
      return;
    }

    this.state.runState.isRiichi = true;
    this.state.runState.riichiTurns = 0; // reset ippatsu counter
    // Puzzle mode: guarantee the next draw completes the ready hand
    if (this.state.isPuzzle && this.state.puzzleId && waiting.length > 0) {
      const [suit, rankStr] = waiting[0].split('-');
      this.state.wall.bringToFront(suit, parseInt(rankStr, 10), 0);
    }
    // Reveal a dora indicator from the wall when riichi is declared
    const doraIndicator = this.state.wall.revealDoraIndicator();
    if (doraIndicator) {
      this.state.runState.doraIndicators = this.state.wall.doraIndicators;
    }
    this.soundManager.playRiichi();
    const doraMsg = doraIndicator ? ` Dora: ${doraIndicator.suit}-${doraIndicator.rank}` : '';
    this.showMessage(`Riichi! Auto-draw enabled. Ippatsu active!${doraMsg}`);
    this.showYakuInfo(`Waiting tiles: ${waiting.length}`);
    this.time.delayedCall(3000, () => this.showMessage(''));
    persistRun(this.state.runState);

    // Tutorial: place a winning tile at the front of the wall and auto-draw it
    // so the player immediately sees the WIN button and learns the final step.
    if (this.isBeginner && this.tutorialStep >= 0) {
      const current = GameConfig.beginner.tutorialSteps[this.tutorialStep];
      if (current?.id === 'riichi') {
        const waitKeys = findWaitingTiles(this.state.hand.tiles);
        if (waitKeys.length > 0) {
          const [suit, rankStr] = waitKeys[0].split('-');
          this.state.wall.bringToFront(suit, parseInt(rankStr, 10), 0);
        }
        this.updateUI();
        this.advanceTutorial(); // move to WIN step
        this.time.delayedCall(600, () => this.drawTile());
        return;
      }
    }

    this.updateUI();

    // Auto-advance tutorial after declaring riichi (non-tutorial path)
    if (this.isBeginner && this.tutorialStep >= 0) {
      const current = GameConfig.beginner.tutorialSteps[this.tutorialStep];
      if (current?.id === 'riichi') {
        this.advanceTutorial();
      }
    }
  }

  private declareWin(): void {
    if (this.state.phase !== 'drew') return;
    if (this.tutorialBlocksAction('win')) return;

    const allTiles = getAllTiles(this.state.hand);
    const win = detectWin(allTiles);
    if (!win) {
      this.showMessage('Not a winning hand!');
      return;
    }

    // Ippatsu: only if riichi was declared this round AND we won on the first turn after declaration
    const isIppatsu = this.state.runState.isRiichi && this.state.runState.riichiTurns <= 1;
    const score = calculateScore(
      win,
      allTiles,
      this.state.runState.isRiichi,
      this.state.runState.unlockedYaku,
      isIppatsu,
      this.state.runState.doraIndicators
    );

    // Require at least 1 yaku to win
    if (score.totalHan === 0) {
      this.showMessage('No yaku! Need at least one winning pattern.');
      this.soundManager.playClick();
      return;
    }

    // Puzzle mode: show completion card immediately, no run progression
    if (this.state.isPuzzle) {
      this.showPuzzleComplete(score);
      return;
    }

    const challengeBonus = this.checkChallenges(score);
    const pressureBonus = this.state.pressureMode === 'moves' ? GameConfig.pressure.bonus : 0;
    const finalScore = score.finalScore + challengeBonus + pressureBonus;
    this.state.roundScore = finalScore;
    this.state.runState.score += finalScore;
    this.state.phase = 'won';
    this.soundManager.playWin();
    // Analytics: track win with yaku breakdown
    trackWin(
      score.yakuList.map(y => y.yaku.id),
      score.totalHan,
      score.finalScore,
      this.state.runState.isRiichi
    );

    // Visual pop on win — message scales in with bounce
    const bonusParts: string[] = [];
    if (challengeBonus > 0) bonusParts.push(`GOAL +${challengeBonus}`);
    if (pressureBonus > 0) bonusParts.push(`PRESSURE +${pressureBonus}`);
    const winMsg = bonusParts.length > 0
      ? `WIN! +${finalScore} pts  (${bonusParts.join(' | ')})`
      : `WIN! +${finalScore} pts`;
    this.showMessage(winMsg);
    this.messageText.setScale(0.3);
    this.tweens.add({
      targets: this.messageText,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });
    // Flash effect — brief golden rectangle overlay
    const flash = this.add.rectangle(512, 360, 1024, 720, 0xe5b567, 0.3);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 500,
      onComplete: () => flash.destroy(),
    });
    this.showScoreBreakdown(score, isIppatsu);

    persistRun(this.state.runState);
    this.endRound(true);
    // 延迟显示教学卡片，让赢牌动画先播完（tutorial 期间不显示，tutorial 自身会推进）
    const inTutorial = this.isBeginner && this.tutorialStep >= 0;
    if (!inTutorial) {
      this.time.delayedCall(900, () => this.showLessonCard(score));
    }

    // Auto-advance tutorial after winning
    if (inTutorial) {
      const current = GameConfig.beginner.tutorialSteps[this.tutorialStep];
      if (current?.id === 'win') {
        this.advanceTutorial();
      }
    }
  }

  /**
   * Display a detailed score breakdown so players understand how their score is computed.
   * Satisfies the "teach mahjong organically" constraint.
   */
  private showScoreBreakdown(score: import('@/types').ScoreResult, isIppatsu: boolean): void {
    const b = score.breakdown;
    const lines: string[] = [];

    // Yaku list
    if (score.yakuList.length > 0) {
      const yakuLine = score.yakuList.map(y => `${y.yaku.name}(${y.han}h)`).join(' + ');
      lines.push(`Yaku: ${yakuLine} = ${b.baseHan}h`);
    }

    // Bonus han
    const bonusParts: string[] = [];
    if (b.doraHan > 0) bonusParts.push(`Dora +${b.doraHan}h`);
    if (b.ippatsuHan > 0) bonusParts.push(`Ippatsu +${b.ippatsuHan}h`);
    if (b.uraDoraHan > 0) bonusParts.push(`Ura-dora +${b.uraDoraHan}h`);
    if (bonusParts.length > 0) {
      lines.push(`Bonus: ${bonusParts.join(' | ')}`);
    }

    lines.push(`Total: ${score.totalHan} han -> ${b.basePoints} base pts`);

    lines.push(`=> FINAL: ${score.finalScore} pts`);

    this.yakuInfoText.setText(lines.join('\n'));
  }

  /**
   * 教学卡片：每局赢牌后弹出"这局你学到了什么"，列出用到的 yaku 及解释，
   * 并链接到 /yaku-list.html 深入学习。让游戏成为 SEO 内容的实战练习场。
   */
  private showLessonCard(score: import('@/types').ScoreResult): void {
    if (score.yakuList.length === 0) return;
    // 教程进行中不打断（教程自身会推进）
    if (this.isBeginner && this.tutorialStep >= 0 && this.tutorialOverlay) return;

    const depth = 950;
    const elements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.78).setDepth(depth);
    elements.push(overlay);

    const cardW = 660;
    const cardH = 460;
    const card = this.add.rectangle(512, 360, cardW, cardH, 0x1a0f08)
      .setStrokeStyle(3, 0xe5b567).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - cardH / 2 + 4, cardW - 10, 3, 0xe5b567).setDepth(depth);
    elements.push(card, topAccent);

    const title = this.add.text(512, 360 - cardH / 2 + 36, 'LESSON COMPLETE', {
      fontSize: '24px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth);
    const subtitle = this.add.text(512, 360 - cardH / 2 + 68, 'You won using these patterns:', {
      fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(depth);
    elements.push(title, subtitle);

    // 挑战目标完成状态
    const completedGoals = this.challengeGoals.filter(g => this.challengeCompletion.get(g.id));
    const challengeLines = this.challengeGoals.map(g => {
      const done = this.challengeCompletion.get(g.id);
      const prefix = g.optional ? 'OPT' : 'MAIN';
      return `${done ? '\u2713' : '\u25cb'} ${prefix}: ${g.desc}${done ? ` +${g.bonus}` : ''}`;
    });
    if (challengeLines.length > 0) {
      const allDone = completedGoals.length === this.challengeGoals.length;
      const goalHeader = this.add.text(512, 360 - cardH / 2 + 90, allDone ? 'ALL GOALS COMPLETE!' : 'GOAL PROGRESS', {
        fontSize: '14px', color: allDone ? '#2d6a4f' : '#8b6f47',
        fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(depth);
      elements.push(goalHeader);
      const goalText = this.add.text(512, 360 - cardH / 2 + 112, challengeLines.join('\n'), {
        fontSize: '12px', color: '#c9b89a', fontFamily: 'monospace',
        align: 'center', lineSpacing: 3,
      }).setOrigin(0.5).setDepth(depth);
      elements.push(goalText);
    }

    // Yaku 列表（最多展示 4 个，避免溢出）
    let yPos = 360 - cardH / 2 + (this.challengeGoals.length > 0 ? 150 : 104);
    const shown = score.yakuList.slice(0, 4);
    for (const { yaku, han } of shown) {
      const yakuLine = this.add.text(512, yPos, `${yaku.name} (${yaku.romaji})  +${han} han`, {
        fontSize: '17px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(depth);
      yPos += 24;
      const desc = this.add.text(512, yPos, yaku.description, {
        fontSize: '13px', color: '#c9b89a', fontFamily: 'monospace',
        align: 'center', wordWrap: { width: cardW - 80 }, lineSpacing: 3,
      }).setOrigin(0.5).setDepth(depth);
      yPos += desc.height + 14;
      elements.push(yakuLine, desc);
    }

    // 链接到 yaku-list 文章（SEO 闭环：游戏 → 内容）
    const linkY = 360 + cardH / 2 - 76;
    const link = this.add.text(512, linkY, 'Read full guide → /yaku-list.html', {
      fontSize: '13px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'underline',
    }).setOrigin(0.5).setDepth(depth);
    link.setInteractive({ useHandCursor: true });
    link.on('pointerover', () => link.setColor('#e5b567'));
    link.on('pointerout', () => link.setColor('#d4a574'));
    link.on('pointerdown', () => {
      window.open('/yaku-list.html', '_blank');
    });
    elements.push(link);

    // GOT IT 按钮
    const btnW = 200;
    const btnH = 48;
    const btnY = 360 + cardH / 2 - 34;
    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(512, btnY, 'GOT IT', {
      fontSize: '17px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth);
    const btnHit = this.add.rectangle(512, btnY, btnW, btnH, 0xffffff, 0).setDepth(depth + 1);
    elements.push(btnBg, btnText, btnHit);

    btnHit.setInteractive({ useHandCursor: true });
    btnHit.on('pointerover', () => btnBg.setFillStyle(0xe04e4a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0xc73e3a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
    });
  }

  private showPuzzleComplete(score: import('@/types').ScoreResult): void {
    const puzzle = GameConfig.puzzles.items.find(p => p.id === this.state.puzzleId);
    if (!puzzle) return;

    const goalYaku = puzzle.goalYaku as string | undefined;
    const goalAchieved = goalYaku
      ? score.yakuList.some(({ yaku }) => yaku.id === goalYaku)
      : score.totalHan > 0;

    const moves = this.state.puzzleMoves;
    const optimal = puzzle.optimalMoves ?? 0;
    const perfect = goalAchieved && moves <= optimal && optimal > 0;

    const depth = 960;
    const elements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.78).setDepth(depth);
    elements.push(overlay);

    const cardW = 660;
    const cardH = 520;
    const card = this.add.rectangle(512, 360, cardW, cardH, 0x1a0f08)
      .setStrokeStyle(3, 0xe5b567).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - cardH / 2 + 4, cardW - 10, 3, 0xe5b567).setDepth(depth);
    elements.push(card, topAccent);

    const title = this.add.text(512, 360 - cardH / 2 + 36, goalAchieved ? 'PUZZLE SOLVED' : 'HAND COMPLETE', {
      fontSize: '26px', color: goalAchieved ? '#e5b567' : '#c9b89a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth);
    const nameText = this.add.text(512, 360 - cardH / 2 + 70, puzzle.name, {
      fontSize: '18px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth);
    elements.push(title, nameText);

    let yPos = 360 - cardH / 2 + 108;
    const goalLabel = goalYaku
      ? `GOAL YAKU: ${goalYaku.toUpperCase()} ${goalAchieved ? '\u2713' : '\u2717'}`
      : `GOAL: complete any hand ${goalAchieved ? '\u2713' : '\u2717'}`;
    const goalText = this.add.text(512, yPos, goalLabel, {
      fontSize: '15px', color: goalAchieved ? '#2d6a4f' : '#c73e3a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth);
    elements.push(goalText);
    yPos += 28;

    const movesText = this.add.text(512, yPos, `MOVES: ${moves} / ${optimal > 0 ? optimal : '-'}${perfect ? '  PERFECT!' : ''}`, {
      fontSize: '15px', color: perfect ? '#e5b567' : '#c9b89a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth);
    elements.push(movesText);
    yPos += 34;

    const yakuHeader = this.add.text(512, yPos, 'YAKU ACHIEVED', {
      fontSize: '14px', color: '#8b6f47', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth);
    elements.push(yakuHeader);
    yPos += 22;

    if (score.yakuList.length === 0) {
      const none = this.add.text(512, yPos, 'None', {
        fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(depth);
      elements.push(none);
      yPos += 20;
    } else {
      for (const { yaku, han } of score.yakuList) {
        const line = this.add.text(512, yPos, `${yaku.name} (${yaku.romaji})  +${han} han`, {
          fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(depth);
        elements.push(line);
        yPos += 22;
      }
    }

    const desc = this.add.text(512, 360 + cardH / 2 - 110, puzzle.description, {
      fontSize: '13px', color: '#c9b89a', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: cardW - 80 }, lineSpacing: 3,
    }).setOrigin(0.5).setDepth(depth);
    elements.push(desc);

    const btnY = 360 + cardH / 2 - 54;
    const tryAgain = this.createPuzzleCardButton(400, btnY, 'TRY AGAIN', () => {
      this.scene.restart({ action: 'puzzle', puzzleId: this.state.puzzleId });
    });
    const backToMenu = this.createPuzzleCardButton(624, btnY, 'BACK TO MENU', () => {
      this.scene.start('DeckSelectScene');
    });
    elements.push(...tryAgain, ...backToMenu);

    this.state.phase = 'won';
  }

  private createPuzzleCardButton(
    x: number, y: number, label: string, callback: () => void
  ): Phaser.GameObjects.GameObject[] {
    const depth = 970;
    const btnW = 190;
    const btnH = 46;
    const bg = this.add.rectangle(x, y, btnW, btnH, 0xd4a574)
      .setStrokeStyle(3, 0x2b1810).setDepth(depth);
    const text = this.add.text(x, y, label, {
      fontSize: '15px', color: '#2b1810', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth);
    const hit = this.add.rectangle(x, y, btnW, btnH, 0xffffff, 0).setDepth(depth + 1);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => bg.setFillStyle(0xe5b567));
    hit.on('pointerout', () => bg.setFillStyle(0xd4a574));
    hit.on('pointerdown', () => {
      this.soundManager.playClick();
      callback();
    });
    return [bg, text, hit];
  }

  private endRound(won: boolean): void {
    if (won) {
      this.state.phase = 'won';
    } else {
      // Beginner mode: reaching tenpai when the wall runs out is progress,
      // so we count it as a survived round instead of a game over.
      const waiting = findWaitingTiles(this.state.hand.tiles);
      if (this.isBeginner && waiting.length > 0) {
        this.state.phase = 'survived';
        this.showMessage(`Round survived! You were ready to win (tenpai). Score: ${this.state.runState.score}/${this.state.runState.targetScore}`);
      } else if (this.state.runState.score >= this.state.runState.targetScore) {
        this.state.phase = 'survived';
        this.showMessage(`Round survived! Score: ${this.state.runState.score}/${this.state.runState.targetScore}`);
      } else {
        // Game over - run failed
        this.state.phase = 'lost';
        this.showMessage(`Game Over! Score: ${this.state.runState.score}/${this.state.runState.targetScore}`);
        this.soundManager.playGameOver();
        const { meta, newAchievements } = endRun(this.state.runState, false);
        trackRunComplete(false, this.state.runState.score, this.state.runState.round);
        this.time.delayedCall(2000, () => {
          this.scene.launch('GameOverScene', { runState: this.state.runState, won: false, meta, newAchievements });
          this.scene.pause();
        });
        return;
      }
    }

    persistRun(this.state.runState);
    this.renderHand();
    this.updateUI();
  }

  // ========== ROUND TRANSITION ==========

  private proceedToNextRound(): void {
    if (this.state.phase !== 'won' && this.state.phase !== 'survived') return;

    // Check if run is complete (final round)
    if (checkRunComplete(this.state.runState)) {
      // Run won!
      const { meta, newAchievements } = endRun(this.state.runState, true);
      trackRunComplete(true, this.state.runState.score, this.state.runState.round);
      // Mark beginner mode as completed
      if (this.state.runState.maxRounds === GameConfig.beginner.maxRounds) {
        localStorage.setItem(GameConfig.beginner.completedKey, '1');
      }
      this.scene.launch('GameOverScene', { runState: this.state.runState, won: true, meta, newAchievements });
      this.scene.pause();
      return;
    }

    // Advance to next round (no reward screen — learning lab flow: win → lesson card → next round)
    this.state.runState = advanceRound(this.state.runState);
    this.state.runState.isRiichi = false;
    this.state.runState.riichiTurns = 0;
    this.state.runState.doraIndicators = [];
    this.state.wall = new TileWall();
    this.state.hand = createHand();
    this.state.discardedTiles = [];
    this.state.roundScore = 0;
    this.state.phase = 'idle';
    this.dealInitialHand();
    this.setChallengeForRound(this.state.runState.round);
    this.showMessage('');
    this.renderHand();
    this.updateUI();
    this.showRoundIntro();
  }

  /**
   * 开场教学横幅：每关开始时显示"本课学什么"，给玩家明确学习目标。
   * Round 1-3 对应核心 yaku（Riichi/Tanyao/Pinfu），4+ 为自由练习。
   */
  private showRoundIntro(): void {
    const round = this.state.runState.round;
    const themes: { title: string; desc: string }[] = [
      { title: 'RIICHI', desc: 'Declare a ready hand — +1 han bonus' },
      { title: 'TANYAO', desc: 'Win with all simples (no 1s, 9s, or honors)' },
      { title: 'PINFU', desc: 'All chows + non-dragon pair = 1 han' },
    ];
    const theme = round <= themes.length ? themes[round - 1] : null;
    const lessonTitle = theme ? `LESSON ${round}: ${theme.title}` : `LESSON ${round}: FREE PRACTICE`;
    const lessonDesc = theme ? theme.desc : 'Use any yaku you have learned so far';

    const depth = 900;
    const elements: Phaser.GameObjects.GameObject[] = [];

    const banner = this.add.rectangle(512, 200, 560, 130, 0x1a0f08)
      .setStrokeStyle(3, 0xe5b567).setDepth(depth);
    const topAccent = this.add.rectangle(512, 200 - 65 + 4, 550, 3, 0xe5b567).setDepth(depth);
    elements.push(banner, topAccent);

    const title = this.add.text(512, 175, lessonTitle, {
      fontSize: '24px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth);
    const desc = this.add.text(512, 218, lessonDesc, {
      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: 500 },
    }).setOrigin(0.5).setDepth(depth);
    elements.push(title, desc);

    // 自动消失或点击消失
    const dismiss = () => {
      this.tweens.add({
        targets: elements,
        alpha: 0,
        duration: 300,
        onComplete: () => elements.forEach(el => el.destroy()),
      });
    };
    banner.setInteractive({ useHandCursor: true });
    banner.on('pointerdown', dismiss);
    this.time.delayedCall(6000, dismiss);
  }

  // ========== RENDERING ==========

  private renderHand(): void {
    this.hideTooltip();
    this.tileSprites.forEach(s => s.destroy());
    this.tileSprites = [];

    const hand = this.state.hand;
    const tileSpacing = 4;
    const totalWidth = hand.tiles.length * (TILE_WIDTH + tileSpacing);
    const startX = 512 - totalWidth / 2;
    const y = 620;

    // Compute discard hints only for beginner mode; normal mode = player decides
    this.discardHints = new Map();
    if (this.isBeginner && this.showHints && this.state.phase === 'drew') {
      const allTiles = [...hand.tiles];
      if (hand.drawnTile) allTiles.push(hand.drawnTile);
      this.discardHints = getDiscardHints(allTiles, this.state.runState.unlockedYaku);
    }

    // Beginner mode only: compute recommended discard tile id for yellow glow
    this.recommendedDiscardId = null;
    if (this.isBeginner && this.showHints && this.state.phase === 'drew') {
      // Riichi lock: only the drawn tile can be discarded, so glow it explicitly.
      if (this.state.runState.isRiichi && hand.drawnTile) {
        this.recommendedDiscardId = hand.drawnTile.id;
      } else {
        const allTiles = [...hand.tiles];
        if (hand.drawnTile) allTiles.push(hand.drawnTile);
        const rec = recommendDiscard(allTiles, this.discardHints);
        if (rec) this.recommendedDiscardId = rec.id;
      }
    }

    hand.tiles.forEach((tile, index) => {
      const x = startX + index * (TILE_WIDTH + tileSpacing);
      const hint = this.discardHints.get(tile.id);
      const isRecommended = tile.id === this.recommendedDiscardId;
      const sprite = this.createTileSprite(tile, x, y, false, hint, isRecommended);
      this.tileSprites.push(sprite);
    });

    if (hand.drawnTile) {
      const drawnX = startX + hand.tiles.length * (TILE_WIDTH + tileSpacing) + 20;
      const hint = this.discardHints.get(hand.drawnTile.id);
      const isRecommended = hand.drawnTile.id === this.recommendedDiscardId;
      const sprite = this.createTileSprite(hand.drawnTile, drawnX, y, true, hint, isRecommended);
      this.tileSprites.push(sprite);
    }

    this.renderDiscards();
  }

  private createTileSprite(tile: Tile, x: number, y: number, isDrawn: boolean = false, hint?: { keep: boolean; reason: string }, isRecommended: boolean = false): Phaser.GameObjects.Container {
    const textureKey = `tile-${tileKey(tile)}`;
    const sprite = this.add.image(0, 0, textureKey);
    const shadow = this.add.rectangle(2, 4, TILE_WIDTH, TILE_HEIGHT, 0x000000, 0.3);

    const container = this.add.container(x, y, [shadow, sprite]);
    (container as any).tile = tile;
    container.setSize(TILE_WIDTH, TILE_HEIGHT);
    container.setInteractive({ useHandCursor: true });

    // Highlight drawn tile
    if (isDrawn) {
      const highlight = this.add.rectangle(0, 0, TILE_WIDTH + 4, TILE_HEIGHT + 4, 0xd4a574, 0.3);
      container.addAt(highlight, 0);
    }

    // Beginner mode: yellow glow on the recommended discard tile
    if (isRecommended) {
      const glow = this.add.rectangle(0, 0, TILE_WIDTH + 8, TILE_HEIGHT + 8, 0xe5b567, 0.35)
        .setStrokeStyle(2, 0xe5b567, 0.9);
      container.addAt(glow, 0);
      // Pulsing animation to draw the eye
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.5, to: 1 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }

    // Discard hint border: green = keep, red = discard
    if (hint) {
      const borderColor = hint.keep ? 0x4a9e4a : 0xc73e3a;
      const border = this.add.rectangle(0, 0, TILE_WIDTH + 2, TILE_HEIGHT + 2)
        .setStrokeStyle(2, borderColor, 0.8)
        .setFillStyle(0x000000, 0);
      container.addAt(border, 0);
      // Small dot indicator at top-left
      const dot = this.add.rectangle(-TILE_WIDTH / 2 + 4, -TILE_HEIGHT / 2 + 4, 6, 6, borderColor);
      container.add(dot);
    }

    // Beginner mode: show tile label (short name) — white text on dark bg for readability
    if (this.isBeginner) {
      const label = this.getTileLabel(tile);
      const labelBg = this.add.rectangle(0, TILE_HEIGHT / 2 - 10, 42, 20, 0x000000, 0.8);
      const labelText = this.add.text(0, TILE_HEIGHT / 2 - 10, label, {
        fontSize: '14px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      container.add([labelBg, labelText]);
    }

    container.on('pointerover', () => {
      container.setY(y - 8);
      this.showTileTooltip(tile, x, y - TILE_HEIGHT - 20, hint?.reason);
    });
    container.on('pointerout', () => {
      container.setY(y);
      this.hideTooltip();
    });
    container.on('pointerdown', () => {
      if (this.state.phase === 'drew') {
        this.discardTile(tile.id);
      }
    });

    return container;
  }

  /** Get a short label for beginner mode tile recognition */
  private getTileLabel(tile: Tile): string {
    if (tile.suit === 'man') return `${tile.rank}m`;
    if (tile.suit === 'pin') return `${tile.rank}p`;
    if (tile.suit === 'sou') return `${tile.rank}s`;
    if (tile.suit === 'wind') return ['E', 'S', 'W', 'N'][tile.rank - 1] || '?';
    if (tile.suit === 'dragon') return ['Rd', 'Wh', 'Gr'][tile.rank - 1] || '?';
    return '?';
  }

  private showTileTooltip(tile: Tile, x: number, y: number, hintReason?: string): void {
    this.hideTooltip();
    const display = getTileDisplay(tile);

    const tooltipLines = [display.englishName, `(${display.romaji})`, display.westernHint];
    if (hintReason) {
      tooltipLines.push('', hintReason);
    }

    this.tooltipBg = this.add.rectangle(x, y, 220, 76 + (hintReason ? 34 : 0), 0x1a0f08, 0.95)
      .setStrokeStyle(2, 0xd4a574)
      .setDepth(1000);

    this.tooltipText = this.add.text(x, y, tooltipLines.join('\n'), {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5).setDepth(1001);
  }

  private hideTooltip(): void {
    if (this.tooltipText) { this.tooltipText.destroy(); this.tooltipText = null; }
    if (this.tooltipBg) { this.tooltipBg.destroy(); this.tooltipBg = null; }
  }

  private renderDiscards(): void {
    // Clear existing discard tiles in the discard area container
    this.discardArea.list.forEach(obj => obj.destroy());
    this.discardArea.removeAll();

    // Show last 6 discards in a 3x2 grid using real tile textures
    const recent = this.state.discardedTiles.slice(-6);
    const miniW = 52;
    const miniH = 66;
    const cols = 3;
    const gap = 10;
    const startX = -((cols * miniW + (cols - 1) * gap) / 2) + miniW / 2;
    const startY = -55;

    recent.forEach((tile, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (miniW + gap);
      const y = startY + row * (miniH + gap);

      const textureKey = `tile-${tileKey(tile)}`;
      // Tile backing + subtle shadow
      const shadow = this.add.rectangle(x + 2, y + 3, miniW, miniH, 0x000000, 0.35);
      const border = this.add.rectangle(x, y, miniW + 2, miniH + 2)
        .setStrokeStyle(2, 0xd4a574, 0.5)
        .setFillStyle(0x000000, 0);
      const sprite = this.add.image(x, y, textureKey)
        .setDisplaySize(miniW, miniH);

      this.discardArea.add([shadow, border, sprite]);
    });

    // Discard count label at bottom
    const count = this.state.discardedTiles.length;
    const countLabel = count === 1 ? '1 tile discarded' : `${count} tiles discarded`;
    const countText = this.add.text(0, 145, countLabel, {
      fontSize: '13px', color: '#8b6f47', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.discardArea.add(countText);
  }

  private showMessage(msg: string): void {
    this.messageText.setText(msg);
  }

  private showYakuInfo(msg: string): void {
    this.yakuInfoText.setText(msg);
  }

  private updateUI(): void {
    const rs = this.state.runState;
    this.uiText.round.setText(`${rs.round}/${rs.maxRounds}`);
    this.uiText.score.setText(`${rs.score}`);
    this.uiText.target.setText(`${rs.targetScore}`);
    this.uiText.wall.setText(`${this.state.wall.remaining}`);

    const phaseLabels: Record<GamePhase, string> = {
      idle: 'Your Turn', drew: 'Discard or Win', won: 'Round Won!',
      survived: 'Round Survived!', lost: 'Game Over',
    };
    this.uiText.phase.setText(phaseLabels[this.state.phase]);

    // Update progress bar
    this.updateScoreProgressBar();

    // Update pressure move counter
    if (this.pressureText && this.state.pressureMode === 'moves') {
      const limit = this.isBeginner
        ? GameConfig.pressure.moveLimit.beginner
        : GameConfig.pressure.moveLimit.normal;
      const remaining = limit - this.turnCount;
      this.pressureText.setText(`MOVES: ${this.turnCount}/${limit}`);
      this.pressureText.setColor(remaining <= 3 ? '#c73e3a' : '#e5b567');
    }

    this.hideAllButtons();
    let canWin = false;
    let canRiichi = false;
    switch (this.state.phase) {
      case 'idle':
        this.showButton('draw');
        if (!rs.isRiichi) {
          this.showButton('riichi');
          // Riichi is available only in tenpai — glow when ready
          const waiting = findWaitingTiles(this.state.hand.tiles);
          if (waiting.length > 0) canRiichi = true;
        }
        // Show undo button only when a discard can be undone
        if (this.undoSnapshot) this.showButton('undo');
        break;
      case 'drew':
        const allTiles = getAllTiles(this.state.hand);
        if (detectWin(allTiles)) {
          this.showButton('win');
          canWin = true;
        }
        break;
      case 'won':
      case 'survived':
        this.showButton('nextRound');
        break;
      case 'lost':
        this.showButton('newRun');
        break;
    }

    // Button glow effects for beginner mode (and any mode when hints on)
    this.updateButtonGlow('win', canWin);
    this.updateButtonGlow('riichi', canRiichi);

    // Show yaku proximity hints only in beginner mode (normal mode = player decides)
    if (this.isBeginner && this.showHints && (this.state.phase === 'idle' || this.state.phase === 'drew')) {
      const proximity = getYakuProximity(this.state.hand.tiles, rs.unlockedYaku);
      if (proximity.length > 0) {
        const top3 = proximity.slice(0, 3);
        const lines = top3.map(p => {
          const filled = Math.round(p.score / 10);
          const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
          const pct = p.score >= 100 ? 'READY!' : `${p.score}%`;
          return `${p.yakuName}: [${bar}] ${pct}`;
        });
        this.yakuInfoText.setText(lines.join('\n'));
      }
    }

    // Live yaku ref panel progress bars
    this.updateYakuRefProgress();

    // Beginner mode: hand structure panel + recommended action
    this.updateBeginnerAssist();
  }

  /** Pulse a button's scale to draw attention when an opportunity arises */
  private updateButtonGlow(key: string, active: boolean): void {
    const btn = this.actionButtons[key];
    if (!btn) return;
    const existing = this.buttonGlowTweens.get(key);
    if (active) {
      if (!existing) {
        const tween = this.tweens.add({
          targets: btn,
          scale: { from: 1, to: 1.12 },
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
        this.buttonGlowTweens.set(key, tween);
      }
    } else {
      if (existing) {
        existing.stop();
        btn.setScale(1);
        this.buttonGlowTweens.delete(key);
      }
    }
  }

  /** Update beginner-only assist: hand structure display + recommended next action */
  private updateBeginnerAssist(): void {
    if (!this.isBeginner || !this.showHints) {
      this.handStructureText.setVisible(false);
      this.recommendedActionText.setVisible(false);
      return;
    }
    // Hand structure analysis: only show during idle phase so the summary
    // always matches the 13 tiles the player is actually holding.
    if (this.state.phase === 'idle') {
      const structure = analyzeHandStructure(this.state.hand.tiles);
      this.handStructureText.setText(structure.summary);
      this.handStructureText.setVisible(true);
    } else {
      this.handStructureText.setVisible(false);
    }

    // Live tenpai check used for recommendations and ready-state hints
    const waiting = findWaitingTiles(this.state.hand.tiles);

    // Show a ready-state hint in the center message area when tenpai
    if (waiting.length > 0 && !this.state.runState.isRiichi && this.state.phase === 'idle') {
      this.showYakuInfo(`READY HAND — waiting for: ${this.describeWaitingTiles(waiting)}`);
    }

    // Master hints were a purchasable unlock; the unlock shop has been removed,
    // so master hints are permanently off in the learning lab.
    const masterHints = false;

    // Recommended next action
    let recommendation = '';
    if (this.state.phase === 'idle') {
      if (waiting.length > 0 && !this.state.runState.isRiichi) {
        // In beginner mode, always recommend Riichi as soon as tenpai so the
        // player gets a quick, encouraging win and learns the Riichi flow.
        // In normal mode, wait for a wider wait or late wall to reduce variance.
        const isGoodWait = this.isBeginner || waiting.length >= 3 || this.state.wall.remaining < 12;
        if (isGoodWait) {
          recommendation = '>>> Declare RIICHI — your hand is ready! <<<';
        } else {
          recommendation = `>>> Ready hand — keep drawing to widen your ${waiting.length}-tile wait <<<`;
        }
        if (masterHints) {
          recommendation += `\n    Waiting for: ${this.describeWaitingTiles(waiting)}`;
        }
      } else if (this.state.runState.isRiichi) {
        recommendation = '>>> Riichi active — press D to auto-draw <<<';
      } else {
        recommendation = '>>> Press D or click DRAW TILE <<<';
      }
    } else if (this.state.phase === 'drew') {
      const allTiles = getAllTiles(this.state.hand);
      if (detectWin(allTiles)) {
        recommendation = '>>> Press W or click WIN! — you have a winning hand! <<<';
      } else if (this.state.runState.isRiichi && this.state.hand.drawnTile) {
        // Locked hand: make it crystal clear that only the drawn tile may go.
        recommendation = '>>> RIICHI LOCK — discard only the drawn tile (yellow glow) <<<';
      } else {
        // Recommend a discard
        const allTilesForRec = [...this.state.hand.tiles];
        if (this.state.hand.drawnTile) allTilesForRec.push(this.state.hand.drawnTile);
        const rec = recommendDiscard(allTilesForRec, this.discardHints);
        if (rec) {
          const name = this.getTileFullName(rec);
          recommendation = `>>> Discard the glowing tile: ${name} <<<`;
          if (masterHints) {
            const hintReason = this.discardHints.get(rec.id)?.reason;
            if (hintReason) recommendation += `\n    Why: ${hintReason}`;
          }
        } else {
          recommendation = '>>> Click any RED-border tile to discard <<<';
        }
      }
    } else if (this.state.phase === 'won' || this.state.phase === 'survived') {
      recommendation = '>>> Press N or click NEXT ROUND <<<';
    }
    this.recommendedActionText.setText(recommendation);
    this.recommendedActionText.setVisible(recommendation !== '');
  }

  /** Convert waiting tile keys to short, beginner-friendly labels */
  private describeWaitingTiles(waiting: string[]): string {
    if (waiting.length === 0) return 'none';
    const names = waiting.map(key => {
      const [suit, rankStr] = key.split('-');
      const rank = parseInt(rankStr, 10);
      if (suit === 'wind') return ['E', 'S', 'W', 'N'][rank - 1] ?? '?';
      if (suit === 'dragon') return ['Rd', 'Wh', 'Gr'][rank - 1] ?? '?';
      const suffix = suit === 'man' ? 'm' : suit === 'pin' ? 'p' : 's';
      return `${rank}${suffix}`;
    });
    if (names.length <= 4) return names.join(', ');
    return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
  }

  /** Full beginner-friendly tile name */
  private getTileFullName(tile: Tile): string {
    if (tile.suit === 'wind') {
      const names = ['East wind', 'South wind', 'West wind', 'North wind'];
      return names[tile.rank - 1] ?? 'Wind';
    }
    if (tile.suit === 'dragon') {
      const names = ['Red dragon', 'White dragon', 'Green dragon'];
      return names[tile.rank - 1] ?? 'Dragon';
    }
    const suitName = tile.suit === 'man' ? 'Characters' : tile.suit === 'pin' ? 'Circles' : 'Bamboo';
    return `${tile.rank} of ${suitName}`;
  }
}
