import Phaser from 'phaser';
import { Tile, Hand, RunState, Relic, CustomTile, Yaku } from '@/types';
import { TileWall } from '@/game/wall';
import { createHand, sortHand, getAllTiles } from '@/game/hand';
import { detectWin, findWaitingTiles } from '@/game/winDetector';
import { calculateScore, createRunState } from '@/game/scoring';
import { tileKey, getTileDisplay } from '@/game/tiles';
import { TILE_WIDTH, TILE_HEIGHT } from '@/render/tileRenderer';
import { generateRewards, Reward } from '@/roguelike/rewards';
import { addRelicToRun, addCustomTileToRun, applyYakuBoost, advanceRound, checkRunComplete, persistRun, endRun, loadYakuBonuses } from '@/roguelike/run';
import { loadRun, clearRun, loadMeta } from '@/data/storage';
import { SoundManager } from '@/render/sound';
import { getUnlockedDecks } from '@/roguelike/meta';
import { getRelicById } from '@/roguelike/relics';
import { trackRunStart, trackRoundComplete, trackRunComplete, trackRewardSelected, trackReroll, trackWin } from '@/data/analytics';
import { GameConfig } from '@/config/game-config';
import { getYakuProximity, getDiscardHints } from '@/game/yakuProximity';

type GamePhase = 'idle' | 'drew' | 'won' | 'survived' | 'lost' | 'reward';

interface GameState {
  wall: TileWall;
  hand: Hand;
  runState: RunState;
  phase: GamePhase;
  discardedTiles: Tile[];
  roundScore: number;
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
  private yakuRefPanel!: Phaser.GameObjects.Container;
  // Beginner mode tutorial
  private isBeginner: boolean = false;
  private tutorialStep: number = -1; // -1 = disabled, 0-5 = steps
  private tutorialOverlay!: Phaser.GameObjects.Container;

  constructor() {
    super('GameScene');
  }

  create(data?: { action?: string; deckId?: string; difficulty?: string }): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    this.soundManager = new SoundManager(this);

    this.isBeginner = data?.difficulty === 'beginner';

    if (data?.action === 'new_run') {
      clearRun(); // fresh run — discard any saved state
      this.startNewRun(data.deckId, data.difficulty);
    } else if (!this.state) {
      this.startNewRun();
    }
    this.createUI();
    this.renderHand();
    this.updateUI();

    // First-time player onboarding (shown once, then dismissed)
    if (!localStorage.getItem(GameConfig.storageKeys.onboarded)) {
      this.showOnboardingHint();
    } else if (this.isBeginner && this.tutorialStep === -1) {
      // Show guided tutorial for beginner mode (after onboarding, if applicable)
      this.time.delayedCall(600, () => this.startTutorial());
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
          if (this.state.phase === 'won' || this.state.phase === 'survived') this.triggerRewardScreen();
          break;
        case 'H':
          this.showHints = !this.showHints;
          this.showMessage(this.showHints ? 'Hints: ON' : 'Hints: OFF');
          this.time.delayedCall(1200, () => this.updateUI());
          this.renderHand();
          break;
      }
    });
  }

  // ===== First-time onboarding overlay =====
  private showOnboardingHint(): void {
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.85).setDepth(1000);
    const panelW = 560;
    const panelH = 420;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0xd4a574).setDepth(1001);
    // Top accent
    this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 3, 0xe5b567).setDepth(1001);

    // Title
    this.add.text(512, 360 - panelH / 2 + 36, GameConfig.ui.onboardingTitle, {
      fontSize: '22px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(1002);

    // Tips
    const tips = GameConfig.ui.onboardingTips;
    this.add.text(512, 360 - 20, tips.join('\n'), {
      fontSize: '13px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', lineSpacing: 4,
    }).setOrigin(0.5).setDepth(1002);

    // Continue button
    const btnW = 200;
    const btnH = 44;
    const btnY = 360 + panelH / 2 - 40;
    const btnShadow = this.add.rectangle(516, btnY + 4, btnW, btnH, 0x000000, 0.5).setDepth(1001);
    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810).setDepth(1001);
    this.add.rectangle(512, btnY - btnH / 2 + 3, btnW - 6, 2, 0xffffff, 0.4).setDepth(1002);
    const btnText = this.add.text(512, btnY, GameConfig.ui.onboardingButton, {
      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(1002);

    const btnContainer = this.add.container(512, btnY, [btnShadow, btnBg, btnText])
      .setSize(btnW, btnH).setInteractive({ useHandCursor: true }).setDepth(1003);

    btnContainer.on('pointerover', () => btnContainer.setScale(1.05));
    btnContainer.on('pointerout', () => btnContainer.setScale(1));
    btnContainer.on('pointerdown', () => {
      this.soundManager.playClick();
      localStorage.setItem(GameConfig.storageKeys.onboarded, '1');
      // Fade out overlay
      this.tweens.add({
        targets: [overlay, panel],
        alpha: 0,
        duration: 300,
        onComplete: () => {
          overlay.destroy();
          panel.destroy();
          btnContainer.destroy();
          // Start beginner tutorial after onboarding
          if (this.isBeginner) {
            this.time.delayedCall(400, () => this.startTutorial());
          }
        },
      });
    });
    void btnBg;
  }

  // ===== Guided tutorial for beginner mode =====
  private startTutorial(): void {
    this.tutorialStep = 0;
    this.showTutorialOverlay();
  }

  private showTutorialOverlay(): void {
    const steps = GameConfig.beginner.tutorialSteps;
    const step = this.tutorialStep;
    if (step < 0 || step >= steps.length) return;

    // Destroy existing overlay
    this.tutorialOverlay?.destroy();

    const stepText = steps[step];
    const isLast = step === steps.length - 1;

    // Semi-transparent backdrop
    const w = 1024, h = 720;
    const overlay = this.add.rectangle(512, 360, w, h, 0x000000, 0.6).setDepth(900);

    // Bottom banner for tutorial text
    const bannerY = 510;
    const bannerH = 100;
    const bannerW = 800;
    const banner = this.add.rectangle(512, bannerY, bannerW, bannerH, 0x1a0f08, 0.95)
      .setStrokeStyle(3, 0xd4a574).setDepth(901);
    this.add.rectangle(512, bannerY - bannerH / 2 + 4, bannerW - 10, 3, 0xe5b567).setDepth(902);

    // Step indicator
    this.add.text(512, bannerY - bannerH / 2 + 22, `STEP ${step + 1} / ${steps.length}`, {
      fontSize: '10px', color: '#8b6f47', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(902);

    // Tutorial text
    this.add.text(512, bannerY + 2, stepText, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: bannerW - 60 }, lineSpacing: 4,
    }).setOrigin(0.5).setDepth(902);

    // Arrow pointing to relevant area (roughly)
    if (step === 2) {
      // Point to draw button
      this.createTutorialArrow(512, 420, bannerY - bannerH / 2);
    } else if (step === 3) {
      // Point to hand area
      this.createTutorialArrow(512, 600, bannerY - bannerH / 2);
    }

    // Dismiss button
    const btnW = isLast ? 200 : 160;
    const btnH = 38;
    const btnY = bannerY + bannerH / 2 - 2;
    const btnX = 512;
    const btnBg = this.add.rectangle(btnX, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810).setDepth(902);
    this.add.rectangle(btnX, btnY - btnH / 2 + 3, btnW - 6, 2, 0xffffff, 0.4).setDepth(903);
    const label = isLast ? "LET'S GO!" : 'NEXT';
    const btnText = this.add.text(btnX, btnY, label, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(903);

    const btnContainer = this.add.container(btnX, btnY, [btnBg, btnText])
      .setSize(btnW, btnH).setInteractive({ useHandCursor: true }).setDepth(904);

    btnContainer.on('pointerover', () => btnContainer.setScale(1.05));
    btnContainer.on('pointerout', () => btnContainer.setScale(1));
    btnContainer.on('pointerdown', () => {
      this.soundManager.playClick();
      this.advanceTutorial();
    });

    this.tutorialOverlay = this.add.container(0, 0, [overlay, banner, btnContainer]);
    this.tutorialOverlay.setDepth(900);
  }

  private createTutorialArrow(fromX: number, fromY: number, toY: number): void {
    // Simple downward arrow
    const g = this.add.graphics();
    g.lineStyle(3, 0xe5b567, 0.8);
    g.lineBetween(fromX, fromY, fromX, toY - 20);
    // Arrow head
    g.fillStyle(0xe5b567, 0.8);
    g.fillTriangle(fromX, toY - 10, fromX - 8, toY - 28, fromX + 8, toY - 28);
    g.setDepth(902);
    // Pulse animation
    this.tweens.add({
      targets: g,
      alpha: 0.4,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
  }

  private advanceTutorial(): void {
    this.tutorialStep++;
    if (this.tutorialStep >= GameConfig.beginner.tutorialSteps.length) {
      this.tutorialOverlay?.destroy();
      return;
    }
    this.showTutorialOverlay();
  }

  // Called when scene resumes from RewardScene
  private handleResume(sys: Phaser.Scenes.Systems, data: { action?: string; reward?: Reward; excludeIds?: string[]; runState?: RunState }): void {
    if (data.action === 'reward_selected' && data.reward) {
      this.applyReward(data.reward);
      this.proceedAfterReward();
    } else if (data.action === 'skip_reward') {
      this.proceedAfterReward();
    } else if (data.action === 'reroll_rewards') {
      // Player spent currency/token to reroll — regenerate rewards and relaunch RewardScene
      if (data.runState) this.state.runState = data.runState;
      trackReroll(this.state.runState.rerollTokens > 0);
      const newRewards = generateRewards(
        this.state.runState.relics.map(r => r.id),
        this.state.runState.customTiles.map(t => t.id),
        this.state.runState.unlockedYaku,
        data.excludeIds || []
      );
      this.scene.launch('RewardScene', { runState: this.state.runState, rewards: newRewards });
    }
  }

  private startNewRun(deckId?: string, difficulty?: string): void {
    // Try to resume a persisted run (preserves round, score, relics, customTiles)
    const savedRun = loadRun();
    const isBeginner = difficulty === 'beginner';
    const maxRounds = isBeginner ? GameConfig.beginner.maxRounds : GameConfig.rounds.maxRounds;
    const runState = savedRun ?? createRunState(maxRounds);

    // Apply beginner mode settings
    if (isBeginner && !savedRun) {
      runState.unlockedYaku = [...GameConfig.beginner.unlockedYaku];
      runState.targetScore = Math.floor(runState.targetScore * GameConfig.beginner.scoreMultiplier);
    }

    // Apply starting relics from the selected deck (only for fresh runs)
    if (!savedRun && deckId) {
      const meta = loadMeta();
      const unlocked = getUnlockedDecks(meta);
      const deck = unlocked.find(d => d.id === deckId);
      if (deck) {
        for (const relicId of deck.startingRelics) {
          const relic = getRelicById(relicId);
          if (relic) {
            runState.relics = addRelicToRun(runState, relic).relics;
          }
        }
      }
    }

    this.state = {
      wall: new TileWall(runState.customTiles),
      hand: createHand(),
      runState,
      phase: 'idle',
      discardedTiles: [],
      roundScore: 0,
    };
    this.dealInitialHand();
    // Analytics: track run starts (only for fresh runs, not resumes)
    if (!savedRun && deckId) {
      trackRunStart(deckId);
    }
  }

  private dealInitialHand(): void {
    const tiles: Tile[] = [];
    for (let i = 0; i < 13; i++) {
      const tile = this.state.wall.draw();
      if (tile) tiles.push(tile);
    }
    this.state.hand = createHand(tiles);
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

    // ===== Score progress bar (below top bar) =====
    this.createScoreProgressBar();

    // ===== Hand area background (wooden tray for tiles) =====
    this.createHandArea();

    // ===== Discard area (right side, shows recent discards) =====
    this.createDiscardArea();

    // ===== Message area (center, with decorative frame) =====
    this.createMessageArea();

    // Action buttons
    this.createButton('draw', 512, 420, GameConfig.ui.drawButton, () => this.drawTile());
    this.createButton('riichi', 340, 420, GameConfig.ui.riichiButton, () => this.declareRiichi());
    this.createButton('win', 684, 420, GameConfig.ui.winButton, () => this.declareWin(), true);
    this.createButton('nextRound', 512, 420, GameConfig.ui.nextRoundButton, () => this.triggerRewardScreen());
    this.createButton('newRun', 512, 420, GameConfig.ui.newRunButton, () => {
      this.scene.start('DeckSelectScene');
    });
    this.createButton('undo', 824, 420, GameConfig.ui.undoButton, () => this.undoDiscard());

    // Register resume handler (only once)
    this.events.removeAllListeners('resume');
    this.events.on('resume', (sys: Phaser.Scenes.Systems, data: { action?: string; reward?: Reward }) => {
      this.handleResume(sys, data);
    });
  }

  private createButton(
    key: string, x: number, y: number, label: string,
    callback: () => void, highlight: boolean = false
  ): void {
    const width = 160;
    const height = 48;
    // Pixel-art shadow (offset black rectangle behind)
    const shadow = this.add.rectangle(4, 4, width, height, 0x000000, 0.5);
    // Main button bg with bevel
    const bg = this.add.rectangle(0, 0, width, height, highlight ? 0xc73e3a : 0xd4a574)
      .setStrokeStyle(3, 0x2b1810);
    // Top highlight (pixel bevel)
    const highlight_strip = this.add.rectangle(0, -height / 2 + 3, width - 6, 2, 0xffffff, 0.4);
    const text = this.add.text(0, 0, label, {
      fontSize: '14px', color: highlight ? '#f5e6d3' : '#2b1810',
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
    const topBg = this.add.rectangle(0, 0, 1024, 56, 0x1a0e08)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xd4a574);
    // Inner accent line
    this.add.rectangle(0, 54, 1024, 2, 0xc73e3a).setOrigin(0);

    // Round indicator (left, with icon)
    this.add.text(20, 10, GameConfig.ui.roundLabel, {
      fontSize: '9px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.round = this.add.text(20, 24, '', {
      fontSize: '18px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Score (with label)
    this.add.text(140, 10, GameConfig.ui.scoreLabel, {
      fontSize: '9px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.score = this.add.text(140, 24, '', {
      fontSize: '18px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Target (with label)
    this.add.text(300, 10, GameConfig.ui.targetLabel, {
      fontSize: '9px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.target = this.add.text(300, 24, '', {
      fontSize: '18px', color: '#c73e3a', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Wall remaining (with label)
    this.add.text(460, 10, 'WALL', {
      fontSize: '9px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.wall = this.add.text(460, 24, '', {
      fontSize: '18px', color: '#c9b89a', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Phase (right side)
    this.add.text(620, 10, 'PHASE', {
      fontSize: '9px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.phase = this.add.text(620, 24, '', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Relics display (with icon)
    this.add.text(780, 10, 'RELICS', {
      fontSize: '9px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.relics = this.add.text(780, 24, '', {
      fontSize: '14px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    });

    // Sound toggle button (top-right corner)
    this.createSoundToggleButton();
    // Hint toggle button (next to SFX)
    this.createHintToggleButton();
    // Yaku reference panel (right side, always visible for new players)
    this.createYakuRefPanel();
  }

  // ===== Score progress bar =====
  private createScoreProgressBar(): void {
    const barY = 62;
    const barWidth = 980;
    const barHeight = 8;
    const barX = 22;

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
    const maxWidth = 980;
    this.scoreProgressBar.width = maxWidth * ratio;
    // Color shift: amber -> red as it fills
    const color = ratio >= 1 ? 0xc73e3a : 0xe5b567;
    this.scoreProgressBar.fillColor = color;
  }

  // ===== Hand area (wooden tray) =====
  private createHandArea(): void {
    // Tray background — darker wood with inner shadow
    const trayY = 600;
    const trayWidth = 900;
    const trayHeight = 90;
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

  // ===== Discard area (right panel) =====
  private createDiscardArea(): void {
    const panelX = 512 + 380;
    const panelY = 300;
    // Background panel
    this.add.rectangle(panelX, panelY, 200, 280, 0x1a0e08, 0.7)
      .setStrokeStyle(2, 0x5c3825);
    // Label
    this.add.text(panelX, panelY - 120, 'DISCARDS', {
      fontSize: '11px', color: '#8b6f47', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    // Divider line
    this.add.rectangle(panelX, panelY - 105, 180, 1, 0x5c3825);

    this.discardArea = this.add.container(panelX, panelY);
  }

  // ===== Message area (with frame) =====
  private createMessageArea(): void {
    // Decorative frame around message area
    const frameY = 220;
    this.add.rectangle(512, frameY, 600, 50, 0x1a0e08, 0.5)
      .setStrokeStyle(2, 0xd4a574, 0.5);

    this.messageText = this.add.text(512, frameY, '', {
      fontSize: '24px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Yaku info — larger, framed
    this.add.rectangle(512, 310, 700, 110, 0x1a0e08, 0.6)
      .setStrokeStyle(2, 0xd4a574, 0.4);
    this.yakuInfoText = this.add.text(512, 310, '', {
      fontSize: '13px', color: '#e5b567', fontFamily: 'monospace',
      align: 'center', lineSpacing: 4,
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
    const x = 990;
    const y = 30;
    const bg = this.add.rectangle(0, 0, 36, 30, 0x2b1810)
      .setStrokeStyle(2, 0xd4a574);
    this.soundToggleText = this.add.text(0, 0, 'SFX', {
      fontSize: '11px', color: '#d4a574', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.soundToggleButton = this.add.container(x, y, [bg, this.soundToggleText])
      .setSize(36, 30)
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
    const x = 948;
    const y = 30;
    const bg = this.add.rectangle(0, 0, 36, 30, 0x2b1810)
      .setStrokeStyle(2, 0xd4a574);
    this.hintToggleText = this.add.text(0, 0, 'HINT', {
      fontSize: '10px', color: '#d4a574', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.hintToggleButton = this.add.container(x, y, [bg, this.hintToggleText])
      .setSize(36, 30)
      .setInteractive({ useHandCursor: true });

    this.hintToggleButton.on('pointerover', () => bg.setScale(1.05));
    this.hintToggleButton.on('pointerout', () => bg.setScale(1));
    this.hintToggleButton.on('pointerdown', () => {
      this.showHints = !this.showHints;
      this.hintToggleText.setColor(this.showHints ? '#d4a574' : '#666666');
      this.hintToggleText.setText(this.showHints ? 'HINT' : 'OFF');
      this.renderHand();
      this.updateUI();
    });
  }

  /** Always-visible cheat sheet for the 4 easiest yaku */
  private createYakuRefPanel(): void {
    const panelX = 936;
    const panelY = 400;
    const panelW = 170;
    const panelH = 320;

    this.yakuRefPanel = this.add.container(0, 0);
    this.yakuRefPanel.setDepth(50);

    // Panel background
    this.add.rectangle(panelX, panelY, panelW, panelH, 0x1a0e08, 0.85)
      .setStrokeStyle(2, 0xd4a574, 0.5)
      .setDepth(50);

    // Title
    this.add.text(panelX, panelY - panelH / 2 + 18, 'YAKU REF', {
      fontSize: '9px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(51);

    const yakuCards = [
      { name: 'Tanyao', han: '1', desc: 'All tiles 2-8\nNo terminals\nor honors' },
      { name: 'Pinfu', han: '1', desc: '4 sequences\n+ any pair\n(not dragon)' },
      { name: 'Riichi', han: '1', desc: 'Declare when\n1 tile from\nwinning' },
      { name: 'Yakuhai', han: '1', desc: 'Triplet of\nany dragon\ntile' },
    ];

    const cardH = 62;
    const startY = panelY - panelH / 2 + 52;
    yakuCards.forEach((card, i) => {
      const cy = startY + i * (cardH + 6);
      // Card bg
      this.add.rectangle(panelX, cy, panelW - 16, cardH, 0x2b1810, 0.7)
        .setStrokeStyle(1, 0xd4a574, 0.3)
        .setDepth(51);
      // Name + han
      this.add.text(panelX - panelW / 2 + 16, cy - 16, card.name, {
        fontSize: '10px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
      }).setDepth(52);
      this.add.text(panelX + panelW / 2 - 16, cy - 16, `${card.han} han`, {
        fontSize: '9px', color: '#8b6f47', fontFamily: 'monospace',
      }).setOrigin(1, 0).setDepth(52);
      // Description
      this.add.text(panelX - panelW / 2 + 16, cy + 4, card.desc, {
        fontSize: '8px', color: '#c9b89a', fontFamily: 'monospace',
        lineSpacing: 2,
      }).setDepth(52);
    });
  }

  // ========== GAME ACTIONS ==========

  private drawTile(): void {
    if (this.state.phase !== 'idle') return;

    const tile = this.state.wall.draw();
    if (!tile) {
      this.endRound(false);
      return;
    }

    // Clear undo snapshot — drawing a new tile commits the previous discard
    this.undoSnapshot = null;

    this.state.hand.drawnTile = tile;
    this.state.phase = 'drew';
    // Increment riichi turn counter (for ippatsu: must win on the first turn after riichi)
    if (this.state.runState.isRiichi) {
      this.state.runState.riichiTurns += 1;
    }
    this.soundManager.playDraw();

    const allTiles = getAllTiles(this.state.hand);
    const win = detectWin(allTiles);
    if (win) {
      this.showMessage('Tsumo! You can win with this tile!');
    }

    this.renderHand();
    this.updateUI();

    // Auto-advance tutorial: step 2 (draw tile) → step 3
    if (this.tutorialStep === 2) {
      this.advanceTutorial();
    }
  }

  private discardTile(tileId: string): void {
    if (this.state.phase !== 'drew') return;

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
      this.showMessage(discardHint.keep ? `Kept: ${discardHint.reason}` : `Discarded: ${discardHint.reason}`);
      this.time.delayedCall(2000, () => this.showMessage(''));
    }

    // Auto-advance tutorial: step 3 (discard) → step 4
    if (this.tutorialStep === 3) {
      this.advanceTutorial();
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
      this.time.delayedCall(1500, () => this.showMessage(''));
    }
    this.renderHand();
    this.updateUI();
  }

  private declareRiichi(): void {
    if (this.state.phase !== 'idle') return;
    if (this.state.runState.isRiichi) return;

    const waiting = findWaitingTiles(this.state.hand.tiles);
    if (waiting.length === 0) {
      this.showMessage('Not in tenpai! Cannot declare Riichi.');
      this.time.delayedCall(1500, () => this.showMessage(''));
      return;
    }

    this.state.runState.isRiichi = true;
    this.state.runState.riichiTurns = 0; // reset ippatsu counter
    // Reveal a dora indicator from the wall when riichi is declared
    const doraIndicator = this.state.wall.revealDoraIndicator();
    if (doraIndicator) {
      this.state.runState.doraIndicators = this.state.wall.doraIndicators;
    }
    this.soundManager.playRiichi();
    const doraMsg = doraIndicator ? ` Dora: ${doraIndicator.suit}-${doraIndicator.rank}` : '';
    this.showMessage(`Riichi! Auto-draw enabled. Ippatsu active!${doraMsg}`);
    this.showYakuInfo(`Waiting tiles: ${waiting.length}`);
    this.time.delayedCall(1500, () => this.showMessage(''));
    persistRun(this.state.runState);
    this.updateUI();
  }

  private declareWin(): void {
    if (this.state.phase !== 'drew') return;

    const allTiles = getAllTiles(this.state.hand);
    const win = detectWin(allTiles);
    if (!win) {
      this.showMessage('Not a winning hand!');
      return;
    }

    const yakuBonuses = loadYakuBonuses();
    // Ippatsu: only if riichi was declared this round AND we won on the first turn after declaration
    const isIppatsu = this.state.runState.isRiichi && this.state.runState.riichiTurns <= 1;
    const score = calculateScore(
      win,
      allTiles,
      this.state.runState.isRiichi,
      this.state.runState.relics,
      this.state.runState.unlockedYaku,
      yakuBonuses,
      this.state.runState.customTiles,
      isIppatsu,
      this.state.runState.doraIndicators
    );

    // Require at least 1 yaku to win
    if (score.totalHan === 0) {
      this.showMessage('No yaku! Need at least one winning pattern.');
      this.soundManager.playClick();
      return;
    }

    this.state.roundScore = score.finalScore;
    this.state.runState.score += score.finalScore;
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
    this.showMessage(`WIN! +${score.finalScore} pts`);
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

    // Multipliers
    const multParts: string[] = [];
    if (b.relicMultiplier > 0) multParts.push(`Relic x${(1 + b.relicMultiplier).toFixed(2)}`);
    if (b.customTileMultiplier > 0) multParts.push(`Custom x${(1 + b.customTileMultiplier).toFixed(2)}`);
    if (multParts.length > 0) {
      lines.push(`Multipliers: ${multParts.join(' | ')}`);
    }

    // Flat bonuses
    const flatParts: string[] = [];
    if (b.relicFlat > 0) flatParts.push(`Relic +${b.relicFlat}`);
    if (b.customTileFlat > 0) flatParts.push(`Custom +${b.customTileFlat}`);
    if (flatParts.length > 0) {
      lines.push(`Flat: ${flatParts.join(' | ')}`);
    }

    lines.push(`=> FINAL: ${score.finalScore} pts`);

    this.yakuInfoText.setText(lines.join('\n'));
  }

  private endRound(won: boolean): void {
    if (won) {
      this.state.phase = 'won';
    } else {
      // Wall exhausted — check if cumulative score meets target
      if (this.state.runState.score >= this.state.runState.targetScore) {
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

  // ========== REWARD SYSTEM ==========

  private triggerRewardScreen(): void {
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

    // Generate 3 rewards and show RewardScene
    const rewards = generateRewards(
      this.state.runState.relics.map(r => r.id),
      this.state.runState.customTiles.map(t => t.id),
      this.state.runState.unlockedYaku
    );

    this.state.phase = 'reward';
    this.scene.launch('RewardScene', { runState: this.state.runState, rewards });
    this.scene.pause();
  }

  private applyReward(reward: Reward): void {
    switch (reward.type) {
      case 'relic':
        this.state.runState = addRelicToRun(this.state.runState, reward.data as Relic);
        break;
      case 'customTile':
        this.state.runState = addCustomTileToRun(this.state.runState, reward.data as CustomTile);
        break;
      case 'yakuBoost':
        const boost = reward.data as { yaku: Yaku; hanBonus: number };
        this.state.runState = applyYakuBoost(this.state.runState, boost.yaku.id, boost.hanBonus);
        break;
    }
    persistRun(this.state.runState);
    // Analytics: track which rewards players pick
    trackRewardSelected(reward.type, reward.name);
  }

  private proceedAfterReward(): void {
    // Advance to next round
    this.state.runState = advanceRound(this.state.runState);
    // Reset per-round riichi/dora state
    this.state.runState.isRiichi = false;
    this.state.runState.riichiTurns = 0;
    this.state.runState.doraIndicators = [];
    this.state.wall = new TileWall(this.state.runState.customTiles);
    this.state.hand = createHand();
    this.state.discardedTiles = [];
    this.state.roundScore = 0;
    this.state.phase = 'idle';
    this.dealInitialHand();
    this.showMessage('');
    this.showYakuInfo('');
    this.renderHand();
    this.updateUI();
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

    // Compute discard hints when enabled and in discard phase
    this.discardHints = new Map();
    if (this.showHints && this.state.phase === 'drew') {
      const allTiles = [...hand.tiles];
      if (hand.drawnTile) allTiles.push(hand.drawnTile);
      this.discardHints = getDiscardHints(allTiles, this.state.runState.unlockedYaku);
    }

    hand.tiles.forEach((tile, index) => {
      const x = startX + index * (TILE_WIDTH + tileSpacing);
      const hint = this.discardHints.get(tile.id);
      const sprite = this.createTileSprite(tile, x, y, false, hint);
      this.tileSprites.push(sprite);
    });

    if (hand.drawnTile) {
      const drawnX = startX + hand.tiles.length * (TILE_WIDTH + tileSpacing) + 20;
      const hint = this.discardHints.get(hand.drawnTile.id);
      const sprite = this.createTileSprite(hand.drawnTile, drawnX, y, true, hint);
      this.tileSprites.push(sprite);
    }

    this.renderDiscards();
  }

  private createTileSprite(tile: Tile, x: number, y: number, isDrawn: boolean = false, hint?: { keep: boolean; reason: string }): Phaser.GameObjects.Container {
    const textureKey = `tile-${tileKey(tile)}`;
    const sprite = this.add.image(0, 0, textureKey);
    const shadow = this.add.rectangle(2, 4, TILE_WIDTH, TILE_HEIGHT, 0x000000, 0.3);

    const container = this.add.container(x, y, [shadow, sprite]);
    container.setSize(TILE_WIDTH, TILE_HEIGHT);
    container.setInteractive({ useHandCursor: true });

    // Highlight drawn tile
    if (isDrawn) {
      const highlight = this.add.rectangle(0, 0, TILE_WIDTH + 4, TILE_HEIGHT + 4, 0xd4a574, 0.3);
      container.addAt(highlight, 0);
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

    // Beginner mode: show tile label (short name)
    if (this.isBeginner) {
      const label = this.getTileLabel(tile);
      const labelColor = tile.suit === 'dragon' ? '#c73e3a'
        : tile.suit === 'wind' ? '#5c4033'
        : tile.suit === 'man' ? '#1a1a2e'
        : tile.suit === 'pin' ? '#2c5f8a'
        : '#2d6a4f';
      const labelBg = this.add.rectangle(0, TILE_HEIGHT / 2 - 8, 28, 14, 0x000000, 0.6);
      const labelText = this.add.text(0, TILE_HEIGHT / 2 - 8, label, {
        fontSize: '9px', color: labelColor, fontFamily: 'monospace', fontStyle: 'bold',
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

    this.tooltipBg = this.add.rectangle(x, y, 200, 70 + (hintReason ? 30 : 0), 0x1a0f08, 0.95)
      .setStrokeStyle(2, 0xd4a574)
      .setDepth(1000);

    this.tooltipText = this.add.text(x, y, tooltipLines.join('\n'), {
      fontSize: '12px', color: '#f5e6d3', fontFamily: 'monospace', align: 'center',
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

    // Show last 6 discards in a 3x2 grid (smaller tiles)
    const recent = this.state.discardedTiles.slice(-6);
    const miniTileSize = 24;
    const cols = 3;
    const startX = -40;
    const startY = -70;

    recent.forEach((tile, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (miniTileSize + 4);
      const y = startY + row * (miniTileSize + 4);

      // Mini tile background
      const bg = this.add.rectangle(x, y, miniTileSize, miniTileSize, 0xf5e6d3)
        .setStrokeStyle(1, 0x2b1810);
      // Mini tile text (just the rank/suit shorthand)
      const display = getTileDisplay(tile);
      const label = tile.suit === 'wind' || tile.suit === 'dragon'
        ? display.englishName.charAt(0)
        : tile.rank.toString();
      const textColor = tile.suit === 'dragon' ? '#c73e3a'
        : tile.suit === 'wind' ? '#5c4033'
        : tile.suit === 'man' ? '#1a1a2e'
        : tile.suit === 'pin' ? '#2c5f8a'
        : '#2d6a4f';
      const txt = this.add.text(x, y, label, {
        fontSize: '10px', color: textColor, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      this.discardArea.add([bg, txt]);
    });

    // Discard count label at bottom
    const countText = this.add.text(0, 100, `${this.state.discardedTiles.length} tiles`, {
      fontSize: '10px', color: '#8b6f47', fontFamily: 'monospace',
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
      survived: 'Round Survived!', lost: 'Game Over', reward: 'Pick Reward',
    };
    this.uiText.phase.setText(phaseLabels[this.state.phase]);

    // Relics display
    if (rs.relics.length > 0) {
      this.uiText.relics.setText(`${rs.relics.length}x`);
    } else {
      this.uiText.relics.setText('-');
    }

    // Update progress bar
    this.updateScoreProgressBar();

    this.hideAllButtons();
    switch (this.state.phase) {
      case 'idle':
        this.showButton('draw');
        if (!rs.isRiichi) this.showButton('riichi');
        // Show undo button only when a discard can be undone
        if (this.undoSnapshot) this.showButton('undo');
        break;
      case 'drew':
        const allTiles = getAllTiles(this.state.hand);
        if (detectWin(allTiles)) this.showButton('win');
        break;
      case 'won':
      case 'survived':
        this.showButton('nextRound');
        break;
      case 'lost':
        this.showButton('newRun');
        break;
    }

    // Show yaku proximity hints when enabled (only for idle/drew phases)
    if (this.showHints && (this.state.phase === 'idle' || this.state.phase === 'drew')) {
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
  }
}
