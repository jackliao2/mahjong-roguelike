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
import {
  BUILD_DEFS,
  BUILD_FOCUS_BONUS,
  BUILD_FOCUS_TARGET,
  BuildId,
  getBuildQuestionType,
  getBuildScoreMultiplier,
  isBuildRouteMatch,
} from '@/roguelike/builds';

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
  private lastComboBonus: number = 0;

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
  private buildStrategy: BuildId = 'balanced';
  private buildFocus: number = 0;
  private lastFocusBonus: number = 0;

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
    this.isEndless = data?.endless === true;
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
    this.lastComboBonus = 0;
    this.relics = [];
    this.doubleTalismanUses = 0;
    this.shieldUsedThisChapter = false;
    this.currentPath = 'safe';
    this.pathMultiplier = 1;
    this.buildStrategy = 'balanced';
    this.buildFocus = 0;
    this.lastFocusBonus = 0;
    this.endlessDifficulty = 1;

    trackRunStart(this.isBeginner ? 'beginner' : 'normal');

    // Background
    this.createBackground();

    // Top bar
    this.createTopBar();
    this.updateTopBar();

    // Containers for question + feedback (rebuilt each round)
    this.questionContainer = this.add.container(0, 0);
    this.feedbackContainer = this.add.container(0, 0);

    // Start first round
    this.time.delayedCall(400, () => {
      if (!this.teachingMode && !this.isBeginner) {
        this.showBuildChoice(() => this.startRound());
      } else {
        this.startRound();
      }
    });
  }

  // ===== Background =====
  private createBackground(): void {
    this.add.rectangle(0, 0, 1024, 720, 0x180e08).setOrigin(0);
    const gradientSteps = 12;
    for (let i = 0; i < gradientSteps; i++) {
      const y = (i / gradientSteps) * 720;
      const alpha = 0.02 + (1 - i / gradientSteps) * 0.04;
      this.add.rectangle(0, y, 1024, 720 / gradientSteps + 1, 0x2a1810, alpha).setOrigin(0);
    }
    const vignette = this.add.graphics();
    vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.5, 0.5);
    vignette.fillEllipse(512, 360, 1400, 1000);
    vignette.setAlpha(0.25);
  }

  // ===== Top bar: round, lives, combo, score, timer, relics, quit =====
  private createTopBar(): void {
    const y = 35;

    // Top bar background strip — FULLY OPAQUE, bright border
    this.add.rectangle(512, y, 1024, 60, 0x000000, 1).setDepth(10000).setName('topBarBg');
    this.add.rectangle(512, y + 30, 1024, 2, 0xe5b567, 0.8).setDepth(10000);

    // === Left: round + lives ===
    this.add.text(20, y - 12, '', {
      fontSize: '13px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('roundLabel');

    this.add.text(20, y + 10, '', {
      fontSize: '22px', color: '#ff4444', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('livesLabel');

    // === Center-left: combo ===
    this.add.text(130, y, '', {
      fontSize: '16px', color: '#ffd700', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('comboLabel');

    this.add.text(555, y - 10, '', {
      fontSize: '12px', color: '#8a7560', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('buildLabel');

    this.add.text(555, y + 10, '', {
      fontSize: '12px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('focusLabel');

    // === Center: SCORE (big, prominent, with background box) ===
    const scoreBoxX = 385;
    const scoreBoxW = 250;
    const scoreBoxH = 48;
    this.add.rectangle(scoreBoxX, y, scoreBoxW, scoreBoxH, 0x1a0a00, 1)
      .setStrokeStyle(2, 0xe5b567, 0.9).setDepth(10000).setName('scoreBox');
    this.add.text(scoreBoxX - scoreBoxW / 2 + 12, y - 12, 'SCORE', {
      fontSize: '11px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001);
    this.add.text(scoreBoxX - scoreBoxW / 2 + 12, y + 10, '0', {
      fontSize: '30px', color: '#ffd700', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('scoreValue');

    // === Right-center: RELICS (with background box, always visible) ===
    const relicBoxX = 725;
    const relicBoxW = 190;
    const relicBoxH = 48;
    this.add.rectangle(relicBoxX, y, relicBoxW, relicBoxH, 0x1a0a00, 1)
      .setStrokeStyle(2, 0xe5b567, 0.9).setDepth(10000).setName('relicBox');
    this.add.text(relicBoxX - relicBoxW / 2 + 12, y - 12, 'RELICS', {
      fontSize: '11px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001);
    this.add.text(relicBoxX - relicBoxW / 2 + 12, y + 10, 'None', {
      fontSize: '16px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('relicLabel');

    // === Right: timer ===
    this.add.text(890, y, '', {
      fontSize: '24px', color: '#ffffff', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('timerLabel');

    // === Far right: quit ===
    const quitW = 60;
    const quitX = 980;
    const quitBg = this.add.rectangle(quitX, y, quitW, 30, 0x000000, 0).setDepth(10001);
    const quitText = this.add.text(quitX, y, 'QUIT', {
      fontSize: '12px', color: '#8a7560', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5).setDepth(10001);
    const quitHit = this.add.rectangle(quitX, y, quitW, 30, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(10001);
    quitHit.on('pointerover', () => {
      quitBg.setFillStyle(0x1a1008);
      quitBg.setStrokeStyle(1, 0xe5b567);
      quitText.setColor('#e5b567');
    });
    quitHit.on('pointerout', () => {
      quitBg.setFillStyle(0x000000, 0);
      quitBg.setStrokeStyle(0, 0x000000);
      quitText.setColor('#8a7560');
    });
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
    const buildLabel = this.children.getByName('buildLabel') as Phaser.GameObjects.Text;
    const focusLabel = this.children.getByName('focusLabel') as Phaser.GameObjects.Text;
    const scoreValue = this.children.getByName('scoreValue') as Phaser.GameObjects.Text;
    const timerLabel = this.children.getByName('timerLabel') as Phaser.GameObjects.Text;
    const relicLabel = this.children.getByName('relicLabel') as Phaser.GameObjects.Text;
    const scoreBox = this.children.getByName('scoreBox') as Phaser.GameObjects.Rectangle;
    const relicBox = this.children.getByName('relicBox') as Phaser.GameObjects.Rectangle;

    if (this.teachingMode) {
      if (roundLabel) roundLabel.setText(`TEACHING · ${this.round}/${this.maxRounds}`);
      if (livesLabel) livesLabel.setText('');
      if (comboLabel) comboLabel.setText('');
      if (buildLabel) buildLabel.setText('');
      if (focusLabel) focusLabel.setText('');
      if (scoreValue) scoreValue.setText('');
      if (timerLabel) timerLabel.setText('');
      if (relicLabel) relicLabel.setText('');
      if (scoreBox) scoreBox.setVisible(false);
      if (relicBox) relicBox.setVisible(false);
      return;
    }

    // Show score/relic boxes in normal mode
    if (scoreBox) scoreBox.setVisible(true);
    if (relicBox) relicBox.setVisible(true);

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
      const nextComboGoal = this.combo < 3 ? 3 : this.combo < 5 ? 5 : this.combo < 8 ? 8 : null;
      comboLabel.setText(nextComboGoal ? `COMBO ${this.combo}/${nextComboGoal}` : `COMBO x${this.combo}`);
    }
    if (buildLabel) {
      buildLabel.setText(this.isBeginner ? '' : `BUILD: ${BUILD_DEFS[this.buildStrategy].shortName}`);
    }
    if (focusLabel) {
      focusLabel.setText(!this.isBeginner && this.buildStrategy !== 'balanced' ? `FOCUS ${this.buildFocus}/${BUILD_FOCUS_TARGET}` : '');
    }
    if (scoreValue) {
      const prevScore = parseInt(scoreValue.text) || 0;
      scoreValue.setText(`${this.score}`);
      if (this.score > prevScore && prevScore > 0) {
        this.tweens.add({
          targets: scoreValue,
          scaleX: 1.3, scaleY: 1.3,
          duration: 100,
          yoyo: true,
          ease: 'Back.easeOut',
        });
      }
    }
    if (timerLabel) {
      timerLabel.setText(this.timerActive ? `${Math.ceil(this.timeLeft)}s` : '');
    }
    if (relicLabel) {
      if (this.relics.length === 0) {
        relicLabel.setText('None');
        relicLabel.setColor('#8a7560');
      } else {
        const icons: Record<string, string> = {
          'hint-scroll': '📜', 'time-charm': '⏳', 'double-talisman': '✦',
          'perspective-glass': '🔍', 'combo-feather': '🪶', 'hourglass': '⌛',
          'lucky-coin': '🪙', 'shield-tile': '🛡',
        };
        relicLabel.setColor('#c9b89a');
        relicLabel.setText(this.relics.map(r => icons[r] || '?').join(' '));
      }
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

    if (this.teachingMode) {
      this.showTeachingRetry(this.currentQuestion, -1);
      return;
    }

    this.lives -= 1;
    if (!this.relics.includes('combo-feather')) this.combo = 0;
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

    const elements: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.85).setDepth(500);
    elements.push(overlay);

    const panel = this.add.rectangle(512, 360, 560, 200, 0x120a06)
      .setStrokeStyle(1, accentColor, 0.6).setDepth(501);
    elements.push(panel);

    const titleText = this.add.text(512, 300, level.title, {
      fontSize: '22px', color: '#4a9e4a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);
    elements.push(titleText);

    const descText = this.add.text(512, 365, level.description, {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
      align: 'center', wordWrap: { width: 500 }, lineSpacing: 6,
    }).setOrigin(0.5).setDepth(502);
    elements.push(descText);

    const btnW = 160;
    const btnH = 40;
    const btnBg = this.add.rectangle(512, 430, btnW, btnH, 0x4a9e4a, 0.9)
      .setStrokeStyle(1, 0x2b1810).setDepth(501);
    elements.push(btnBg);

    const btnText = this.add.text(512, 430, 'START', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);
    elements.push(btnText);

    const btnHit = this.add.rectangle(512, 430, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(503);
    elements.push(btnHit);

    btnHit.on('pointerover', () => btnBg.setFillStyle(0x5abf5a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0x4a9e4a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
      onComplete();
    });

    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 250,
    });
  }

  private showBuildChoice(onComplete: () => void): void {
    const depth = 900;
    const builds = Object.values(BUILD_DEFS);
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.82).setDepth(depth);
    const title = this.add.text(512, 110, 'CHOOSE YOUR BUILD', {
      fontSize: '28px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const subtitle = this.add.text(512, 145, 'Pick a scoring route for this run', {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, title, subtitle];
    const cardW = 220;
    const cardH = 300;
    const gap = 22;
    const startX = 512 - (builds.length * cardW + (builds.length - 1) * gap) / 2 + cardW / 2;
    const y = 360;

    builds.forEach((build, i) => {
      const x = startX + i * (cardW + gap);
      const accent = build.id === 'balanced'
        ? 0xe5b567
        : build.id === 'tanyao'
          ? 0x4a9e4a
          : build.id === 'pinfu'
            ? 0x4a6fa5
            : 0xc73e3a;

      const cardBg = this.add.rectangle(x, y, cardW, cardH, 0x1a0f08)
        .setStrokeStyle(2, accent, 0.85).setDepth(depth);
      const tag = this.add.text(x, y - 112, build.shortName, {
        fontSize: '12px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        letterSpacing: 2,
      }).setOrigin(0.5).setDepth(depth + 1);
      const name = this.add.text(x, y - 68, build.name, {
        fontSize: '18px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        align: 'center', wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5).setDepth(depth + 1);
      const desc = this.add.text(x, y + 4, build.description, {
        fontSize: '13px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
        align: 'center', wordWrap: { width: cardW - 30 }, lineSpacing: 4,
      }).setOrigin(0.5).setDepth(depth + 1);
      const bonus = this.add.text(x, y + 92, build.bonusText, {
        fontSize: '13px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        align: 'center', wordWrap: { width: cardW - 28 },
      }).setOrigin(0.5).setDepth(depth + 1);
      const hit = this.add.rectangle(x, y, cardW, cardH, 0xffffff, 0)
        .setInteractive({ useHandCursor: true }).setDepth(depth + 2);

      hit.on('pointerover', () => cardBg.setStrokeStyle(4, accent));
      hit.on('pointerout', () => cardBg.setStrokeStyle(2, accent, 0.85));
      hit.on('pointerdown', () => {
        this.soundManager.playClick();
        this.buildStrategy = build.id;
        this.updateTopBar();
        elements.forEach(el => el.destroy());
        onComplete();
      });

      elements.push(cardBg, tag, name, desc, bonus, hit);
    });

    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 250,
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
      fontSize: '28px', color: titleColor, fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);
    const subtitleText = this.add.text(512, 340, subtitle, {
      fontSize: '16px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
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
      const ch = getChapterForRound(this.round);
      const forcedType = getBuildQuestionType(this.buildStrategy, this.round, ch.isBoss);
      this.currentQuestion = generateQuestionForRound(this.round, this.maxRounds, forcedType);
      if (this.currentPath === 'risky') {
        this.currentQuestion.isBoss = true;
      }
    }
    this.renderQuestion();
    if (!this.teachingMode) {
      const hasHourglass = this.relics.includes('hourglass');
      const extraSec = hasHourglass ? 10 : 0;
      const base = (this.currentQuestion.isBoss ? this.bossTime : this.baseTime) + extraSec;
      const endlessPenalty = this.isEndless ? Math.max(0, this.endlessDifficulty * 1.5) : 0;
      this.startTimer(Math.max(8, base - endlessPenalty));
    }
  }

  private renderQuestion(): void {
    if (!this.currentQuestion) return;
    const q = this.currentQuestion;
    this.questionContainer.removeAll(true);

    if (this.teachingMode) {
      const level = GameConfig.beginner.trainingLevels[this.currentTrainingLevel];
      const progressLabel = this.add.text(512, 60, `LESSON ${this.round} / ${this.maxRounds}`, {
        fontSize: '12px', color: '#4a9e4a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.questionContainer.add(progressLabel);

      const promptY = 100;
      const prompt = this.add.text(512, promptY, q.prompt, {
        fontSize: '18px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        align: 'center', wordWrap: { width: 800 },
      }).setOrigin(0.5);
      this.questionContainer.add(prompt);

      const sortedHand = sortHand([...q.hand]);
      this.renderHandTiles(sortedHand, 512, 245);

      this.renderOptions(q.options, 512, 470);
    } else {
      const ch = getChapterForRound(this.round);
      const chapterText = ch.isBoss ? `${ch.chapter} · BOSS` : ch.chapter;
      const chapterColor = ch.isBoss ? '#c73e3a' : '#5c4835';
      const chapterLabel = this.add.text(512, 78, chapterText, {
        fontSize: '12px', color: chapterColor, fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        letterSpacing: 4,
      }).setOrigin(0.5);
      this.questionContainer.add(chapterLabel);

      const routeMatches = BUILD_DEFS[this.buildStrategy].targetYaku === q.targetYaku;
      if (routeMatches) {
        const routeLabel = this.add.text(512, 98, `${BUILD_DEFS[this.buildStrategy].shortName} ROUTE`, {
          fontSize: '11px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
          letterSpacing: 2,
        }).setOrigin(0.5);
        this.questionContainer.add(routeLabel);
      }

      const promptY = routeMatches ? 128 : 115;
      const prompt = this.add.text(512, promptY, q.prompt, {
        fontSize: '20px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        align: 'center', wordWrap: { width: 900 },
      }).setOrigin(0.5);
      this.questionContainer.add(prompt);

      const handPanelW = 640;
      const handPanelH = 110;
      const handPanelY = 250;
      const handPanelBg = this.add.rectangle(512, handPanelY, handPanelW, handPanelH, 0x0a0604, 0.4)
        .setStrokeStyle(1, 0x3a2818, 0.5);
      this.questionContainer.add(handPanelBg);

      const sortedHand = sortHand([...q.hand]);
      this.renderHandTiles(sortedHand, 512, handPanelY + 8);

      this.renderOptions(q.options, 512, 490);
    }
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
    const shadow = this.add.rectangle(2, 3, HAND_TILE_W, HAND_TILE_H, 0x000000, 0.25);
    const container = this.add.container(x, y, [shadow, sprite]);
    container.setSize(HAND_TILE_W, HAND_TILE_H);

    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => {
      container.setY(y - 4);
      this.showTileTooltip(tile, x, y - HAND_TILE_H - 8);
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

    // Hint-scroll: hide 2 wrong options (gray them out + disabled)
    const hiddenWrongIndices: Set<number> = new Set();
    if (hasHint) {
      const wrongIndices: number[] = [];
      tiles.forEach((_, i) => {
        if (!q.correctIndices.includes(i)) wrongIndices.push(i);
      });
      const shuffled = this.shuffle(wrongIndices);
      for (let j = 0; j < Math.min(2, shuffled.length); j++) {
        hiddenWrongIndices.add(shuffled[j]);
      }
    }

    const gap = 20;
    const totalW = tiles.length * OPTION_TILE_W + (tiles.length - 1) * gap;
    const startX = centerX - totalW / 2 + OPTION_TILE_W / 2;

    tiles.forEach((tile, i) => {
      const x = startX + i * (OPTION_TILE_W + gap);
      const isHidden = hiddenWrongIndices.has(i);
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
    const shadow = this.add.rectangle(2, 3, OPTION_TILE_W, OPTION_TILE_H, 0x000000, 0.3);
    const frame = this.add.rectangle(0, 0, OPTION_TILE_W + 6, OPTION_TILE_H + 6, 0x000000, 0)
      .setStrokeStyle(isBoss ? 2 : 1, frameColor, 0.6);
    const container = this.add.container(x, y, [frame, shadow, sprite]);
    container.setSize(OPTION_TILE_W + 6, OPTION_TILE_H + 6);

    if (glowCorrect) {
      const glow = this.add.rectangle(0, 0, OPTION_TILE_W + 10, OPTION_TILE_H + 10, 0xe5b567, 0.1)
        .setStrokeStyle(1, 0xe5b567, 0.3);
      container.addAt(glow, 0);
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.2, to: 0.4 },
        duration: 1000,
        yoyo: true,
        repeat: -1,
      });
    }

    if (disabled) {
      sprite.setAlpha(0.2);
      frame.setStrokeStyle(1, 0x444444);
    }

    if (!disabled) {
      container.setInteractive({ useHandCursor: true });
      container.on('pointerover', () => {
        if (!this.answered) {
          container.setScale(1.06);
          frame.setStrokeStyle(isBoss ? 3 : 2, hoverColor);
        }
      });
      container.on('pointerout', () => {
        if (!this.answered) {
          container.setScale(1);
          frame.setStrokeStyle(isBoss ? 2 : 1, frameColor, 0.6);
        }
      });
      container.on('pointerdown', () => {
        if (!this.answered) {
          this.handleAnswer(index);
        }
      });

      // Hover tooltip (only shows while hovering, hides on mouseout)
      container.on('pointerover', () => {
        if (!this.answered) this.showTileTooltip(tile, x, y - OPTION_TILE_H - 10);
      });
      container.on('pointerout', () => {
        this.hideTooltip();
      });
    }

    return container;
  }

  // ===== Answer handling =====
  private handleAnswer(optionIndex: number): void {
    if (!this.currentQuestion || this.answered) return;
    this.answered = true;
    this.stopTimer();
    this.hideTooltip();
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
      this.lastComboBonus = 0;
      this.lastFocusBonus = 0;

      let baseScore = q.isBoss ? 1500 : 1000;
      baseScore *= this.pathMultiplier;
      const buildMultiplier = getBuildScoreMultiplier(this.buildStrategy, q.targetYaku, q.isBoss);
      baseScore *= buildMultiplier;
      if (this.relics.includes('lucky-coin')) baseScore *= 1.3;
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

      let finalScore = Math.round(baseScore);
      if (this.combo === 3 || this.combo === 5 || this.combo === 8) {
        this.lastComboBonus = this.combo * 250;
        finalScore += this.lastComboBonus;
      }
      if (isBuildRouteMatch(this.buildStrategy, q.targetYaku)) {
        this.buildFocus += 1;
        if (this.buildFocus >= BUILD_FOCUS_TARGET) {
          this.lastFocusBonus = BUILD_FOCUS_BONUS;
          finalScore += BUILD_FOCUS_BONUS;
          this.buildFocus = 0;
        }
      }
      this.score += finalScore;
      trackWin([q.targetYaku || q.type], 1, finalScore, false);
      this.updateTopBar();
      this.showCorrectFeedback(q);
    } else {
      if (this.relics.includes('shield-tile') && !this.shieldUsedThisChapter) {
        this.shieldUsedThisChapter = true;
        if (!this.relics.includes('combo-feather')) this.combo = 0;
        this.showShieldBlockFeedback(optionIndex);
        this.updateTopBar();
        return;
      }
      this.lives -= 1;
      if (!this.relics.includes('combo-feather')) this.combo = 0;
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
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x120a06)
      .setStrokeStyle(2, 0x4a9e4a, 0.8).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 2, panelW - 12, 2, 0x4a9e4a, 0.8).setDepth(depth);

    const title = this.add.text(512, 300, 'CORRECT!', {
      fontSize: '32px', color: '#4a9e4a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const buildMultiplier = getBuildScoreMultiplier(this.buildStrategy, q.targetYaku, q.isBoss);
    const buildBonus = !this.isBeginner && buildMultiplier > 1
      ? `\n\n${BUILD_DEFS[this.buildStrategy].name}: x${buildMultiplier.toFixed(2)} score`
      : '';
    const focusText = !this.isBeginner && isBuildRouteMatch(this.buildStrategy, q.targetYaku)
      ? this.lastFocusBonus > 0
        ? `\nFOCUS COMPLETE: +${this.lastFocusBonus} score`
        : `\nFOCUS: ${this.buildFocus}/${BUILD_FOCUS_TARGET}`
      : '';
    const comboText = this.lastComboBonus > 0
      ? `\nCOMBO BREAKPOINT x${this.combo}: +${this.lastComboBonus} score`
      : '';

    const expText = this.add.text(512, 360, q.explanation + buildBonus + focusText + comboText, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif',
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
      fontSize: '16px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
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

    elements.forEach(el => {
      (el as any).setAlpha?.(0);
      if ((el as any).setScale) (el as any).setScale(0.92);
    });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      scale: 1,
      duration: 350,
      ease: 'Back.easeOut',
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
      fontSize: '28px', color: '#4a9e4a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const level = GameConfig.beginner.trainingLevels[this.currentTrainingLevel];
    const lessonName = level?.title.split(':')[1]?.trim() || 'Lesson';
    const subText = this.add.text(512, 330, `You mastered: ${lessonName}`, {
      fontSize: '16px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5).setDepth(depth + 1);

    const expText = this.add.text(512, 385, q.explanation, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif',
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
      fontSize: '15px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
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
      fontSize: '26px', color: '#c73e3a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const subText = this.add.text(512, 330, 'Let\'s understand why — try again!', {
      fontSize: '15px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5).setDepth(depth + 1);

    const expText = this.add.text(512, 380, q.explanation, {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);

    const btnW = 180;
    const btnH = 44;
    const btnY = 360 + panelH / 2 - 36;
    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(2, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(512, btnY, 'TRY AGAIN', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
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
      fontSize: '24px', color: '#4a9ebf', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const sub = this.add.text(512, 370, 'Mistake absorbed. Try again!', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif',
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
      fontSize: '28px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const sub = this.add.text(512, 370, `${this.lives} ${this.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`, {
      fontSize: '15px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif',
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
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x120a06)
      .setStrokeStyle(2, 0xc73e3a, 0.8).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 2, panelW - 12, 2, 0xc73e3a, 0.8).setDepth(depth);

    const title = this.add.text(512, 320, 'WRONG!', {
      fontSize: '28px', color: '#c73e3a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const sub = this.add.text(512, 360, `${this.lives} ${this.lives === 1 ? 'LIFE' : 'LIVES'} LEFT — TRY AGAIN`, {
      fontSize: '16px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const hint = this.add.text(512, 392, '(pick another option)', {
      fontSize: '13px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
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
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x120a06)
      .setStrokeStyle(2, 0xc73e3a, 0.8).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 2, panelW - 12, 2, 0xc73e3a, 0.8).setDepth(depth);

    const title = this.add.text(512, 280, 'GAME OVER', {
      fontSize: '32px', color: '#c73e3a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const correctText = q.correctIndices.length === 1
      ? `Correct answer: ${String.fromCharCode(65 + q.correctIndices[0])}`
      : `Correct: ${q.correctIndices.map(i => String.fromCharCode(65 + i)).join(', ')}`;
    const correctLabel = this.add.text(512, 330, correctText, {
      fontSize: '16px', color: '#4a9e4a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const expText = this.add.text(512, 380, q.explanation, {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
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
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
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
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const menuHit = this.add.rectangle(620, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    menuHit.on('pointerover', () => menuBg.setFillStyle(0x8b6f47));
    menuHit.on('pointerout', () => menuBg.setFillStyle(0x5c3825));
    menuHit.on('pointerdown', () => {
      this.soundManager.playClick();
      window.location.href = '/play.html';
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
      fontSize: '28px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const subtitle = this.add.text(512, 175, 'Pick one power-up for the next chapter', {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
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
        fontSize: '11px', color: colors.title, fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
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
        fontSize: '18px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(depth + 1);

      const descText = this.add.text(x, y + 75, relic.description, {
        fontSize: '13px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
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
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
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
      this.lives += 2;
    }
    if (id === 'double-talisman') {
      this.doubleTalismanUses += 3;
    }
    if (id === 'shield-tile') {
      this.lives += 1;
    }
    this.updateTopBar();
  }

  // ===== Path choice screen (start of each chapter) =====
  private showPathChoice(onDone: () => void): void {
    const depth = 1200;
    const nextCh = getChapterForRound(this.round);

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.75).setDepth(depth);
    const title = this.add.text(512, 160, `CHOOSE YOUR PATH`, {
      fontSize: '26px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const subtitle = this.add.text(512, 195, `${nextCh.chapter}: ${nextCh.title}`, {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
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
      fontSize: '20px', color: '#4a9e4a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const safeDesc = this.add.text(safeX, y - 50, 'Normal questions\nNo extra risk\nStandard score', {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);
    const safeMul = this.add.text(safeX, y + 20, 'x1.0 SCORE', {
      fontSize: '18px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
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
      fontSize: '20px', color: '#c73e3a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const riskyDesc = this.add.text(riskyX, y - 50, 'All questions are BOSS\nHarder hand patterns\nHigher rewards', {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);
    const riskyMul = this.add.text(riskyX, y + 20, 'x1.5 SCORE', {
      fontSize: '18px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
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
    if (this.answered) return;
    this.hideTooltip();
    const display = getTileDisplay(tile);
    const lines = [display.englishName, `(${display.romaji})`, display.westernHint];

    const bg = this.add.rectangle(x, y, 180, 56, 0x120a06, 0.92)
      .setStrokeStyle(1, 0x8b6f47, 0.8)
      .setDepth(500)
      .setName('tooltipBg');
    const text = this.add.text(x, y, lines.join('\n'), {
      fontSize: '12px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif', align: 'center',
    }).setOrigin(0.5).setDepth(501).setName('tooltipText');
  }

  private hideTooltip(): void {
    const bg = this.children.getByName('tooltipBg');
    const text = this.children.getByName('tooltipText');
    if (bg) bg.destroy();
    if (text) text.destroy();
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
