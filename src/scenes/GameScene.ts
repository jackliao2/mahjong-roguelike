import Phaser from 'phaser';
import { Tile, RunState } from '@/types';
import { sortHand } from '@/game/hand';
import { tileKey, getTileDisplay } from '@/game/tiles';
import { checkRunComplete, persistRun, endRun } from '@/roguelike/run';
import { loadRun, clearRun } from '@/data/storage';
import { SoundManager } from '@/render/sound';
import { trackRunStart, trackRunComplete, trackWin } from '@/data/analytics';
import { GameConfig } from '@/config/game-config';
import { generateQuestionForRound, getChapterForRound, QuizQuestion } from '@/game/quizGenerator';
import { RelicId, getRandomRelics, Relic } from '@/game/relics';

const OPTION_TILE_W = 64;
const OPTION_TILE_H = 82;
const HAND_TILE_W = 52;
const HAND_TILE_H = 68;

export class GameScene extends Phaser.Scene {
  // Core state
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

  // Teaching mode
  private teachingMode: boolean = false;
  private currentTrainingLevel: number = 0;

  // Tutorial
  private tutorialActive: boolean = false;
  private tutorialStep: number = 0;

  // Combo system
  private combo: number = 0;
  private bestCombo: number = 0;

  // Timer system
  private timeLeft: number = 0;
  private timerActive: boolean = false;
  private timerEvent: Phaser.Time.TimerEvent | null = null;
  private baseTime: number = 20; // seconds per question
  private bossTime: number = 30;

  // Relic system
  private relics: RelicId[] = [];
  private doubleTalismanUses: number = 0;
  private shieldUsedThisChapter: boolean = false;

  // Path system
  private currentPath: 'safe' | 'risky' = 'safe';
  private pathMultiplier: number = 1;

  // Endless mode
  private isEndless: boolean = false;
  private endlessDifficulty: number = 1;

  constructor() {
    super('GameScene');
  }

  create(data?: { action?: string; deckId?: string; difficulty?: string; endless?: boolean; tutorial?: boolean; teaching?: boolean }): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    this.soundManager = new SoundManager(this);

    this.isBeginner = data?.difficulty === 'beginner';
    this.tutorialActive = data?.tutorial === true;
    this.teachingMode = data?.teaching === true;
    this.tutorialStep = 0;

    if (this.teachingMode) {
      this.maxRounds = GameConfig.beginner.trainingLevels.length;
      this.lives = 999;
    } else {
      this.maxRounds = this.isBeginner ? GameConfig.beginner.maxRounds : GameConfig.rounds.maxRounds;
      this.lives = this.isBeginner ? GameConfig.beginner.lives : GameConfig.rounds.lives;
    }

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

    // Initialize systems
    this.combo = 0;
    this.bestCombo = 0;
    this.relics = [];
    this.doubleTalismanUses = 0;
    this.shieldUsedThisChapter = false;
    this.currentPath = 'safe';
    this.pathMultiplier = 1;
    this.endlessDifficulty = 1;

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

  // ===== Top bar: round, score, lives, combo, timer, quit =====
  private createTopBar(): void {
    const y = 30;
    // Round (compact, left-aligned)
    this.add.text(20, y, '', {
      fontSize: '13px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setName('roundLabel');
    // Lives
    this.add.text(210, y, '', {
      fontSize: '15px', color: '#c73e3a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setName('livesLabel');
    // Combo
    this.add.text(330, y, '', {
      fontSize: '15px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setName('comboLabel');
    // Score
    this.add.text(512, y, '', {
      fontSize: '15px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setName('scoreLabel');
    // Timer
    this.add.text(670, y, '', {
      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setName('timerLabel');
    // Relic icons (right side, compact)
    this.add.text(820, y, '', {
      fontSize: '13px', color: '#c9b89a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setName('relicLabel');
    // Quit button
    const quitBg = this.add.rectangle(980, y, 60, 28, 0x5c3825)
      .setStrokeStyle(2, 0x8b6f47);
    const quitText = this.add.text(980, y, 'QUIT', {
      fontSize: '12px', color: '#c9b89a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    const quitHit = this.add.rectangle(980, y, 60, 28, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    quitHit.on('pointerover', () => quitBg.setFillStyle(0x8b6f47));
    quitHit.on('pointerout', () => quitBg.setFillStyle(0x5c3825));
    quitHit.on('pointerdown', () => {
      this.soundManager.playClick();
      this.stopTimer();
      window.location.href = '/';
    });
  }

  private updateTopBar(): void {
    const roundLabel = this.children.getByName('roundLabel') as Phaser.GameObjects.Text;
    const livesLabel = this.children.getByName('livesLabel') as Phaser.GameObjects.Text;
    const comboLabel = this.children.getByName('comboLabel') as Phaser.GameObjects.Text;
    const scoreLabel = this.children.getByName('scoreLabel') as Phaser.GameObjects.Text;
    const timerLabel = this.children.getByName('timerLabel') as Phaser.GameObjects.Text;
    const relicLabel = this.children.getByName('relicLabel') as Phaser.GameObjects.Text;
    const ch = getChapterForRound(this.round);
    if (roundLabel) {
      const bossTag = ch.isBoss ? ' BOSS' : '';
      const endlessTag = this.isEndless ? ' ENDLESS' : '';
      roundLabel.setText(`Q${this.isEndless ? this.round : `${this.round}/${this.maxRounds}`}${bossTag}${endlessTag}`);
    }
    if (livesLabel) {
      const hearts = '♥'.repeat(Math.max(0, this.lives));
      livesLabel.setText(hearts || '✕');
    }
    if (comboLabel) {
      comboLabel.setText(this.combo >= 2 ? `COMBO x${this.combo}` : '');
    }
    if (scoreLabel) scoreLabel.setText(`${this.score}`);
    if (timerLabel) {
      timerLabel.setText(this.timerActive ? `${Math.ceil(this.timeLeft)}s` : '');
    }
    if (relicLabel) {
      const icons: Record<string, string> = {
        'hint-scroll': '📜', 'time-charm': '⏳', 'double-talisman': '✦',
        'perspective-glass': '🔍', 'combo-feather': '🪶', 'hourglass': '⌛',
        'lucky-coin': '🪙', 'shield-tile': '🛡',
      };
      relicLabel.setText(this.relics.map(r => icons[r] || '?').join(''));
    }
  }

  // ===== Timer system =====
  private startTimer(seconds: number): void {
    this.stopTimer();
    this.timeLeft = seconds;
    this.timerActive = true;
    this.updateTopBar();
    this.timerEvent = this.time.addEvent({
      delay: 100,
      callback: () => this.tickTimer(),
      loop: true,
    });
  }

  private stopTimer(): void {
    this.timerActive = false;
    if (this.timerEvent) {
      this.timerEvent.remove();
      this.timerEvent = null;
    }
  }

  private tickTimer(): void {
    if (!this.timerActive) return;
    this.timeLeft -= 0.1;
    this.updateTopBar();
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.stopTimer();
      this.handleTimeout();
    }
  }

  private handleTimeout(): void {
    if (this.answered || !this.currentQuestion) return;
    this.answered = true;
    this.lives -= 1;
    this.combo = 0;
    this.updateTopBar();
    if (this.lives > 0) {
      this.showTimeoutRetry();
    } else {
      this.soundManager.playGameOver();
      this.showWrongFeedback(this.currentQuestion, -1);
    }
  }

  // ===== Round flow =====
  private startRound(): void {
    this.answered = false;
    this.feedbackContainer.removeAll(true);
    this.questionContainer.removeAll(true);
    this.updateTopBar();

    if (this.teachingMode) {
      this.currentTrainingLevel = this.round - 1;
      this.showTeachingIntro(() => {
        this.loadQuestion();
      });
    } else {
      this.showRoundIntro(() => {
        this.loadQuestion();
      });
    }
  }

  private showTeachingIntro(onComplete: () => void): void {
    const levels = GameConfig.beginner.trainingLevels;
    if (this.currentTrainingLevel < 0 || this.currentTrainingLevel >= levels.length) {
      onComplete();
      return;
    }
    const level = levels[this.currentTrainingLevel];
    const accentColor = 0x4a9e4a;

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.8).setDepth(500);
    const panel = this.add.rectangle(512, 360, 620, 300, 0x1a0f08)
      .setStrokeStyle(2, accentColor).setDepth(501);

    const titleText = this.add.text(512, 260, level.title, {
      fontSize: '24px', color: '#4a9e4a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);

    const subtitleText = this.add.text(512, 300, level.subtitle, {
      fontSize: '15px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(502);

    const descText = this.add.text(512, 360, level.description, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: 560 }, lineSpacing: 8,
    }).setOrigin(0.5).setDepth(502);

    const btnW = 180;
    const btnH = 44;
    const btnBg = this.add.rectangle(512, 450, btnW, btnH, 0x4a9e4a)
      .setStrokeStyle(2, 0x2b1810).setDepth(501);
    const btnText = this.add.text(512, 450, 'START LESSON', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);
    const btnHit = this.add.rectangle(512, 450, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(503);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0x5abf5a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0x4a9e4a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
      onComplete();
    });

    const elements = [overlay, panel, titleText, subtitleText, descText, btnBg, btnText, btnHit];
    elements.forEach(el => el.setAlpha(0));
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 300,
    });
  }

  private showRoundIntro(onComplete: () => void): void {
    const ch = getChapterForRound(this.round);
    const accentColor = ch.isBoss ? 0xc73e3a : 0xe5b567;
    const titleColor = ch.isBoss ? '#c73e3a' : '#d4a574';
    const bossTag = ch.isBoss ? ' [BOSS]' : '';
    const title = `${ch.chapter}${bossTag}`;
    const subtitle = ch.isBoss
      ? 'Boss question — multiple waiting tiles may exist'
      : ch.title;

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.7).setDepth(500);
    const panel = this.add.rectangle(512, 320, 600, 160, 0x1a0f08)
      .setStrokeStyle(3, accentColor).setDepth(501);
    const accent = this.add.rectangle(512, 320 - 80 + 4, 590, 4, accentColor).setDepth(501);
    const titleText = this.add.text(512, 300, title, {
      fontSize: '28px', color: titleColor, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);
    const subtitleText = this.add.text(512, 340, subtitle, {
      fontSize: '16px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(502);

    const elements = [overlay, panel, accent, titleText, subtitleText];
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
    if (this.teachingMode) {
      const levels = GameConfig.beginner.trainingLevels;
      const levelType = levels[this.currentTrainingLevel]?.type || 'tenpai-win';
      this.currentQuestion = generateQuestionForRound(this.round, this.maxRounds, levelType);
    } else {
      this.currentQuestion = generateQuestionForRound(this.round, this.maxRounds);
      if (this.currentPath === 'risky') {
        this.currentQuestion.isBoss = true;
      }
    }
    this.renderQuestion();
    if (!this.teachingMode) {
      const hasHourglass = this.relics.includes('hourglass');
      const extraSec = hasHourglass ? 5 : 0;
      const base = (this.currentQuestion.isBoss ? this.bossTime : this.baseTime) + extraSec;
      const endlessPenalty = this.isEndless ? Math.max(0, this.endlessDifficulty * 1.5) : 0;
      this.startTimer(Math.max(8, base - endlessPenalty));
    }
  }

  private renderQuestion(): void {
    if (!this.currentQuestion) return;
    const q = this.currentQuestion;
    this.questionContainer.removeAll(true);

    // Chapter label above prompt
    const ch = getChapterForRound(this.round);
    const chapterText = ch.isBoss ? `${ch.chapter} · BOSS` : ch.chapter;
    const chapterLabel = this.add.text(512, 80, chapterText, {
      fontSize: '14px', color: ch.isBoss ? '#c73e3a' : '#8b6f47', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.questionContainer.add(chapterLabel);

    // Prompt text
    const promptY = 110;
    const prompt = this.add.text(512, promptY, q.prompt, {
      fontSize: '22px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
      align: 'center', wordWrap: { width: 900 },
    }).setOrigin(0.5);
    this.questionContainer.add(prompt);

    // Instruction for hand
    const handLabel = this.add.text(512, 135, 'YOUR HAND:', {
      fontSize: '14px', color: '#8b6f47', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.questionContainer.add(handLabel);

    // Render hand tiles (sorted)
    const sortedHand = sortHand([...q.hand]);
    this.renderHandTiles(sortedHand, 512, 250);

    // "CHOOSE ONE:" label (BOSS gets red accent)
    const chooseText = q.isBoss ? 'BOSS · CHOOSE ONE:' : 'CHOOSE ONE:';
    const chooseColor = q.isBoss ? '#c73e3a' : '#e5b567';
    const chooseLabel = this.add.text(512, 360, chooseText, {
      fontSize: '16px', color: chooseColor, fontFamily: 'monospace', fontStyle: 'bold',
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
    const hasHint = this.relics.includes('hint-scroll');
    const hasGlass = this.relics.includes('perspective-glass');
    const q = this.currentQuestion;
    if (!q) return;

    // Hint-scroll: hide 1 wrong option (gray it out + disabled)
    let hiddenWrongIndex = -1;
    if (hasHint) {
      const wrongIndices: number[] = [];
      tiles.forEach((_, i) => {
        if (!q.correctIndices.includes(i)) wrongIndices.push(i);
      });
      if (wrongIndices.length > 0) {
        hiddenWrongIndex = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
      }
    }

    const gap = 20;
    const totalW = tiles.length * OPTION_TILE_W + (tiles.length - 1) * gap;
    const startX = centerX - totalW / 2 + OPTION_TILE_W / 2;

    tiles.forEach((tile, i) => {
      const x = startX + i * (OPTION_TILE_W + gap);
      const isHidden = i === hiddenWrongIndex;
      const isCorrectAnswer = q.correctIndices.includes(i);
      const option = this.createOptionButton(tile, x, y, i, isHidden, hasGlass && isCorrectAnswer);
      this.questionContainer.add(option);
    });
  }

  /** Create a clickable option tile button */
  private createOptionButton(tile: Tile, x: number, y: number, index: number, disabled: boolean = false, glowCorrect: boolean = false): Phaser.GameObjects.Container {
    const isBoss = this.currentQuestion?.isBoss ?? false;
    const frameColor = isBoss ? 0xc73e3a : 0xd4a574;
    const hoverColor = isBoss ? 0xe04e4a : 0xe5b567;

    const textureKey = `tile-${tileKey(tile)}`;
    const sprite = this.add.image(0, 0, textureKey);
    const shadow = this.add.rectangle(3, 5, OPTION_TILE_W, OPTION_TILE_H, 0x000000, 0.4);
    // Button background frame
    const frame = this.add.rectangle(0, 0, OPTION_TILE_W + 8, OPTION_TILE_H + 8, 0x1a0f08)
      .setStrokeStyle(isBoss ? 4 : 3, frameColor);
    const container = this.add.container(x, y, [frame, shadow, sprite]);
    container.setSize(OPTION_TILE_W + 8, OPTION_TILE_H + 8);

    // Perspective glass: correct answer glows faintly
    let glow: Phaser.GameObjects.Rectangle | null = null;
    if (glowCorrect) {
      glow = this.add.rectangle(0, 0, OPTION_TILE_W + 12, OPTION_TILE_H + 12, 0xe5b567, 0.15)
        .setStrokeStyle(2, 0xe5b567, 0.4);
      container.addAt(glow, 0);
      // subtle pulse
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.3, to: 0.6 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
      });
    }

    // Disabled (hint-scroll removed): gray out
    if (disabled) {
      sprite.setAlpha(0.25);
      frame.setFillStyle(0x000000);
      frame.setStrokeStyle(2, 0x444444);
    }

    // Option label (A/B/C/D)
    const letter = String.fromCharCode(65 + index); // A, B, C, D
    const letterBg = this.add.rectangle(-OPTION_TILE_W / 2 + 2, -OPTION_TILE_H / 2 - 2, 22, 22, disabled ? 0x666666 : 0xc73e3a);
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
    if (!disabled) {
      container.setInteractive({ useHandCursor: true });
      container.on('pointerover', () => {
        if (!this.answered) {
          container.setScale(1.08);
          frame.setStrokeStyle(5, hoverColor);
        }
      });
      container.on('pointerout', () => {
        if (!this.answered) {
          container.setScale(1);
          frame.setStrokeStyle(isBoss ? 4 : 3, frameColor);
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
    }

    return container;
  }

  // ===== Answer handling =====
  private handleAnswer(optionIndex: number): void {
    if (!this.currentQuestion || this.answered) return;
    this.answered = true;
    this.stopTimer();
    const q = this.currentQuestion;
    const isCorrect = q.correctIndices.includes(optionIndex);

    this.highlightOptions(optionIndex, isCorrect);

    if (this.teachingMode) {
      if (isCorrect) {
        this.soundManager.playWin();
        this.showTeachingComplete(q);
      } else {
        this.soundManager.playClick();
        this.showTeachingRetry(q, optionIndex);
      }
    } else if (isCorrect) {
      this.soundManager.playWin();
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);

      let baseScore = q.isBoss ? 1500 : 1000;
      baseScore *= this.pathMultiplier;
      if (this.relics.includes('lucky-coin')) baseScore *= 1.1;
      if (this.combo >= 2) {
        const comboBonusBase = Math.min(1, (this.combo - 1) * 0.1);
        const featherBoost = this.relics.includes('combo-feather') ? 1.5 : 1;
        baseScore *= 1 + comboBonusBase * featherBoost;
      }
      const totalTime = q.isBoss ? this.bossTime : this.baseTime;
      const usedRatio = 1 - Math.max(0, this.timeLeft / totalTime);
      const speedBonus = Math.max(0, 1 - usedRatio) * 0.5;
      baseScore *= 1 + speedBonus;
      if (this.doubleTalismanUses > 0) {
        baseScore *= 2;
        this.doubleTalismanUses -= 1;
      }

      this.score += Math.round(baseScore);
      trackWin([q.targetYaku || q.type], 1, 1000, false);
      this.updateTopBar();
      this.showCorrectFeedback(q);
    } else {
      if (this.relics.includes('shield-tile') && !this.shieldUsedThisChapter) {
        this.shieldUsedThisChapter = true;
        this.combo = 0;
        this.showShieldBlockFeedback(optionIndex);
        this.updateTopBar();
        return;
      }
      this.lives -= 1;
      this.combo = 0;
      this.updateTopBar();
      if (this.lives > 0) {
        this.soundManager.playClick();
        this.showRetryFeedback(q, optionIndex);
      } else {
        this.soundManager.playGameOver();
        this.showWrongFeedback(q, optionIndex);
      }
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
    const depth = 1100;
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

  private showTeachingComplete(q: QuizQuestion): void {
    const depth = 1100;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.8).setDepth(depth);
    const panelW = 620;
    const panelH = 340;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(2, 0x4a9e4a).setDepth(depth);

    const title = this.add.text(512, 290, 'CORRECT!', {
      fontSize: '28px', color: '#4a9e4a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const level = GameConfig.beginner.trainingLevels[this.currentTrainingLevel];
    const lessonName = level?.title.split(':')[1]?.trim() || 'Lesson';
    const subText = this.add.text(512, 330, `You mastered: ${lessonName}`, {
      fontSize: '16px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(depth + 1);

    const expText = this.add.text(512, 385, q.explanation, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, title, subText, expText];

    const isLastLesson = this.round >= this.maxRounds;
    const btnLabel = isLastLesson ? 'ALL LESSONS COMPLETE!' : 'NEXT LESSON ▶';
    const btnW = 220;
    const btnH = 48;
    const btnY = 360 + panelH / 2 - 40;
    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0x4a9e4a)
      .setStrokeStyle(2, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(512, btnY, btnLabel, {
      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const btnHit = this.add.rectangle(512, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0x5abf5a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0x4a9e4a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
      if (isLastLesson) {
        window.location.href = '/play.html';
      } else {
        this.proceedToNextRound();
      }
    });
    elements.push(btnBg, btnText, btnHit);

    this.feedbackContainer.add(elements);
    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 300,
    });
  }

  private showTeachingRetry(q: QuizQuestion, chosenIndex: number): void {
    const depth = 1100;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.75).setDepth(depth);
    const panelW = 580;
    const panelH = 320;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(2, 0xc73e3a).setDepth(depth);

    const title = this.add.text(512, 290, 'NOT QUITE!', {
      fontSize: '26px', color: '#c73e3a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const subText = this.add.text(512, 330, 'Let\'s understand why — try again!', {
      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(depth + 1);

    const expText = this.add.text(512, 380, q.explanation, {
      fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);

    const btnW = 180;
    const btnH = 44;
    const btnY = 360 + panelH / 2 - 36;
    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(2, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(512, btnY, 'TRY AGAIN', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const btnHit = this.add.rectangle(512, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0xd44a46));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0xc73e3a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
      this.questionContainer.removeAll(true);
      this.answered = false;
      this.renderQuestion();
    });

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, title, subText, expText, btnBg, btnText, btnHit];
    this.feedbackContainer.add(elements);
    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 300,
    });
  }

  /** Shield block feedback: relic absorbed the damage */
  private showShieldBlockFeedback(chosenIndex: number): void {
    const depth = 1100;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.65).setDepth(depth);
    const panelW = 480;
    const panelH = 180;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0x4a6fa5).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 4, 0x4a6fa5).setDepth(depth);

    const title = this.add.text(512, 330, 'SHIELD TILE!', {
      fontSize: '24px', color: '#4a9ebf', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const sub = this.add.text(512, 370, 'Mistake absorbed. Try again!', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, sub];
    this.feedbackContainer.add(elements);
    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 200,
      onComplete: () => {
        this.time.delayedCall(1200, () => {
          this.tweens.add({
            targets: elements,
            alpha: 0,
            duration: 250,
            onComplete: () => {
              elements.forEach(el => el.destroy());
              this.questionContainer.removeAll(true);
              this.answered = false;
              this.renderQuestion();
            },
          });
        });
      },
    });
  }

  /** Timeout retry: ran out of time but lives remain */
  private showTimeoutRetry(): void {
    const depth = 1100;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.7).setDepth(depth);
    const panelW = 480;
    const panelH = 180;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0xe5b567).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 4, 0xe5b567).setDepth(depth);

    const title = this.add.text(512, 330, "TIME'S UP!", {
      fontSize: '28px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const sub = this.add.text(512, 370, `${this.lives} ${this.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`, {
      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, sub];
    this.feedbackContainer.add(elements);
    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 200,
      onComplete: () => {
        this.time.delayedCall(1200, () => {
          this.tweens.add({
            targets: elements,
            alpha: 0,
            duration: 250,
            onComplete: () => {
              elements.forEach(el => el.destroy());
              // Next question (same round? Actually advance to next round)
              // Timeout = wrong, consume a life but move on
              this.proceedToNextRound();
            },
          });
        });
      },
    });
  }

  /** Retry feedback: wrong answer but lives remain — let player try again */
  private showRetryFeedback(q: QuizQuestion, chosenIndex: number): void {
    const depth = 1100;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.7).setDepth(depth);
    const panelW = 480;
    const panelH = 200;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0xc73e3a).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 4, 0xc73e3a).setDepth(depth);

    const title = this.add.text(512, 320, 'WRONG!', {
      fontSize: '28px', color: '#c73e3a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const sub = this.add.text(512, 360, `${this.lives} ${this.lives === 1 ? 'LIFE' : 'LIVES'} LEFT — TRY AGAIN`, {
      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const hint = this.add.text(512, 392, '(pick another option)', {
      fontSize: '13px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, sub, hint];
    this.feedbackContainer.add(elements);
    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 200,
      onComplete: () => {
        this.time.delayedCall(1500, () => {
          this.tweens.add({
            targets: elements,
            alpha: 0,
            duration: 250,
            onComplete: () => {
              elements.forEach(el => el.destroy());
              // Clear highlights and re-enable answering on the same question
              this.questionContainer.removeAll(true);
              this.answered = false;
              this.renderQuestion();
            },
          });
        });
      },
    });
  }

  private showWrongFeedback(q: QuizQuestion, chosenIndex: number): void {
    const depth = 1100;
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
    const wasBoss = getChapterForRound(this.round).isBoss;
    const nextRound = this.round + 1;
    const isNewChapter = nextRound > 1 && (nextRound - 1) % 3 === 0; // next is first of new chapter

    // Check run complete
    if (!this.isEndless && this.round >= this.maxRounds) {
      this.finishRun(true);
      return;
    }

    // Advance round
    this.round = nextRound;

    // Endless: bump difficulty every chapter
    if (this.isEndless && isNewChapter) {
      this.endlessDifficulty += 1;
    }

    // Reset shield at new chapter
    if (isNewChapter) {
      this.shieldUsedThisChapter = false;
    }

    // After BOSS: relic choice + path choice
    if (wasBoss) {
      this.showRelicChoice(() => {
        // After relic, show path choice if next is start of chapter
        if (isNewChapter) {
          this.showPathChoice(() => this.startRound());
        } else {
          this.startRound();
        }
      });
    } else if (isNewChapter) {
      this.showPathChoice(() => this.startRound());
    } else {
      this.startRound();
    }
  }

  private finishRun(won: boolean): void {
    const runState: RunState = {
      round: this.round,
      score: this.score,
      targetScore: 0,
      maxRounds: this.maxRounds,
      unlockedYaku: [],
      isRiichi: false,
      riichiTurns: 0,
      doraIndicators: [],
    };
    persistRun(runState);

    if (won) {
      const { meta, newAchievements } = endRun(runState, true);
      trackRunComplete(true, this.score, this.round);
      if (this.isBeginner) {
        localStorage.setItem(GameConfig.beginner.completedKey, '1');
      }
      if (!this.isBeginner && !this.isEndless && this.round >= this.maxRounds) {
        localStorage.setItem('mjrg_normal_done', '1');
      }
      this.scene.launch('GameOverScene', { runState, won: true, meta, newAchievements, bestCombo: this.bestCombo });
      this.scene.pause();
    }
  }

  // ===== Relic choice screen (after BOSS) =====
  private showRelicChoice(onDone: () => void): void {
    const depth = 1200;
    const choices = getRandomRelics(3, this.relics);

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.8).setDepth(depth);
    const title = this.add.text(512, 140, 'CHOOSE A RELIC', {
      fontSize: '28px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const subtitle = this.add.text(512, 175, 'Pick one power-up for the next chapter', {
      fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, title, subtitle];
    const cardW = 220;
    const cardH = 260;
    const gap = 30;
    const startX = 512 - cardW - gap;

    const rarityColors: Record<string, { border: number; title: string }> = {
      common: { border: 0x8b6f47, title: '#c9b89a' },
      rare: { border: 0x4a6fa5, title: '#6aa3e0' },
      epic: { border: 0x8b4a9e, title: '#c77ae0' },
    };

    choices.forEach((relic, i) => {
      const x = startX + i * (cardW + gap);
      const y = 360;
      const colors = rarityColors[relic.rarity];

      const cardBg = this.add.rectangle(x, y, cardW, cardH, 0x1a0f08)
        .setStrokeStyle(3, colors.border).setDepth(depth);
      const rarityTag = this.add.text(x, y - cardH / 2 + 20, relic.rarity.toUpperCase(), {
        fontSize: '11px', color: colors.title, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(depth + 1);

      const iconMap: Record<string, string> = {
        'hint-scroll': '📜', 'time-charm': '⏳', 'double-talisman': '✦',
        'perspective-glass': '🔍', 'combo-feather': '🪶', 'hourglass': '⌛',
        'lucky-coin': '🪙', 'shield-tile': '🛡',
      };
      const icon = this.add.text(x, y - 20, iconMap[relic.id] || '?', {
        fontSize: '48px',
      }).setOrigin(0.5).setDepth(depth + 1);

      const nameText = this.add.text(x, y + 40, relic.name, {
        fontSize: '18px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(depth + 1);

      const descText = this.add.text(x, y + 75, relic.description, {
        fontSize: '13px', color: '#c9b89a', fontFamily: 'monospace',
        align: 'center', wordWrap: { width: cardW - 30 }, lineSpacing: 4,
      }).setOrigin(0.5, 0).setDepth(depth + 1);

      const hit = this.add.rectangle(x, y, cardW, cardH, 0xffffff, 0)
        .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
      hit.on('pointerover', () => cardBg.setStrokeStyle(5, colors.border));
      hit.on('pointerout', () => cardBg.setStrokeStyle(3, colors.border));
      hit.on('pointerdown', () => {
        this.soundManager.playClick();
        this.applyRelic(relic.id);
        elements.forEach(el => el.destroy());
        onDone();
      });

      elements.push(cardBg, rarityTag, icon, nameText, descText, hit);
    });

    // Skip button
    const skipBg = this.add.rectangle(512, 590, 140, 36, 0x5c3825)
      .setStrokeStyle(2, 0x8b6f47).setDepth(depth);
    const skipText = this.add.text(512, 590, 'SKIP', {
      fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const skipHit = this.add.rectangle(512, 590, 140, 36, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    skipHit.on('pointerover', () => skipBg.setFillStyle(0x8b6f47));
    skipHit.on('pointerout', () => skipBg.setFillStyle(0x5c3825));
    skipHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
      onDone();
    });
    elements.push(skipBg, skipText, skipHit);

    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 300,
    });
  }

  private applyRelic(id: RelicId): void {
    this.relics.push(id);
    // Apply immediate effects
    if (id === 'time-charm') {
      this.lives += 1;
    }
    if (id === 'double-talisman') {
      this.doubleTalismanUses += 3;
    }
    this.updateTopBar();
  }

  // ===== Path choice screen (start of each chapter) =====
  private showPathChoice(onDone: () => void): void {
    const depth = 1200;
    const nextCh = getChapterForRound(this.round);

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.75).setDepth(depth);
    const title = this.add.text(512, 160, `CHOOSE YOUR PATH`, {
      fontSize: '26px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const subtitle = this.add.text(512, 195, `${nextCh.chapter}: ${nextCh.title}`, {
      fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, title, subtitle];
    const cardW = 280;
    const cardH = 320;
    const gap = 50;

    // Safe path
    const safeX = 512 - cardW / 2 - gap / 2;
    const riskyX = 512 + cardW / 2 + gap / 2;
    const y = 380;

    // Safe card
    const safeBg = this.add.rectangle(safeX, y, cardW, cardH, 0x1a0f08)
      .setStrokeStyle(3, 0x4a9e4a).setDepth(depth);
    const safeTitle = this.add.text(safeX, y - 110, 'SAFE PATH', {
      fontSize: '20px', color: '#4a9e4a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const safeDesc = this.add.text(safeX, y - 50, 'Normal questions\nNo extra risk\nStandard score', {
      fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace',
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);
    const safeMul = this.add.text(safeX, y + 20, 'x1.0 SCORE', {
      fontSize: '18px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const safeHit = this.add.rectangle(safeX, y, cardW, cardH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    safeHit.on('pointerover', () => safeBg.setStrokeStyle(5, 0x4a9e4a));
    safeHit.on('pointerout', () => safeBg.setStrokeStyle(3, 0x4a9e4a));
    safeHit.on('pointerdown', () => {
      this.soundManager.playClick();
      this.currentPath = 'safe';
      this.pathMultiplier = 1;
      elements.forEach(el => el.destroy());
      onDone();
    });
    elements.push(safeBg, safeTitle, safeDesc, safeMul, safeHit);

    // Risky card
    const riskyBg = this.add.rectangle(riskyX, y, cardW, cardH, 0x1a0f08)
      .setStrokeStyle(3, 0xc73e3a).setDepth(depth);
    const riskyTitle = this.add.text(riskyX, y - 110, 'RISKY PATH', {
      fontSize: '20px', color: '#c73e3a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const riskyDesc = this.add.text(riskyX, y - 50, 'All questions are BOSS\nHarder hand patterns\nHigher rewards', {
      fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace',
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);
    const riskyMul = this.add.text(riskyX, y + 20, 'x1.5 SCORE', {
      fontSize: '18px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const riskyHit = this.add.rectangle(riskyX, y, cardW, cardH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    riskyHit.on('pointerover', () => riskyBg.setStrokeStyle(5, 0xc73e3a));
    riskyHit.on('pointerout', () => riskyBg.setStrokeStyle(3, 0xc73e3a));
    riskyHit.on('pointerdown', () => {
      this.soundManager.playClick();
      this.currentPath = 'risky';
      this.pathMultiplier = 1.5;
      elements.forEach(el => el.destroy());
      onDone();
    });
    elements.push(riskyBg, riskyTitle, riskyDesc, riskyMul, riskyHit);

    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 300,
    });
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
