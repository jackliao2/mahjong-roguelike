import Phaser from 'phaser';
import { Tile, RunState } from '@/types';
import { sortHand } from '@/game/hand';
import { tileKey, getTileDisplay } from '@/game/tiles';
import { checkRunComplete, persistRun, endRun } from '@/roguelike/run';
import { loadRun, clearRun } from '@/data/storage';
import { SoundManager } from '@/render/sound';
import { trackRunStart, trackRunComplete, trackWin } from '@/data/analytics';
import { GameConfig } from '@/config/game-config';
import { generateQuestionForRound, QuizQuestion } from '@/game/quizGenerator';

const OPTION_TILE_W = 64;
const OPTION_TILE_H = 82;
const HAND_TILE_W = 52;
const HAND_TILE_H = 68;

export class GameScene extends Phaser.Scene {
  private round: number = 1;
  private maxRounds: number = 3;
  private score: number = 0;
  private lives: number = 1;
  private currentQuestion: QuizQuestion | null = null;
  private answered: boolean = false;
  private soundManager!: SoundManager;
  private isBeginner: boolean = false;
  private questionContainer!: Phaser.GameObjects.Container;
  private feedbackContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('GameScene');
  }

  create(data?: { action?: string; deckId?: string; difficulty?: string }): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    this.soundManager = new SoundManager(this);

    this.isBeginner = data?.difficulty === 'beginner';
    this.maxRounds = this.isBeginner ? GameConfig.beginner.maxRounds : GameConfig.rounds.maxRounds;
    this.lives = 1; // 1 wrong = game over (rogue tension)

    // Fresh run
    if (data?.action === 'new_run') {
      clearRun();
    }
    const savedRun = loadRun();
    if (savedRun) {
      this.round = savedRun.round;
      this.score = savedRun.score;
      this.maxRounds = savedRun.maxRounds;
    } else {
      this.round = 1;
      this.score = 0;
    }

    trackRunStart(this.isBeginner ? 'beginner' : 'normal');

    // Background
    this.createBackground();

    // Top bar
    this.createTopBar();

    // Containers for question + feedback (rebuilt each round)
    this.questionContainer = this.add.container(0, 0);
    this.feedbackContainer = this.add.container(0, 0);

    // Start first round
    this.time.delayedCall(400, () => this.startRound());
  }

  // ===== Background =====
  private createBackground(): void {
    this.add.rectangle(0, 0, 1024, 720, 0x2b1810).setOrigin(0);
    for (let y = 0; y < 720; y += 4) {
      const alpha = 0.04 + Math.random() * 0.04;
      this.add.rectangle(0, y, 1024, 2, 0x5c3825, alpha).setOrigin(0);
    }
  }

  // ===== Top bar: round, score, quit =====
  private createTopBar(): void {
    const y = 30;
    // Round
    this.add.text(40, y, '', {
      fontSize: '18px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setName('roundLabel');
    // Score
    this.add.text(512, y, '', {
      fontSize: '18px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setName('scoreLabel');
    // Quit button
    const quitBg = this.add.rectangle(980, y, 70, 32, 0x5c3825)
      .setStrokeStyle(2, 0x8b6f47);
    const quitText = this.add.text(980, y, 'QUIT', {
      fontSize: '13px', color: '#c9b89a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    const quitHit = this.add.rectangle(980, y, 70, 32, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    quitHit.on('pointerover', () => quitBg.setFillStyle(0x8b6f47));
    quitHit.on('pointerout', () => quitBg.setFillStyle(0x5c3825));
    quitHit.on('pointerdown', () => {
      this.soundManager.playClick();
      window.location.href = '/';
    });
  }

  private updateTopBar(): void {
    const roundLabel = this.children.getByName('roundLabel') as Phaser.GameObjects.Text;
    const scoreLabel = this.children.getByName('scoreLabel') as Phaser.GameObjects.Text;
    if (roundLabel) roundLabel.setText(`ROUND ${this.round} / ${this.maxRounds}`);
    if (scoreLabel) scoreLabel.setText(`SCORE: ${this.score}`);
  }

  // ===== Round flow =====
  private startRound(): void {
    this.answered = false;
    this.feedbackContainer.removeAll(true);
    this.questionContainer.removeAll(true);
    this.updateTopBar();

    // Round intro banner
    this.showRoundIntro(() => {
      this.loadQuestion();
    });
  }

  private showRoundIntro(onComplete: () => void): void {
    const lessons: Record<number, { title: string; subtitle: string }> = {
      1: { title: 'LESSON 1: TENPAI', subtitle: 'Learn to spot a ready hand' },
      2: { title: 'LESSON 2: TANYAO', subtitle: 'Win with only simple tiles (2-8)' },
      3: { title: 'LESSON 3: PINFU', subtitle: 'All sequences + simple pair' },
      4: { title: 'LESSON 4: YAKUHAI', subtitle: 'Win with a dragon triplet' },
      5: { title: 'LESSON 5: ADVANCED', subtitle: 'Test your skills' },
    };
    const lesson = lessons[this.round] || lessons[5];

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.7).setDepth(500);
    const panel = this.add.rectangle(512, 320, 600, 160, 0x1a0f08)
      .setStrokeStyle(3, 0xd4a574).setDepth(501);
    const accent = this.add.rectangle(512, 320 - 80 + 4, 590, 4, 0xe5b567).setDepth(501);
    const title = this.add.text(512, 300, lesson.title, {
      fontSize: '28px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);
    const subtitle = this.add.text(512, 340, lesson.subtitle, {
      fontSize: '16px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(502);

    const elements = [overlay, panel, accent, title, subtitle];
    elements.forEach(el => el.setAlpha(0));
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 300,
      onComplete: () => {
        this.time.delayedCall(1500, () => {
          this.tweens.add({
            targets: elements,
            alpha: 0,
            duration: 400,
            onComplete: () => {
              elements.forEach(el => el.destroy());
              onComplete();
            },
          });
        });
      },
    });
  }

  // ===== Question rendering =====
  private loadQuestion(): void {
    this.currentQuestion = generateQuestionForRound(this.round, this.maxRounds);
    this.renderQuestion();
  }

  private renderQuestion(): void {
    if (!this.currentQuestion) return;
    const q = this.currentQuestion;
    this.questionContainer.removeAll(true);

    // Prompt text
    const promptY = 90;
    const prompt = this.add.text(512, promptY, q.prompt, {
      fontSize: '22px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
      align: 'center', wordWrap: { width: 900 },
    }).setOrigin(0.5);
    this.questionContainer.add(prompt);

    // Instruction for hand
    const handLabel = this.add.text(512, 140, 'YOUR HAND:', {
      fontSize: '14px', color: '#8b6f47', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.questionContainer.add(handLabel);

    // Render hand tiles (sorted)
    const sortedHand = sortHand([...q.hand]);
    this.renderHandTiles(sortedHand, 512, 240);

    // "CHOOSE ONE:" label
    const chooseLabel = this.add.text(512, 350, 'CHOOSE ONE:', {
      fontSize: '16px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.questionContainer.add(chooseLabel);

    // Render 4 option tiles
    this.renderOptions(q.options, 512, 480);
  }

  /** Render the hand tiles in a centered row */
  private renderHandTiles(tiles: Tile[], centerX: number, y: number): void {
    const gap = 4;
    const totalW = tiles.length * HAND_TILE_W + (tiles.length - 1) * gap;
    const startX = centerX - totalW / 2 + HAND_TILE_W / 2;

    tiles.forEach((tile, i) => {
      const x = startX + i * (HAND_TILE_W + gap);
      const sprite = this.createHandTileSprite(tile, x, y);
      this.questionContainer.add(sprite);
    });
  }

  /** Create a display-only hand tile (not clickable) */
  private createHandTileSprite(tile: Tile, x: number, y: number): Phaser.GameObjects.Container {
    const textureKey = `tile-${tileKey(tile)}`;
    const sprite = this.add.image(0, 0, textureKey);
    const shadow = this.add.rectangle(2, 4, HAND_TILE_W, HAND_TILE_H, 0x000000, 0.3);
    const container = this.add.container(x, y, [shadow, sprite]);
    container.setSize(HAND_TILE_W, HAND_TILE_H);

    // Tile label for readability
    const label = this.getTileLabel(tile);
    const labelBg = this.add.rectangle(0, HAND_TILE_H / 2 - 8, 36, 16, 0x000000, 0.8);
    const labelText = this.add.text(0, HAND_TILE_H / 2 - 8, label, {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([labelBg, labelText]);

    // Hover tooltip
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => {
      container.setY(y - 6);
      this.showTileTooltip(tile, x, y - HAND_TILE_H - 10);
    });
    container.on('pointerout', () => {
      container.setY(y);
      this.hideTooltip();
    });

    return container;
  }

  /** Render 4 option tiles as large clickable buttons */
  private renderOptions(tiles: Tile[], centerX: number, y: number): void {
    const gap = 20;
    const totalW = tiles.length * OPTION_TILE_W + (tiles.length - 1) * gap;
    const startX = centerX - totalW / 2 + OPTION_TILE_W / 2;

    tiles.forEach((tile, i) => {
      const x = startX + i * (OPTION_TILE_W + gap);
      const option = this.createOptionButton(tile, x, y, i);
      this.questionContainer.add(option);
    });
  }

  /** Create a clickable option tile button */
  private createOptionButton(tile: Tile, x: number, y: number, index: number): Phaser.GameObjects.Container {
    const textureKey = `tile-${tileKey(tile)}`;
    const sprite = this.add.image(0, 0, textureKey);
    const shadow = this.add.rectangle(3, 5, OPTION_TILE_W, OPTION_TILE_H, 0x000000, 0.4);
    // Button background frame
    const frame = this.add.rectangle(0, 0, OPTION_TILE_W + 8, OPTION_TILE_H + 8, 0x1a0f08)
      .setStrokeStyle(3, 0xd4a574);
    const container = this.add.container(x, y, [frame, shadow, sprite]);
    container.setSize(OPTION_TILE_W + 8, OPTION_TILE_H + 8);

    // Option label (A/B/C/D)
    const letter = String.fromCharCode(65 + index); // A, B, C, D
    const letterBg = this.add.rectangle(-OPTION_TILE_W / 2 + 2, -OPTION_TILE_H / 2 - 2, 22, 22, 0xc73e3a);
    const letterText = this.add.text(-OPTION_TILE_W / 2 + 2, -OPTION_TILE_H / 2 - 2, letter, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([letterBg, letterText]);

    // Tile name label
    const label = this.getTileLabel(tile);
    const labelBg = this.add.rectangle(0, OPTION_TILE_H / 2 - 8, 44, 18, 0x000000, 0.85);
    const labelText = this.add.text(0, OPTION_TILE_H / 2 - 8, label, {
      fontSize: '13px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([labelBg, labelText]);

    // Interactivity
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => {
      if (!this.answered) {
        container.setScale(1.08);
        frame.setStrokeStyle(4, 0xe5b567);
      }
    });
    container.on('pointerout', () => {
      if (!this.answered) {
        container.setScale(1);
        frame.setStrokeStyle(3, 0xd4a574);
      }
    });
    container.on('pointerdown', () => {
      if (!this.answered) {
        this.handleAnswer(index);
      }
    });

    // Hover tooltip
    container.on('pointerover', () => {
      this.showTileTooltip(tile, x, y - OPTION_TILE_H - 10);
    });

    return container;
  }

  // ===== Answer handling =====
  private handleAnswer(optionIndex: number): void {
    if (!this.currentQuestion || this.answered) return;
    this.answered = true;
    const q = this.currentQuestion;
    const isCorrect = q.correctIndices.includes(optionIndex);

    // Highlight chosen option
    this.highlightOptions(optionIndex, isCorrect);

    if (isCorrect) {
      this.soundManager.playWin();
      this.score += 1000;
      trackWin([q.targetYaku || q.type], 1, 1000, false);
      this.showCorrectFeedback(q);
    } else {
      this.soundManager.playGameOver();
      this.lives -= 1;
      this.showWrongFeedback(q, optionIndex);
    }
  }

  /** Highlight correct (green) and wrong-chosen (red) options */
  private highlightOptions(chosenIndex: number, isCorrect: boolean): void {
    if (!this.currentQuestion) return;
    const q = this.currentQuestion;

    const gap = 20;
    const totalW = q.options.length * OPTION_TILE_W + (q.options.length - 1) * gap;
    const startX = 512 - totalW / 2 + OPTION_TILE_W / 2;

    q.options.forEach((tile, i) => {
      const x = startX + i * (OPTION_TILE_W + gap);
      const isRightAnswer = q.correctIndices.includes(i);
      const isChosen = i === chosenIndex;

      let color = 0x000000;
      let alpha = 0;
      if (isRightAnswer) {
        color = 0x4a9e4a; // green
        alpha = 0.3;
      } else if (isChosen && !isCorrect) {
        color = 0xc73e3a; // red
        alpha = 0.3;
      }

      if (alpha > 0) {
        const highlight = this.add.rectangle(x, 480, OPTION_TILE_W + 12, OPTION_TILE_H + 12, color, alpha)
          .setStrokeStyle(4, color, 1);
        this.questionContainer.add(highlight);
      }
    });
  }

  // ===== Feedback overlays =====
  private showCorrectFeedback(q: QuizQuestion): void {
    const depth = 600;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.75).setDepth(depth);
    const panelW = 600;
    const panelH = 320;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0x4a9e4a).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 4, 0x4a9e4a).setDepth(depth);

    const title = this.add.text(512, 300, 'CORRECT!', {
      fontSize: '32px', color: '#4a9e4a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const expText = this.add.text(512, 360, q.explanation, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, expText];

    // Next button
    const isLastRound = checkRunComplete({ round: this.round, maxRounds: this.maxRounds, score: this.score, targetScore: 0, unlockedYaku: [], isRiichi: false, riichiTurns: 0, doraIndicators: [] } as RunState);
    const btnLabel = isLastRound ? 'COMPLETE!' : 'NEXT ROUND ▶';
    const btnW = 200;
    const btnH = 48;
    const btnY = 360 + panelH / 2 - 40;
    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(512, btnY, btnLabel, {
      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const btnHit = this.add.rectangle(512, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0xe04e4a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0xc73e3a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
      this.proceedToNextRound();
    });
    elements.push(btnBg, btnText, btnHit);

    this.feedbackContainer.add(elements);

    // Entrance animation
    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 300,
    });
  }

  private showWrongFeedback(q: QuizQuestion, chosenIndex: number): void {
    const depth = 600;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.85).setDepth(depth);
    const panelW = 600;
    const panelH = 360;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0xc73e3a).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 4, 0xc73e3a).setDepth(depth);

    const title = this.add.text(512, 280, 'GAME OVER', {
      fontSize: '32px', color: '#c73e3a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const correctText = q.correctIndices.length === 1
      ? `Correct answer: ${String.fromCharCode(65 + q.correctIndices[0])}`
      : `Correct: ${q.correctIndices.map(i => String.fromCharCode(65 + i)).join(', ')}`;
    const correctLabel = this.add.text(512, 330, correctText, {
      fontSize: '16px', color: '#4a9e4a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const expText = this.add.text(512, 380, q.explanation, {
      fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, correctLabel, expText];

    // Retry button
    const btnW = 180;
    const btnH = 44;
    const btnY = 360 + panelH / 2 - 36;
    const btnBg = this.add.rectangle(430, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(430, btnY, 'TRY AGAIN', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const btnHit = this.add.rectangle(430, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0xe04e4a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0xc73e3a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      this.scene.restart({ action: 'new_run', difficulty: this.isBeginner ? 'beginner' : 'normal' });
    });
    elements.push(btnBg, btnText, btnHit);

    // Menu button
    const menuBg = this.add.rectangle(620, btnY, btnW, btnH, 0x5c3825)
      .setStrokeStyle(2, 0x8b6f47).setDepth(depth);
    const menuText = this.add.text(620, btnY, 'MAIN MENU', {
      fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const menuHit = this.add.rectangle(620, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    menuHit.on('pointerover', () => menuBg.setFillStyle(0x8b6f47));
    menuHit.on('pointerout', () => menuBg.setFillStyle(0x5c3825));
    menuHit.on('pointerdown', () => {
      this.soundManager.playClick();
      window.location.href = '/play';
    });
    elements.push(menuBg, menuText, menuHit);

    this.feedbackContainer.add(elements);
    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 300,
    });
  }

  // ===== Round progression =====
  private proceedToNextRound(): void {
    // Persist state
    const runState: RunState = {
      round: this.round + 1,
      score: this.score,
      targetScore: 0,
      maxRounds: this.maxRounds,
      unlockedYaku: [],
      isRiichi: false,
      riichiTurns: 0,
      doraIndicators: [],
    };
    persistRun(runState);

    // Check if run complete
    if (checkRunComplete({ round: this.round, maxRounds: this.maxRounds, score: this.score, targetScore: 0, unlockedYaku: [], isRiichi: false, riichiTurns: 0, doraIndicators: [] } as RunState)) {
      // Run won!
      const { meta, newAchievements } = endRun(runState, true);
      trackRunComplete(true, this.score, this.round);
      if (this.isBeginner) {
        localStorage.setItem(GameConfig.beginner.completedKey, '1');
      }
      this.scene.launch('GameOverScene', { runState, won: true, meta, newAchievements });
      this.scene.pause();
      return;
    }

    // Advance to next round
    this.round += 1;
    this.startRound();
  }

  // ===== Helpers =====
  private getTileLabel(tile: Tile): string {
    if (tile.suit === 'man') return `${tile.rank}m`;
    if (tile.suit === 'pin') return `${tile.rank}p`;
    if (tile.suit === 'sou') return `${tile.rank}s`;
    if (tile.suit === 'wind') return ['E', 'S', 'W', 'N'][tile.rank - 1] || '?';
    if (tile.suit === 'dragon') return ['Rd', 'Wh', 'Gr'][tile.rank - 1] || '?';
    return '?';
  }

  private showTileTooltip(tile: Tile, x: number, y: number): void {
    this.hideTooltip();
    const display = getTileDisplay(tile);
    const lines = [display.englishName, `(${display.romaji})`, display.westernHint];

    const bg = this.add.rectangle(x, y, 200, 64, 0x1a0f08, 0.95)
      .setStrokeStyle(2, 0xd4a574)
      .setDepth(1000)
      .setName('tooltipBg');
    const text = this.add.text(x, y, lines.join('\n'), {
      fontSize: '13px', color: '#f5e6d3', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5).setDepth(1001).setName('tooltipText');
  }

  private hideTooltip(): void {
    const bg = this.children.getByName('tooltipBg');
    const text = this.children.getByName('tooltipText');
    if (bg) bg.destroy();
    if (text) text.destroy();
  }
}
