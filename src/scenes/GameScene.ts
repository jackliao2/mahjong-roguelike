import Phaser from 'phaser';
import { Tile, RunState } from '@/types';
import { sortHand } from '@/game/hand';
import { tileKey, getTileDisplay, createFullTileSet } from '@/game/tiles';
import { checkRunComplete, persistRun, endRun } from '@/roguelike/run';
import { completeDailyChallenge, getTodayKey, loadMistakeTypes, loadRun, clearRun, recordMistake, resolveMistake } from '@/data/storage';
import { SoundManager } from '@/render/sound';
import { trackRunStart, trackRunComplete, trackWin } from '@/data/analytics';
import { GameConfig } from '@/config/game-config';
import { generateContinuousTableTurn, generateQuestionForRound, getAdaptiveQuestionType, getChapterForRound, measureDiscardUkeire, QuizQuestion } from '@/game/quizGenerator';
import { RelicId, getRandomRelics, Relic } from '@/game/relics';
import {
  advanceOpponentTurn,
  createOpponentTableState,
  evaluateTileDanger,
  getRoundObjective,
  objectivePointDelta,
  objectiveRiskModifier,
  objectiveValueWeight,
  opponentStatusLabel,
  strategicDiscardScore,
  strategicRiskDelta,
  OpponentTableState,
  RoundObjective,
} from '@/game/tableState';
import {
  BUILD_DEFS,
  BUILD_FOCUS_BONUS,
  BUILD_FOCUS_TARGET,
  BuildId,
  assessDiscardValue,
  getBuildQuestionType,
  getBuildScoreMultiplier,
  isBuildRouteMatch,
} from '@/roguelike/builds';

const OPTION_TILE_W = 64;
const OPTION_TILE_H = 82;
const HAND_TILE_W = 52;
const HAND_TILE_H = 68;
type PathId = 'safe' | 'elite' | 'treasure';
type OpponentId = 'calm' | 'speed' | 'hunter' | 'riichi';

const PATH_DEFS: Record<PathId, {
  name: string;
  hud: string;
  compact: string;
  title: string;
  description: string;
  multiplier: number;
  color: number;
  textColor: string;
}> = {
  safe: {
    name: 'Safe',
    hud: 'SAFE x0.9',
    compact: 'SAFE',
    title: 'SAFE SUPPLY',
    description: '+1 life now\nNormal questions\nLower score',
    multiplier: 0.9,
    color: 0x4a9e4a,
    textColor: '#4a9e4a',
  },
  elite: {
    name: 'Elite',
    hud: 'ELITE x1.8',
    compact: 'ELITE',
    title: 'ELITE TABLE',
    description: 'All questions become BOSS\nHarder patterns\nHuge score',
    multiplier: 1.8,
    color: 0xc73e3a,
    textColor: '#c73e3a',
  },
  treasure: {
    name: 'Treasure',
    hud: 'TREASURE x1.2',
    compact: 'TRSR',
    title: 'TREASURE ROOM',
    description: 'Pick an extra relic now\nNormal questions\nBonus score',
    multiplier: 1.2,
    color: 0xe5b567,
    textColor: '#e5b567',
  },
};

const OPPONENT_DEFS: Record<OpponentId, {
  name: string;
  threat: string;
  startRisk: number;
  pushRisk: number;
  bossPushRisk: number;
  safeRisk: number;
  wrongRisk: number;
  timeoutRisk: number;
}> = {
  calm: {
    name: 'Calm Dealer',
    threat: 'Watches your waits',
    startRisk: 8,
    pushRisk: 8,
    bossPushRisk: 14,
    safeRisk: -24,
    wrongRisk: 34,
    timeoutRisk: 28,
  },
  speed: {
    name: 'Speed Demon',
    threat: 'Fast riichi pressure',
    startRisk: 18,
    pushRisk: 12,
    bossPushRisk: 20,
    safeRisk: -28,
    wrongRisk: 42,
    timeoutRisk: 34,
  },
  hunter: {
    name: 'Mangan Hunter',
    threat: 'Big hand danger',
    startRisk: 24,
    pushRisk: 14,
    bossPushRisk: 22,
    safeRisk: -30,
    wrongRisk: 48,
    timeoutRisk: 38,
  },
  riichi: {
    name: 'Riichi Shark',
    threat: 'Punishes unsafe push',
    startRisk: 35,
    pushRisk: 18,
    bossPushRisk: 26,
    safeRisk: -36,
    wrongRisk: 58,
    timeoutRisk: 45,
  },
};

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
  private lastRelicBonus: number = 0;
  private lastRelicBonusName: string = '';
  private lastSpeedBonus: number = 0;
  private lastDefenseBonus: number = 0;
  private mistakesThisRun: number = 0;
  private bossKillsThisRun: number = 0;

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
  private swapUsedThisChapter: boolean = false;
  private riskSealUsedThisChapter: boolean = false;
  private riskFrozen: boolean = false;

  // Persistent table: normal rounds continue the same hand and rivers.
  private tableHand13: Tile[] | null = null;
  private tableTurn: number = 1;
  private playerRiver: string[] = [];
  private opponentRiver: string[] = [];
  private tablePoints: number = 25000;
  private lastPointDelta: number = 0;
  private predictedNextDraw: Tile | null = null;
  private opponentState: OpponentTableState = createOpponentTableState('calm');
  private currentObjective: RoundObjective = getRoundObjective(1, 25000, 25000);
  private lastOpponentAction: string = 'Opening hand · reading the table';

  // Path system
  private currentPath: PathId = 'safe';
  private pathMultiplier: number = 1;
  private buildStrategy: BuildId = 'balanced';
  private buildFocus: number = 0;
  private lastFocusBonus: number = 0;
  private currentOpponent: OpponentId = 'calm';
  private opponentRisk: number = 0;
  private lastRiskDelta: number = 0;
  private lastRonReason: string = '';
  private stakeMultiplier: number = 1;
  private stakeRiskPenalty: number = 0;

  // Endless mode
  private isEndless: boolean = false;
  private endlessDifficulty: number = 1;
  private isDaily: boolean = false;
  private isReview: boolean = false;

  constructor() {
    super('GameScene');
  }

  create(data?: { action?: string; deckId?: string; difficulty?: string; endless?: boolean; tutorial?: boolean; teaching?: boolean; daily?: boolean; review?: boolean }): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    this.soundManager = new SoundManager(this);

    this.isBeginner = data?.difficulty === 'beginner';
    this.isEndless = data?.endless === true;
    this.isDaily = data?.daily === true;
    this.isReview = data?.review === true;
    this.tutorialActive = data?.tutorial === true;
    this.teachingMode = data?.teaching === true;
    this.tutorialStep = 0;

    if (this.teachingMode) {
      this.maxRounds = GameConfig.beginner.trainingLevels.length;
      this.lives = 999;
    } else {
      this.maxRounds = this.isDaily || this.isReview ? 5 : this.isBeginner ? GameConfig.beginner.maxRounds : GameConfig.rounds.maxRounds;
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
    this.lastRelicBonus = 0;
    this.lastRelicBonusName = '';
    this.lastSpeedBonus = 0;
    this.lastDefenseBonus = 0;
    this.mistakesThisRun = 0;
    this.bossKillsThisRun = 0;
    this.relics = [];
    this.doubleTalismanUses = 0;
    this.shieldUsedThisChapter = false;
    this.swapUsedThisChapter = false;
    this.riskSealUsedThisChapter = false;
    this.riskFrozen = false;
    this.tableHand13 = null;
    this.tableTurn = 1;
    this.playerRiver = [];
    this.opponentRiver = [];
    this.tablePoints = 25000;
    this.lastPointDelta = 0;
    this.predictedNextDraw = null;
    this.opponentState = createOpponentTableState('calm');
    this.currentObjective = getRoundObjective(1, 25000, 25000);
    this.lastOpponentAction = 'Opening hand · reading the table';
    this.currentPath = 'safe';
    this.pathMultiplier = 1;
    this.buildStrategy = 'balanced';
    this.buildFocus = 0;
    this.lastFocusBonus = 0;
    this.currentOpponent = 'calm';
    this.opponentRisk = 0;
    this.lastRiskDelta = 0;
    this.lastRonReason = '';
    this.stakeMultiplier = 1;
    this.stakeRiskPenalty = 0;
    this.endlessDifficulty = 1;

    trackRunStart(this.isDaily ? 'daily' : this.isReview ? 'review' : this.isBeginner ? 'beginner' : 'normal');

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
      } else if (!this.teachingMode && this.isBeginner && !this.isDaily && !this.isReview) {
        this.showStarterBoost(() => this.startRound());
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
    const livesBoxX = 74;
    const livesBoxW = 112;
    const livesBoxH = 48;
    this.add.rectangle(livesBoxX, y, livesBoxW, livesBoxH, 0x1a0a00, 1)
      .setStrokeStyle(2, 0xc73e3a, 0.9).setDepth(10000).setName('livesBox');
    this.add.text(livesBoxX - livesBoxW / 2 + 10, y - 12, '', {
      fontSize: '13px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('roundLabel');

    this.add.text(livesBoxX - livesBoxW / 2 + 10, y + 10, '', {
      fontSize: '22px', color: '#ff4444', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('livesLabel');

    // === Center-left: combo ===
    this.add.text(150, y - 9, '', {
      fontSize: '14px', color: '#ffd700', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('comboLabel');

    this.add.text(150, y + 12, '', {
      fontSize: '10px', color: '#8a7560', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('buildLabel');

    this.add.text(214, y + 12, '', {
      fontSize: '10px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('focusLabel');

    // === Center: SCORE (big, prominent, with background box) ===
    const scoreBoxX = 385;
    const scoreBoxW = 250;
    const scoreBoxH = 48;
    this.add.rectangle(scoreBoxX, y, scoreBoxW, scoreBoxH, 0x1a0a00, 1)
      .setStrokeStyle(2, 0xe5b567, 0.9).setDepth(10000).setName('scoreBox');
    this.add.text(scoreBoxX - scoreBoxW / 2 + 12, y - 12, 'SCORE', {
      fontSize: '11px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('scoreTitle');
    this.add.text(scoreBoxX - scoreBoxW / 2 + 12, y + 10, '0', {
      fontSize: '30px', color: '#ffd700', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('scoreValue');

    // === Right-center: OPPONENT / RISK ===
    const threatBoxX = 592;
    const threatBoxW = 150;
    const threatBoxH = 48;
    this.add.rectangle(threatBoxX, y, threatBoxW, threatBoxH, 0x1a0a00, 1)
      .setStrokeStyle(2, 0xc73e3a, 0.85).setDepth(10000).setName('threatBox');
    this.add.text(threatBoxX - threatBoxW / 2 + 10, y - 13, 'OPPONENT', {
      fontSize: '10px', color: '#c73e3a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('opponentTitle');
    this.add.text(threatBoxX - threatBoxW / 2 + 10, y + 4, '', {
      fontSize: '11px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('opponentLabel');
    this.add.rectangle(threatBoxX - 6, y + 17, 104, 5, 0x3a2018, 1)
      .setOrigin(0, 0.5).setDepth(10001).setName('riskTrack');
    this.add.rectangle(threatBoxX - 6, y + 17, 0, 5, 0xc73e3a, 1)
      .setOrigin(0, 0.5).setDepth(10002).setName('riskFill');
    this.add.text(threatBoxX + 54, y + 17, '', {
      fontSize: '10px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('riskLabel');

    // === Right-center: RELICS (with background box, always visible) ===
    const relicBoxX = 790;
    const relicBoxW = 160;
    const relicBoxH = 48;
    this.add.rectangle(relicBoxX, y, relicBoxW, relicBoxH, 0x1a0a00, 1)
      .setStrokeStyle(2, 0xe5b567, 0.9).setDepth(10000).setName('relicBox');
    this.add.text(relicBoxX - relicBoxW / 2 + 12, y - 12, 'RELICS', {
      fontSize: '11px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(10001).setName('relicTitle');
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
    const scoreTitle = this.children.getByName('scoreTitle') as Phaser.GameObjects.Text;
    const timerLabel = this.children.getByName('timerLabel') as Phaser.GameObjects.Text;
    const relicLabel = this.children.getByName('relicLabel') as Phaser.GameObjects.Text;
    const relicTitle = this.children.getByName('relicTitle') as Phaser.GameObjects.Text;
    const opponentLabel = this.children.getByName('opponentLabel') as Phaser.GameObjects.Text;
    const opponentTitle = this.children.getByName('opponentTitle') as Phaser.GameObjects.Text;
    const riskLabel = this.children.getByName('riskLabel') as Phaser.GameObjects.Text;
    const riskTrack = this.children.getByName('riskTrack') as Phaser.GameObjects.Rectangle;
    const riskFill = this.children.getByName('riskFill') as Phaser.GameObjects.Rectangle;
    const livesBox = this.children.getByName('livesBox') as Phaser.GameObjects.Rectangle;
    const scoreBox = this.children.getByName('scoreBox') as Phaser.GameObjects.Rectangle;
    const relicBox = this.children.getByName('relicBox') as Phaser.GameObjects.Rectangle;
    const threatBox = this.children.getByName('threatBox') as Phaser.GameObjects.Rectangle;

    if (this.teachingMode) {
      if (roundLabel) roundLabel.setText(`LESSON ${this.round}/${this.maxRounds}`);
      if (livesLabel) livesLabel.setText('∞');
      if (comboLabel) comboLabel.setText('');
      if (buildLabel) buildLabel.setText('');
      if (focusLabel) focusLabel.setText('');
      if (scoreValue) scoreValue.setVisible(false);
      if (scoreTitle) scoreTitle.setVisible(false);
      if (timerLabel) timerLabel.setText('');
      if (relicLabel) relicLabel.setText('');
      if (livesBox) livesBox.setVisible(true);
      if (scoreBox) scoreBox.setVisible(false);
      if (relicBox) relicBox.setVisible(false);
      if (relicTitle) relicTitle.setVisible(false);
      if (threatBox) threatBox.setVisible(false);
      if (opponentTitle) opponentTitle.setVisible(false);
      if (opponentLabel) opponentLabel.setText('');
      if (riskLabel) riskLabel.setText('');
      if (riskTrack) riskTrack.setVisible(false);
      if (riskFill) riskFill.setDisplaySize(0, 5);
      return;
    }

    // Show score/relic boxes in normal mode
    if (livesBox) livesBox.setVisible(true);
    if (roundLabel) roundLabel.setVisible(true);
    if (livesLabel) livesLabel.setVisible(true);
    if (comboLabel) comboLabel.setVisible(true);
    if (buildLabel) buildLabel.setVisible(true);
    if (focusLabel) focusLabel.setVisible(true);
    if (scoreBox) scoreBox.setVisible(true);
    if (scoreTitle) scoreTitle.setVisible(true);
    if (scoreValue) scoreValue.setVisible(true);
    if (timerLabel) timerLabel.setVisible(true);
    if (relicLabel) relicLabel.setVisible(true);
    if (relicBox) relicBox.setVisible(true);
    if (relicTitle) relicTitle.setVisible(true);
    if (threatBox) threatBox.setVisible(true);
    if (opponentTitle) opponentTitle.setVisible(true);
    if (opponentLabel) opponentLabel.setVisible(true);
    if (riskLabel) riskLabel.setVisible(true);
    if (riskTrack) riskTrack.setVisible(true);
    if (riskFill) riskFill.setVisible(true);

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
      buildLabel.setText(this.isBeginner ? '' : `B:${BUILD_DEFS[this.buildStrategy].shortName}`);
    }
    if (focusLabel) {
      const pathText = this.isBeginner ? '' : PATH_DEFS[this.currentPath].compact;
      const focusText = !this.isBeginner && this.buildStrategy !== 'balanced'
        ? ` F${this.buildFocus}/${BUILD_FOCUS_TARGET}`
        : '';
      focusLabel.setText(pathText + focusText);
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
    if (opponentLabel) {
      opponentLabel.setText(`${this.currentOpponent.toUpperCase()} · ${opponentStatusLabel(this.opponentState)}`);
    }
    if (riskLabel) {
      const points = `${(this.tablePoints / 1000).toFixed(1)}k`;
      riskLabel.setText(`${this.opponentRisk}% · ${points}`);
      riskLabel.setColor(this.opponentRisk >= 75 ? '#ff5a4f' : this.opponentRisk >= 45 ? '#e5b567' : '#4a9e4a');
    }
    if (riskFill) {
      const color = this.opponentRisk >= 75 ? 0xc73e3a : this.opponentRisk >= 45 ? 0xe5b567 : 0x4a9e4a;
      riskFill.setFillStyle(color, 1);
      riskFill.setDisplaySize(Math.max(2, Math.round(this.opponentRisk * 1.04)), 5);
    }
    if (relicLabel) {
      if (this.relics.length === 0) {
        relicLabel.setText('None');
        relicLabel.setColor('#8a7560');
      } else {
        const icons: Record<string, string> = {
          'hint-scroll': '📜', 'time-charm': '⏳', 'double-talisman': '✦',
          'perspective-glass': '🔍', 'combo-feather': '🪶', 'hourglass': '⌛',
          'lucky-coin': '🪙', 'shield-tile': '🛡', 'red-five': '5',
          'swap-charm': '↻', 'risk-seal': '◆',
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

    this.lastRonReason = "Time ran out under pressure.";
    const pressedTimeout = this.stakeRiskPenalty > 0;
    this.lastPointDelta = 0;
    if (pressedTimeout) {
      this.changeTablePoints(-3900);
      this.lastPointDelta = -4900;
    }
    const hitRon = this.applyRiskDelta(
      OPPONENT_DEFS[this.currentOpponent].timeoutRisk
      + this.stakeRiskPenalty
      + objectiveRiskModifier(this.currentObjective, pressedTimeout),
    );
    if (pressedTimeout && hitRon) {
      this.changeTablePoints(-4100);
      this.lastPointDelta = -9000;
    } else if (!pressedTimeout && hitRon) {
      this.changeTablePoints(-8000);
      this.lastPointDelta = -8000;
    }
    this.lastPointDelta += this.applyObjectiveSettlement(false, this.currentQuestion, pressedTimeout);
    this.stakeMultiplier = 1;
    this.stakeRiskPenalty = 0;
    this.lives -= 1;
    this.mistakesThisRun += 1;
    if (!this.relics.includes('combo-feather')) this.combo = 0;
    if (hitRon && this.lives > 0) this.opponentRisk = 35;
    if (hitRon) this.resetLiveHandAfterDealIn();
    this.updateTopBar();
    if (hitRon) {
      this.soundManager.playGameOver();
      this.showRonFeedback(this.currentQuestion);
    } else if (this.lives > 0) {
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
    this.syncOpponentForRound();
    this.currentObjective = getRoundObjective(this.round, this.tablePoints, this.opponentState.points);
    this.updateTopBar();

    if (this.teachingMode) {
      this.currentTrainingLevel = this.round - 1;
      this.showTeachingIntro(() => {
        this.loadQuestion();
      });
    } else {
      const chapter = getChapterForRound(this.round);
      const isChapterStart = this.round === 1 || (this.round - 1) % 3 === 0;
      if (isChapterStart || chapter.isBoss) {
        this.showRoundIntro(() => this.loadQuestion());
      } else {
        this.time.delayedCall(120, () => this.loadQuestion());
      }
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

    const panel = this.add.rectangle(512, 360, 620, 280, 0x120a06)
      .setStrokeStyle(2, accentColor, 0.7).setDepth(501);
    elements.push(panel);

    const titleText = this.add.text(512, 258, level.title, {
      fontSize: '24px', color: '#4a9e4a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);
    elements.push(titleText);

    const subtitleText = this.add.text(512, 296, level.subtitle, {
      fontSize: '14px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);
    elements.push(subtitleText);

    const descText = this.add.text(512, 370, `${level.description}\n\nGoal: ${level.objective}\nTip: ${level.tip}`, {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
      align: 'center', wordWrap: { width: 540 }, lineSpacing: 7,
    }).setOrigin(0.5).setDepth(502);
    elements.push(descText);

    const btnW = 180;
    const btnH = 40;
    const btnBg = this.add.rectangle(512, 472, btnW, btnH, 0x4a9e4a, 0.9)
      .setStrokeStyle(1, 0x2b1810).setDepth(501);
    elements.push(btnBg);

    const btnText = this.add.text(512, 472, 'START LESSON', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);
    elements.push(btnText);

    const btnHit = this.add.rectangle(512, 472, btnW, btnH, 0xffffff, 0)
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

  private syncOpponentForRound(): void {
    if (this.teachingMode) return;

    const chapterIndex = Math.floor((this.round - 1) / 3);
    const opponentOrder: OpponentId[] = ['calm', 'speed', 'hunter', 'riichi'];
    const nextOpponent = opponentOrder[Math.min(chapterIndex, opponentOrder.length - 1)];
    if (nextOpponent !== this.currentOpponent || this.round === 1) {
      if (this.round !== 1) {
        this.tableHand13 = null;
        this.tableTurn = 1;
        this.playerRiver = [];
        this.opponentRiver = [];
        this.predictedNextDraw = null;
      }
      this.currentOpponent = nextOpponent;
      this.opponentState = createOpponentTableState(nextOpponent);
      this.lastOpponentAction = this.opponentState.actionLog[0];
      this.opponentRisk = OPPONENT_DEFS[nextOpponent].startRisk;
      this.lastRiskDelta = 0;
      this.lastRonReason = '';
    }
  }

  private getCorrectRiskDelta(q: QuizQuestion, optionIndex?: number): number {
    const opponent = OPPONENT_DEFS[this.currentOpponent];
    if (q.type === 'safe-discard') return opponent.safeRisk;

    let delta = q.strategicRead && optionIndex !== undefined && q.optionDangerValues?.[optionIndex] !== undefined
      ? strategicRiskDelta(q.optionDangerValues[optionIndex])
      : q.isBoss ? opponent.bossPushRisk : opponent.pushRisk;
    if (this.currentPath === 'safe') delta = q.optionDangerValues ? delta - 3 : Math.max(4, delta - 5);
    if (this.currentPath === 'elite') delta += q.optionDangerValues ? 5 : 8;
    delta += objectiveRiskModifier(this.currentObjective, this.stakeMultiplier > 1);
    return delta;
  }

  private applyRiskDelta(delta: number): boolean {
    if (this.teachingMode) return false;

    if (this.riskFrozen) {
      this.lastRiskDelta = 0;
      this.riskFrozen = false;
      return false;
    }

    this.lastRiskDelta = delta;
    this.opponentRisk = Phaser.Math.Clamp(this.opponentRisk + delta, 0, 100);
    return this.opponentRisk >= 100;
  }

  private showBuildChoice(onComplete: () => void): void {
    const depth = 900;
    const builds = Object.values(BUILD_DEFS);
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.82).setDepth(depth);
    const title = this.add.text(512, 110, 'CHOOSE YOUR BUILD', {
      fontSize: '28px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const subtitle = this.add.text(512, 145, 'Pick a scoring style. This is not difficulty mode.', {
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
      const tag = this.add.text(x, y - 112, `${build.difficulty.toUpperCase()} · ${build.shortName}`, {
        fontSize: '12px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        letterSpacing: 2,
      }).setOrigin(0.5).setDepth(depth + 1);
      const name = this.add.text(x, y - 66, build.label, {
        fontSize: '18px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        align: 'center', wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5).setDepth(depth + 1);
      const desc = this.add.text(x, y - 4, build.description, {
        fontSize: '13px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
        align: 'center', wordWrap: { width: cardW - 30 }, lineSpacing: 4,
      }).setOrigin(0.5).setDepth(depth + 1);
      const bonus = this.add.text(x, y + 76, build.bonusText, {
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
      ? ch.title.includes('DEFENSE')
        ? 'Boss question - survive riichi pressure'
        : 'Boss question - multiple waiting tiles may exist'
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
      const reviewTypes = loadMistakeTypes();
      const reviewType = this.isReview && reviewTypes.length > 0
        ? reviewTypes[(this.round - 1) % reviewTypes.length] ?? forcedType
        : forcedType;
      const adaptiveType = !this.isDaily && !this.isReview && !this.isBeginner && !reviewType
        ? getAdaptiveQuestionType(this.combo, this.mistakesThisRun, this.round, ch.isBoss)
        : undefined;
      const selectedType = reviewType ?? adaptiveType;
      const continuousTurn = !this.isBeginner && !this.isDaily && !this.isReview && !ch.isBoss;
      this.currentQuestion = continuousTurn
        ? generateContinuousTableTurn(this.tableHand13, this.tableTurn, this.playerRiver, this.opponentRiver, this.predictedNextDraw)
        : this.generateModeQuestion(ch.isBoss && !this.isBeginner && !this.isDaily && !this.isReview ? 'table-decision' : selectedType);
      if (continuousTurn) {
        this.currentQuestion = this.applyStrategicTableRead(this.currentQuestion);
      }
      if (continuousTurn && this.relics.includes('perspective-glass') && this.currentQuestion) {
        this.predictedNextDraw = this.randomTableTile();
        this.currentQuestion.context = `${this.currentQuestion.context ?? 'LIVE TABLE'} · GLASS NEXT: ${this.getTileLabel(this.predictedNextDraw)}`;
      } else if (continuousTurn) {
        this.predictedNextDraw = null;
      }
      if (adaptiveType && !continuousTurn) {
        const adaptiveLabel = adaptiveType === 'tenpai-win' ? 'ADAPTIVE RECOVERY' : 'ADAPTIVE CHALLENGE';
        this.currentQuestion.context = this.currentQuestion.context
          ? `${adaptiveLabel} · ${this.currentQuestion.context}`
          : `${adaptiveLabel} · Difficulty follows your current run`;
      }
      if (this.currentPath === 'elite') {
        this.currentQuestion.isBoss = true;
      }
    }
    this.stakeMultiplier = 1;
    this.stakeRiskPenalty = 0;
    const beginQuestion = () => {
      this.renderQuestion();
      if (!this.teachingMode && this.currentQuestion) {
        const hasHourglass = this.relics.includes('hourglass');
        const extraSec = hasHourglass ? 10 : 0;
        const base = (this.currentQuestion.isBoss ? this.bossTime : this.baseTime) + extraSec;
        const endlessPenalty = this.isEndless ? Math.max(0, this.endlessDifficulty * 1.5) : 0;
        this.startTimer(Math.max(8, base - endlessPenalty));
      }
    };
    const stakeTypes: QuizQuestion['type'][] = ['ukeire-choice', 'table-decision', 'safe-discard'];
    const offerStake = !this.teachingMode && !this.isBeginner && !this.isDaily && !this.isReview
      && !!this.currentQuestion && stakeTypes.includes(this.currentQuestion.type);
    if (offerStake) this.showStakeChoice(beginQuestion);
    else beginQuestion();
  }

  private showStakeChoice(onDone: () => void): void {
    const depth = 1050;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.82).setDepth(depth);
    const title = this.add.text(512, 180, 'CHOOSE YOUR READ', {
      fontSize: '28px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const subtitle = this.add.text(512, 220, `GOAL: ${this.currentObjective.title} · ${this.currentObjective.detail}`, {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
      align: 'center', wordWrap: { width: 760 },
    }).setOrigin(0.5).setDepth(depth + 1);
    const elements: Phaser.GameObjects.GameObject[] = [overlay, title, subtitle];
    const choices = [
      { x: 370, label: 'STEADY READ', detail: 'x1.0 score\nNo point stick', color: 0x4a9e4a, mult: 1, risk: 0 },
      { x: 654, label: 'PRESS THE TABLE', detail: 'Pay 1,000 · x1.6 score\nWin +4,000 · Wrong can deal in', color: 0xc73e3a, mult: 1.6, risk: 25 },
    ];
    choices.forEach(choice => {
      const card = this.add.rectangle(choice.x, 380, 240, 210, 0x1a0f08)
        .setStrokeStyle(3, choice.color).setDepth(depth);
      const label = this.add.text(choice.x, 340, choice.label, {
        fontSize: '18px', color: choice.color === 0xc73e3a ? '#ff7b70' : '#6fbf73',
        fontFamily: '"Nunito", sans-serif', fontStyle: 'bold', align: 'center', wordWrap: { width: 210 },
      }).setOrigin(0.5).setDepth(depth + 1);
      const detail = this.add.text(choice.x, 410, choice.detail, {
        fontSize: '15px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif',
        align: 'center', lineSpacing: 8,
      }).setOrigin(0.5).setDepth(depth + 1);
      const hit = this.add.rectangle(choice.x, 380, 240, 210, 0xffffff, 0)
        .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
      hit.on('pointerover', () => card.setStrokeStyle(5, choice.color));
      hit.on('pointerout', () => card.setStrokeStyle(3, choice.color));
      hit.on('pointerdown', () => {
        this.soundManager.playClick();
        this.stakeMultiplier = choice.mult;
        this.stakeRiskPenalty = choice.risk;
        if (choice.risk > 0) {
          this.tablePoints = Math.max(0, this.tablePoints - 1000);
          this.lastPointDelta = -1000;
          this.updateTopBar();
        }
        if (this.currentQuestion && choice.mult > 1) {
          const stakeBanner = `PRESS x${choice.mult.toFixed(1)} · WRONG +${choice.risk}% RISK`;
          this.currentQuestion.context = this.currentQuestion.context
            ? `${stakeBanner} · ${this.currentQuestion.context}`
            : stakeBanner;
        }
        elements.forEach(element => element.destroy());
        onDone();
      });
      elements.push(card, label, detail, hit);
    });
    elements.forEach(element => { (element as any).setAlpha?.(0); });
    this.tweens.add({ targets: elements, alpha: 1, duration: 220 });
  }

  private generateModeQuestion(forcedType?: string): QuizQuestion {
    if (!this.isDaily) return generateQuestionForRound(this.round, this.maxRounds, forcedType);

    const seedText = `${getTodayKey()}-${this.round}`;
    let state = 2166136261;
    for (let i = 0; i < seedText.length; i++) {
      state ^= seedText.charCodeAt(i);
      state = Math.imul(state, 16777619);
    }
    const originalRandom = Math.random;
    Math.random = () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    try {
      return generateQuestionForRound(this.round, this.maxRounds, forcedType);
    } finally {
      Math.random = originalRandom;
    }
  }

  private renderQuestion(): void {
    if (!this.currentQuestion) return;
    const q = this.currentQuestion;
    this.questionContainer.removeAll(true);

    if (this.teachingMode) {
      const level = GameConfig.beginner.trainingLevels[this.currentTrainingLevel];
      const lessonPanel = this.add.rectangle(158, 320, 260, 430, 0x120a06, 0.94)
        .setStrokeStyle(2, 0x4a9e4a, 0.75);
      this.questionContainer.add(lessonPanel);

      const progressLabel = this.add.text(52, 132, `LESSON ${this.round} / ${this.maxRounds}`, {
        fontSize: '11px', color: '#4a9e4a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        letterSpacing: 2,
      }).setOrigin(0, 0.5);
      this.questionContainer.add(progressLabel);

      const lessonTitle = this.add.text(52, 170, level.title.replace('LESSON ' + this.round + ': ', ''), {
        fontSize: '19px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        wordWrap: { width: 210 },
      }).setOrigin(0, 0.5);
      this.questionContainer.add(lessonTitle);

      const lessonSub = this.add.text(52, 214, level.subtitle, {
        fontSize: '12px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        wordWrap: { width: 210 },
      }).setOrigin(0, 0.5);
      this.questionContainer.add(lessonSub);

      const descriptionText = this.add.text(52, 226, level.description, {
        fontSize: '13px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
        wordWrap: { width: 215 }, lineSpacing: 4,
      }).setOrigin(0);
      this.questionContainer.add(descriptionText);

      const goalTitle = this.add.text(52, 304, 'GOAL', {
        fontSize: '12px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0);
      this.questionContainer.add(goalTitle);

      const goalText = this.add.text(52, 326, level.objective, {
        fontSize: '13px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif',
        wordWrap: { width: 215 }, lineSpacing: 4,
      }).setOrigin(0);
      this.questionContainer.add(goalText);

      const tipTitle = this.add.text(52, 398, 'TIP', {
        fontSize: '12px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0);
      this.questionContainer.add(tipTitle);

      const tipText = this.add.text(52, 420, level.tip, {
        fontSize: '13px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
        wordWrap: { width: 215 }, lineSpacing: 4,
      }).setOrigin(0);
      this.questionContainer.add(tipText);

      const noPressure = this.add.text(52, 502, 'No timer. No Risk. Wrong answers explain the idea.', {
        fontSize: '12px', color: '#6fbf73', fontFamily: '"Nunito", sans-serif',
        wordWrap: { width: 215 }, lineSpacing: 4,
      }).setOrigin(0, 0.5);
      this.questionContainer.add(noPressure);

      const prompt = this.add.text(650, 104, q.prompt, {
        fontSize: '19px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        align: 'center', wordWrap: { width: 650 },
      }).setOrigin(0.5);
      this.questionContainer.add(prompt);

      const handPanelBg = this.add.rectangle(650, 255, 700, 110, 0x0a0604, 0.45)
        .setStrokeStyle(1, 0x315f34, 0.55);
      this.questionContainer.add(handPanelBg);

      const sortedHand = sortHand([...q.hand]);
      this.renderHandTiles(sortedHand, 650, 255);

      this.renderOptions(q.options, 650, 500);
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

      const isDefenseQuestion = q.type === 'safe-discard';
      const isEfficiencyQuestion = q.type === 'ukeire-choice';
      const isTableDecision = q.type === 'table-decision';
      if (isDefenseQuestion || isEfficiencyQuestion || isTableDecision) {
        const defenseY = routeMatches ? 116 : 98;
        const readLabel = isDefenseQuestion ? 'DEFENSE READ' : isEfficiencyQuestion ? 'EFFICIENCY READ' : 'TABLE DECISION';
        const readColor = isDefenseQuestion ? '#4a9e4a' : isEfficiencyQuestion ? '#e5b567' : '#6aa3e0';
        const defenseLabel = this.add.text(512, defenseY, readLabel, {
          fontSize: '11px', color: readColor, fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
          letterSpacing: 2,
        }).setOrigin(0.5);
        this.questionContainer.add(defenseLabel);
      }

      const promptY = routeMatches || isDefenseQuestion || isEfficiencyQuestion || isTableDecision ? 132 : 115;
      const prompt = this.add.text(512, promptY, q.prompt, {
        fontSize: '20px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        align: 'center', wordWrap: { width: 900 },
      }).setOrigin(0.5);
      this.questionContainer.add(prompt);

      if (q.context && isTableDecision) {
        const contextLines = q.context.split('\n');
        const panelH = 42 + contextLines.length * 29;
        const panelY = promptY + 80;
        const decisionPanel = this.add.rectangle(512, panelY, 760, panelH, 0x0a0604, 0.58)
          .setStrokeStyle(1, 0x4a6fa5, 0.7);
        this.questionContainer.add(decisionPanel);
        contextLines.forEach((line, index) => {
          const context = this.add.text(512, panelY - (contextLines.length - 1) * 14 + index * 29, line, {
            fontSize: index === contextLines.length - 1 ? '13px' : '12px',
            color: index === contextLines.length - 1 ? '#e5b567' : '#c9b89a',
            fontFamily: '"Nunito", sans-serif', fontStyle: 'bold', align: 'center',
            wordWrap: { width: 710 },
          }).setOrigin(0.5);
          this.questionContainer.add(context);
        });
      } else if (q.context) {
        const context = this.add.text(512, promptY + 40, q.context, {
          fontSize: '12px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
          align: 'center', wordWrap: { width: 860 },
        }).setOrigin(0.5);
        this.questionContainer.add(context);
      }

      if (q.tableTurn) {
        const yourRiver = q.playerRiver?.length ? q.playerRiver.map(key => this.getTileKeyLabel(key)).join(' ') : '—';
        const theirRiver = q.opponentRiver?.length ? q.opponentRiver.map(key => this.getTileKeyLabel(key)).join(' ') : '—';
        const objectiveText = this.add.text(512, 198, `GOAL · ${this.currentObjective.title} — ${this.currentObjective.detail}`, {
          fontSize: '11px', color: '#6aa3e0', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
          align: 'center', wordWrap: { width: 900 },
        }).setOrigin(0.5);
        this.questionContainer.add(objectiveText);

        const actionText = this.add.text(512, 218, `${OPPONENT_DEFS[this.currentOpponent].name.toUpperCase()} · ${opponentStatusLabel(this.opponentState)} · ${this.lastOpponentAction}`, {
          fontSize: '10px', color: '#c73e3a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
          align: 'center', wordWrap: { width: 900 },
        }).setOrigin(0.5);
        this.questionContainer.add(actionText);

        const riverText = this.add.text(512, 243, `YOUR RIVER  ${yourRiver}\n${OPPONENT_DEFS[this.currentOpponent].name.toUpperCase()}  ${theirRiver}`, {
          fontSize: '11px', color: '#9f8b73', fontFamily: '"Nunito", sans-serif',
          align: 'center', lineSpacing: 4, wordWrap: { width: 850 },
        }).setOrigin(0.5);
        this.questionContainer.add(riverText);
      }

      if (!isTableDecision) {
        const handPanelW = 640;
        const handPanelH = 110;
        const handPanelY = q.tableTurn ? 325 : 250;
        const handPanelBg = this.add.rectangle(512, handPanelY, handPanelW, handPanelH, 0x0a0604, 0.4)
          .setStrokeStyle(1, 0x3a2818, 0.5);
        this.questionContainer.add(handPanelBg);

        let sortedHand: Tile[];
        if (q.tableTurn && q.drawnTileKey) {
          const base = [...q.hand];
          let drawnIndex = -1;
          for (let i = base.length - 1; i >= 0; i--) {
            if (tileKey(base[i]) === q.drawnTileKey) { drawnIndex = i; break; }
          }
          const drawn = drawnIndex >= 0 ? base.splice(drawnIndex, 1)[0] : undefined;
          sortedHand = sortHand(base);
          if (drawn) sortedHand.push(drawn);
        } else {
          sortedHand = sortHand([...q.hand]);
        }
        this.renderHandTiles(sortedHand, 512, handPanelY + 8, !!q.tableTurn);
      }

      this.renderOptions(q.options, 512, isTableDecision ? 455 : 490);
      this.renderRelicActions();
    }
  }

  /** Render the hand tiles in a centered row */
  private renderHandTiles(tiles: Tile[], centerX: number, y: number, separateDraw: boolean = false): void {
    const gap = 4;
    const drawGap = separateDraw ? 14 : 0;
    const totalW = tiles.length * HAND_TILE_W + (tiles.length - 1) * gap + drawGap;
    const startX = centerX - totalW / 2 + HAND_TILE_W / 2;

    tiles.forEach((tile, i) => {
      const isDrawn = separateDraw && i === tiles.length - 1;
      const x = startX + i * (HAND_TILE_W + gap) + (isDrawn ? drawGap : 0);
      const sprite = this.createHandTileSprite(tile, x, y);
      this.questionContainer.add(sprite);
      if (isDrawn) {
        const drawLabel = this.add.text(x, y - 48, 'DRAW', {
          fontSize: '9px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        }).setOrigin(0.5);
        this.questionContainer.add(drawLabel);
      }
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
    const q = this.currentQuestion;
    if (!q) return;

    if (q.optionLabels) {
      this.renderSemanticOptions(tiles, q.optionLabels, centerX, y);
      return;
    }

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
      const option = this.createOptionButton(tile, x, y, i, isHidden, false);
      this.questionContainer.add(option);
      if (q.optionAnnotations?.[i]) {
        const annotation = q.optionAnnotations[i];
        const color = annotation.startsWith('GENBUTSU')
          ? '#6fbf73'
          : annotation.startsWith('VALUE')
            ? '#6aa3e0'
          : annotation.startsWith('SUJI') || annotation.startsWith('LOW')
            ? '#e5b567'
            : '#ff7b70';
        const label = this.add.text(x, y - 62, annotation, {
          fontSize: '9px', color, fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
          align: 'center', wordWrap: { width: 92 },
        }).setOrigin(0.5);
        this.questionContainer.add(label);
      }
    });
  }

  private applyStrategicTableRead(question: QuizQuestion): QuizQuestion {
    if (!question.tableTurn || question.type !== 'ukeire-choice') return question;

    const defensiveObjective = this.currentObjective.id === 'protect-lead' || this.currentObjective.id === 'avoid-dealin';
    const activeThreat = this.opponentState.mode === 'riichi' || this.opponentState.shanten === 0;
    const focusedBuild = this.buildStrategy !== 'balanced';
    const valueWeight = objectiveValueWeight(this.currentObjective, focusedBuild);
    const valueDriven = valueWeight > 0;
    const dangerDriven = defensiveObjective || activeThreat;
    if (!dangerDriven && !valueDriven) return question;

    const visibleTiles = [...this.playerRiver, ...this.opponentRiver];
    const options = [...question.options];
    const safeKey = dangerDriven ? this.opponentRiver.find(key =>
      question.hand.some(tile => tileKey(tile) === key)
      && !options.some(tile => tileKey(tile) === key),
    ) : undefined;

    if (safeKey) {
      const replacement = question.hand.find(tile => tileKey(tile) === safeKey);
      if (replacement) {
        const metrics = options.map(tile => measureDiscardUkeire(question.hand, tileKey(tile), visibleTiles));
        let replaceIndex = 0;
        for (let i = 1; i < metrics.length; i++) {
          if ((metrics[i]?.liveTiles ?? 0) < (metrics[replaceIndex]?.liveTiles ?? 0)) replaceIndex = i;
        }
        options[replaceIndex] = replacement;
      }
    }

    if (valueDriven) {
      const uniqueHandTiles = [...new Map(question.hand.map(tile => [tileKey(tile), tile])).values()];
      const routeCandidates = uniqueHandTiles
        .map(tile => ({ tile, value: assessDiscardValue(question.hand, tileKey(tile), this.buildStrategy) }))
        .sort((a, b) => b.value.score - a.value.score);
      const routeBest = routeCandidates[0];
      if (routeBest && !options.some(tile => tileKey(tile) === tileKey(routeBest.tile))) {
        const replaceable = options
          .map((tile, index) => ({
            index,
            key: tileKey(tile),
            value: assessDiscardValue(question.hand, tileKey(tile), this.buildStrategy).score,
          }))
          .filter(item => item.key !== safeKey)
          .sort((a, b) => a.value - b.value);
        if (replaceable[0]) options[replaceable[0].index] = routeBest.tile;
      }
    }

    const reads = options.map((tile, index) => {
      const metric = measureDiscardUkeire(question.hand, tileKey(tile), visibleTiles);
      const danger = evaluateTileDanger(tileKey(tile), this.opponentRiver, this.opponentState);
      const value = assessDiscardValue(question.hand, tileKey(tile), this.buildStrategy);
      const liveTiles = metric?.liveTiles ?? 0;
      return {
        index,
        tile,
        liveTiles,
        danger,
        value,
        score: strategicDiscardScore(
          liveTiles,
          dangerDriven ? danger : { ...danger, value: 0 },
          this.currentObjective,
          this.opponentState,
          value.score,
          valueWeight,
        ),
      };
    });
    reads.sort((a, b) => b.score - a.score || b.value.score - a.value.score || a.danger.value - b.danger.value || b.liveTiles - a.liveTiles);
    const best = reads[0];
    const annotations = options.map((_, index) => {
      const read = reads.find(item => item.index === index)!;
      return dangerDriven
        ? `${read.danger.label} ${read.danger.value}\n${read.liveTiles} LIVE · V${read.value.score}`
        : `VALUE ${read.value.score}\n${read.liveTiles} LIVE`;
    });
    const breakdown = options.map((tile, index) => {
      const read = reads.find(item => item.index === index)!;
      return `${this.getTileLabel(tile)}: ${read.liveTiles} live, ${read.value.hanPotential}H ${read.value.route}${dangerDriven ? `, ${read.danger.label} ${read.danger.value}` : ''}`;
    }).join(' · ');

    const prompt = activeThreat
      ? 'The opponent is ready. Which discard best balances safety, value and ukeire?'
      : defensiveObjective
        ? 'Protect your position. Which discard keeps the best safety-efficiency balance?'
        : this.currentObjective.id === 'minimum-value' || this.currentObjective.id === 'overtake'
          ? 'You need points. Which discard best preserves value and ukeire?'
          : `${BUILD_DEFS[this.buildStrategy].shortName} route: which discard best preserves value and ukeire?`;
    const readContext = dangerDriven
      ? 'TABLE READ: safety can outweigh raw ukeire.'
      : `VALUE READ: ${best.value.route} potential matters alongside ukeire.`;

    return {
      ...question,
      options,
      correctIndices: [best.index],
      optionAnnotations: annotations,
      optionDangerValues: dangerDriven
        ? options.map((_, index) => reads.find(item => item.index === index)!.danger.value)
        : undefined,
      strategicRead: true,
      prompt,
      context: `${question.context ?? 'LIVE TABLE'} · ${readContext}`,
      explanation: `${this.getTileLabel(best.tile)} best fits the table: ${best.value.reason}${dangerDriven ? ` ${best.danger.reason}` : ''} It keeps ${best.liveTiles} live tiles.\n${breakdown}`,
    };
  }

  private renderRelicActions(): void {
    const q = this.currentQuestion;
    if (!q?.tableTurn || this.answered) return;

    const actions: { x: number; label: string; enabled: boolean; color: number; run: (label: Phaser.GameObjects.Text) => void }[] = [];
    if (this.relics.includes('swap-charm')) {
      actions.push({
        x: 395,
        label: this.swapUsedThisChapter ? 'SWAP USED' : 'SWAP DRAW',
        enabled: !this.swapUsedThisChapter,
        color: 0x4a6fa5,
        run: () => {
          const base = this.getTableBaseHand(q);
          if (!base) return;
          this.swapUsedThisChapter = true;
          this.currentQuestion = this.applyStrategicTableRead(
            generateContinuousTableTurn(base, this.tableTurn, this.playerRiver, this.opponentRiver),
          );
          this.soundManager.playReward();
          this.renderQuestion();
        },
      });
    }
    if (this.relics.includes('risk-seal')) {
      actions.push({
        x: 629,
        label: this.riskSealUsedThisChapter ? 'RISK SEAL USED' : 'FREEZE RISK',
        enabled: !this.riskSealUsedThisChapter,
        color: 0x2d6a4f,
        run: label => {
          this.riskSealUsedThisChapter = true;
          this.riskFrozen = true;
          label.setText('RISK FROZEN');
          this.soundManager.playReward();
        },
      });
    }

    actions.forEach(action => {
      const bg = this.add.rectangle(action.x, 605, 190, 38, action.enabled ? action.color : 0x2a2018)
        .setStrokeStyle(1, action.enabled ? 0xe5b567 : 0x4a3828);
      const label = this.add.text(action.x, 605, action.label, {
        fontSize: '11px', color: action.enabled ? '#f5e6d3' : '#6a5845',
        fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.questionContainer.add([bg, label]);
      if (action.enabled) {
        const hit = this.add.rectangle(action.x, 605, 190, 38, 0xffffff, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => action.run(label));
        this.questionContainer.add(hit);
      }
    });
  }

  private getTableBaseHand(q: QuizQuestion): Tile[] | null {
    if (!q.drawnTileKey || q.hand.length !== 14) return null;
    const base = [...q.hand];
    for (let i = base.length - 1; i >= 0; i--) {
      if (tileKey(base[i]) === q.drawnTileKey) {
        base.splice(i, 1);
        return base;
      }
    }
    return null;
  }

  private commitTableDiscard(q: QuizQuestion, discarded: Tile): void {
    if (!q.tableTurn || q.hand.length !== 14) return;
    const nextHand = [...q.hand];
    const exactIndex = nextHand.findIndex(tile => tile.id === discarded.id);
    const discardIndex = exactIndex >= 0 ? exactIndex : nextHand.findIndex(tile => tileKey(tile) === tileKey(discarded));
    if (discardIndex < 0) return;
    nextHand.splice(discardIndex, 1);
    this.tableHand13 = nextHand;
    this.playerRiver.push(tileKey(discarded));
    this.tableTurn += 1;
  }

  private advanceOpponentAfterSafeDiscard(): void {
    const visibleMatch = this.tableHand13 && this.tableHand13.length > 0
      ? this.tableHand13[Phaser.Math.Between(0, this.tableHand13.length - 1)]
      : this.randomTableTile();
    this.opponentRiver.push(tileKey(visibleMatch));
    const opponentTurn = advanceOpponentTurn(this.opponentState, this.opponentRisk);
    this.opponentState = opponentTurn.state;
    this.lastOpponentAction = opponentTurn.log;
    this.opponentRisk = Phaser.Math.Clamp(this.opponentRisk + opponentTurn.riskDelta, 0, 95);
    this.currentObjective = getRoundObjective(this.round, this.tablePoints, this.opponentState.points);
  }

  private randomTableTile(): Tile {
    const wall = createFullTileSet();
    return wall[Phaser.Math.Between(0, wall.length - 1)];
  }

  private changeTablePoints(delta: number): void {
    this.tablePoints = Math.max(0, this.tablePoints + delta);
    this.opponentState = {
      ...this.opponentState,
      points: Math.max(0, this.opponentState.points - delta),
    };
  }

  private applyObjectiveSettlement(correct: boolean, q: QuizQuestion, pressed: boolean): number {
    if (this.isBeginner || this.isDaily || this.isReview || this.teachingMode) return 0;
    const delta = objectivePointDelta(this.currentObjective, correct, pressed, !!q.tableTurn);
    if (delta !== 0) this.changeTablePoints(delta);
    this.currentObjective = getRoundObjective(this.round, this.tablePoints, this.opponentState.points);
    return delta;
  }

  private resetLiveHandAfterDealIn(): void {
    const opponentPoints = this.opponentState.points;
    this.tableHand13 = null;
    this.tableTurn = 1;
    this.playerRiver = [];
    this.opponentRiver = [];
    this.opponentState = { ...createOpponentTableState(this.currentOpponent), points: opponentPoints };
    this.lastOpponentAction = 'New hand after deal-in';
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
    this.lastPointDelta = 0;
    if (!isCorrect && !this.teachingMode) recordMistake(q.type);
    if (isCorrect && this.isReview) resolveMistake(q.type);

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
      this.lastRelicBonus = 0;
      this.lastRelicBonusName = '';
      this.lastSpeedBonus = 0;
      this.lastDefenseBonus = 0;
      this.lastFocusBonus = 0;
      this.lastRiskDelta = 0;
      this.lastRonReason = '';

      let baseScore = q.isBoss ? 1500 : 1000;
      baseScore *= this.pathMultiplier;
      baseScore *= this.stakeMultiplier;
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
      if (this.timeLeft >= totalTime * 0.5) {
        this.lastSpeedBonus = q.isBoss ? 650 : 400;
        finalScore += this.lastSpeedBonus;
      }
      if (q.type === 'safe-discard' || q.type === 'ukeire-choice') {
        this.lastDefenseBonus = q.isBoss ? 900 : 600;
        finalScore += this.lastDefenseBonus;
      }
      const chosenTile = q.options[optionIndex];
      this.commitTableDiscard(q, chosenTile);
      if (this.relics.includes('red-five') && this.questionHasFive(q, chosenTile)) {
        this.lastRelicBonus = 750;
        this.lastRelicBonusName = 'Red Five';
        finalScore += this.lastRelicBonus;
      }
      if (isBuildRouteMatch(this.buildStrategy, q.targetYaku)) {
        this.buildFocus += 1;
        if (this.buildFocus >= BUILD_FOCUS_TARGET) {
          this.lastFocusBonus = BUILD_FOCUS_BONUS;
          finalScore += BUILD_FOCUS_BONUS;
          this.buildFocus = 0;
        }
      }
      const pressedCorrect = this.stakeMultiplier > 1;
      if (pressedCorrect) {
        this.changeTablePoints(4000);
        this.lastPointDelta = 3000;
      } else {
        this.lastPointDelta = 0;
      }
      this.lastPointDelta += this.applyObjectiveSettlement(true, q, pressedCorrect);
      this.score += finalScore;
      this.showScoreBurst(finalScore, q.isBoss === true);
      if (q.isBoss) {
        this.bossKillsThisRun += 1;
      }
      trackWin([q.targetYaku || q.type], 1, finalScore, false);
      const hitRon = this.applyRiskDelta(this.getCorrectRiskDelta(q, optionIndex));
      this.updateTopBar();
      if (hitRon) {
        this.changeTablePoints(-8000);
        this.lastPointDelta -= 8000;
        this.lastRonReason = q.type === 'safe-discard'
          ? 'The fold came too late.'
          : 'You pushed through a dangerous table.';
        this.lives -= 1;
        this.mistakesThisRun += 1;
        if (!this.relics.includes('combo-feather')) this.combo = 0;
        if (this.lives > 0) this.opponentRisk = 35;
        this.resetLiveHandAfterDealIn();
        this.updateTopBar();
        this.soundManager.playGameOver();
        this.showRonFeedback(q);
        return;
      }
      if (q.tableTurn) this.advanceOpponentAfterSafeDiscard();
      this.updateTopBar();
      this.showCorrectFeedback(q);
    } else {
      if (this.relics.includes('shield-tile') && !this.shieldUsedThisChapter) {
        this.shieldUsedThisChapter = true;
        this.mistakesThisRun += 1;
        if (!this.relics.includes('combo-feather')) this.combo = 0;
        this.showShieldBlockFeedback(optionIndex);
        this.updateTopBar();
        return;
      }
      this.lastRonReason = 'Unsafe read gave the opponent a shot.';
      const pressedWrong = this.stakeRiskPenalty > 0;
      if (pressedWrong) {
        this.changeTablePoints(-3900);
        this.lastPointDelta = -4900;
      }
      const hitRon = this.applyRiskDelta(
        OPPONENT_DEFS[this.currentOpponent].wrongRisk
        + this.stakeRiskPenalty
        + objectiveRiskModifier(this.currentObjective, pressedWrong),
      );
      if (pressedWrong && hitRon) {
        this.changeTablePoints(-4100);
        this.lastPointDelta = -9000;
      } else if (!pressedWrong && hitRon) {
        this.changeTablePoints(-8000);
        this.lastPointDelta = -8000;
      }
      this.lastPointDelta += this.applyObjectiveSettlement(false, q, pressedWrong);
      this.stakeMultiplier = 1;
      this.stakeRiskPenalty = 0;
      this.lives -= 1;
      this.mistakesThisRun += 1;
      if (!this.relics.includes('combo-feather')) this.combo = 0;
      if (hitRon && this.lives > 0) this.opponentRisk = 35;
      if (hitRon) this.resetLiveHandAfterDealIn();
      this.updateTopBar();
      if (hitRon) {
        this.soundManager.playGameOver();
        this.showRonFeedback(q);
      } else if (this.lives > 0) {
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

    const semantic = !!q.optionLabels;
    const optionW = semantic ? 210 : OPTION_TILE_W;
    const optionH = semantic ? 96 : OPTION_TILE_H;
    const gap = semantic ? 18 : 20;
    const totalW = q.options.length * optionW + (q.options.length - 1) * gap;
    const startX = 512 - totalW / 2 + optionW / 2;
    const highlightY = q.type === 'table-decision' ? 455 : 490;

    q.options.forEach((tile, i) => {
      const x = startX + i * (optionW + gap);
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
        const highlight = this.add.rectangle(x, highlightY, optionW + 12, optionH + 12, color, alpha)
          .setStrokeStyle(4, color, 1);
        this.questionContainer.add(highlight);
      }
    });
  }

  private renderSemanticOptions(tiles: Tile[], labels: string[], centerX: number, y: number): void {
    const width = 210;
    const height = 96;
    const gap = 18;
    const totalW = tiles.length * width + (tiles.length - 1) * gap;
    const startX = centerX - totalW / 2 + width / 2;
    const isBoss = this.currentQuestion?.isBoss ?? false;

    tiles.forEach((_, index) => {
      const x = startX + index * (width + gap);
      const frameColor = isBoss ? 0xc73e3a : 0xd4a574;
      const bg = this.add.rectangle(0, 0, width, height, 0x1a0e08, 0.96)
        .setStrokeStyle(isBoss ? 3 : 2, frameColor, 0.9);
      const label = this.add.text(0, -15, labels[index], {
        fontSize: '17px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        align: 'center', wordWrap: { width: width - 18 },
      }).setOrigin(0.5);
      const hint = this.add.text(0, 20, this.currentQuestion?.optionAnnotations?.[index] ?? '', {
        fontSize: '10px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
        align: 'center', wordWrap: { width: width - 24 }, lineSpacing: 2,
      }).setOrigin(0.5);
      const container = this.add.container(x, y, [bg, label, hint]);
      container.setSize(width, height).setInteractive({ useHandCursor: true });
      container.on('pointerover', () => {
        if (!this.answered) {
          container.setScale(1.04);
          bg.setStrokeStyle(3, 0xe5b567, 1);
        }
      });
      container.on('pointerout', () => {
        if (!this.answered) {
          container.setScale(1);
          bg.setStrokeStyle(isBoss ? 3 : 2, frameColor, 0.9);
        }
      });
      container.on('pointerdown', () => {
        if (!this.answered) this.handleAnswer(index);
      });
      this.questionContainer.add(container);
    });
  }

  private questionHasFive(q: QuizQuestion, chosenTile?: Tile): boolean {
    return q.hand.some(tile => tile.rank === 5) || (!q.optionLabels && chosenTile?.rank === 5);
  }

  /** Give a correct read a short, unmistakable reward moment. */
  private showScoreBurst(points: number, isBoss: boolean): void {
    const color = isBoss ? '#ff7b70' : '#ffd166';
    const text = this.add.text(512, 190, isBoss ? `BOSS CLEAR +${points}` : `+${points}`, {
      fontSize: isBoss ? '30px' : '25px', color,
      fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      stroke: '#1a0e08', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(1300);
    const flash = this.add.rectangle(512, 360, 1024, 720, isBoss ? 0xc73e3a : 0xe5b567, 0.12)
      .setDepth(1290);

    for (let i = 0; i < 12; i++) {
      const spark = this.add.rectangle(512, 240, 7, 7, isBoss ? 0xc73e3a : 0xe5b567).setDepth(1300);
      const angle = (Math.PI * 2 * i) / 12;
      const distance = 85 + Math.random() * 85;
      this.tweens.add({
        targets: spark,
        x: 512 + Math.cos(angle) * distance,
        y: 240 + Math.sin(angle) * distance,
        alpha: 0, scale: 0.2, duration: 420, ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
    this.tweens.add({
      targets: text, y: 145, alpha: 0, scale: 1.25, duration: 650, ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
    this.tweens.add({ targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    if (this.combo > 0 && this.combo % 3 === 0) this.cameras.main.shake(90, 0.003);
  }

  /** First-time runs begin with one simple advantage, creating agency without risk. */
  private showStarterBoost(onDone: () => void): void {
    const boostIds: RelicId[] = ['hint-scroll', 'hourglass', 'lucky-coin'];
    const choices = getRandomRelics(20, []);
    const depth = 1200;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.78).setDepth(depth);
    const title = this.add.text(512, 150, 'PICK A LUCKY CHARM', {
      fontSize: '27px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const subtitle = this.add.text(512, 184, 'A small edge for your first five questions', {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5).setDepth(depth + 1);
    const elements: Phaser.GameObjects.GameObject[] = [overlay, title, subtitle];

    boostIds.forEach((id, index) => {
      const relic = choices.find(item => item.id === id);
      if (!relic) return;
      const x = 272 + index * 240;
      const card = this.add.rectangle(x, 365, 205, 230, 0x1a0f08).setStrokeStyle(3, 0xe5b567).setDepth(depth);
      const icon = this.add.text(x, 305, id === 'hint-scroll' ? '?' : id === 'hourglass' ? '⌛' : '✦', {
        fontSize: '42px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(depth + 1);
      const name = this.add.text(x, 360, relic.name, {
        fontSize: '18px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
        align: 'center', wordWrap: { width: 175 },
      }).setOrigin(0.5).setDepth(depth + 1);
      const description = this.add.text(x, 420, relic.description, {
        fontSize: '13px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
        align: 'center', wordWrap: { width: 165 }, lineSpacing: 4,
      }).setOrigin(0.5).setDepth(depth + 1);
      const hit = this.add.rectangle(x, 365, 205, 230, 0xffffff, 0).setInteractive({ useHandCursor: true }).setDepth(depth + 2);
      hit.on('pointerover', () => card.setStrokeStyle(5, 0xffd166));
      hit.on('pointerout', () => card.setStrokeStyle(3, 0xe5b567));
      hit.on('pointerdown', () => {
        this.soundManager.playReward();
        this.applyRelic(id);
        elements.forEach(el => el.destroy());
        onDone();
      });
      elements.push(card, icon, name, description, hit);
    });
    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({ targets: elements, alpha: 1, duration: 250 });
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

    const title = this.add.text(512, 292, this.isReview ? 'REVIEW CLEARED!' : 'CORRECT!', {
      fontSize: '32px', color: '#4a9e4a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const buildMultiplier = getBuildScoreMultiplier(this.buildStrategy, q.targetYaku, q.isBoss);
    const buildBonus = !this.isBeginner && buildMultiplier > 1
      ? `\n\n${BUILD_DEFS[this.buildStrategy].name}: x${buildMultiplier.toFixed(2)} score`
      : '';
    const pathBonus = !this.isBeginner && this.pathMultiplier !== 1
      ? `\n${PATH_DEFS[this.currentPath].name} path: x${this.pathMultiplier.toFixed(2)} score`
      : '';
    const focusText = !this.isBeginner && isBuildRouteMatch(this.buildStrategy, q.targetYaku)
      ? this.lastFocusBonus > 0
        ? `\nFOCUS COMPLETE: +${this.lastFocusBonus} score`
        : `\nFOCUS: ${this.buildFocus}/${BUILD_FOCUS_TARGET}`
      : '';
    const comboText = this.lastComboBonus > 0
      ? `\nCOMBO BREAKPOINT x${this.combo}: +${this.lastComboBonus} score`
      : '';
    const speedText = this.lastSpeedBonus > 0
      ? `\nQUICK DRAW: +${this.lastSpeedBonus} score`
      : '';
    const defenseText = this.lastDefenseBonus > 0
      ? `\n${q.type === 'ukeire-choice' ? 'EFFICIENCY EDGE' : 'SAFE FOLD'}: +${this.lastDefenseBonus} score`
      : '';
    const riskText = this.lastRiskDelta !== 0
      ? `\nRISK ${this.lastRiskDelta > 0 ? '+' : ''}${this.lastRiskDelta} -> ${this.opponentRisk}%`
      : '';
    const relicText = this.lastRelicBonus > 0
      ? `\n${this.lastRelicBonusName}: +${this.lastRelicBonus} score`
      : '';
    const stakeText = this.stakeMultiplier > 1
      ? `\nPRESS THE TABLE: x${this.stakeMultiplier.toFixed(1)} score`
      : '';

    const fullExplanation = q.explanation + buildBonus + pathBonus + stakeText + focusText + comboText + speedText + defenseText + riskText + relicText;
    const pointText = this.lastPointDelta !== 0
      ? ` · POINTS ${this.lastPointDelta > 0 ? '+' : ''}${this.lastPointDelta}`
      : '';
    const quickSummary = `COMBO x${this.combo} · RISK ${this.opponentRisk}%${pointText}\nGOAL · ${this.currentObjective.title}\nClick WHY? only when you want the full read.`;
    const expText = this.add.text(512, 360, quickSummary, {
      fontSize: '16px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif',
      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, expText];

    // Next button
    const isLastRound = checkRunComplete({ round: this.round, maxRounds: this.maxRounds, score: this.score, targetScore: 0, unlockedYaku: [], isRiichi: false, riichiTurns: 0, doraIndicators: [] } as RunState);
    const btnLabel = isLastRound ? 'COMPLETE!' : 'NEXT ROUND ▶';
    const btnW = 180;
    const btnH = 48;
    const btnY = 360 + panelH / 2 - 40;
    const btnX = 620;
    const btnBg = this.add.rectangle(btnX, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(btnX, btnY, btnLabel, {
      fontSize: '16px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const btnHit = this.add.rectangle(btnX, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0xe04e4a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0xc73e3a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
      this.proceedToNextRound();
    });
    const whyX = 404;
    const whyBg = this.add.rectangle(whyX, btnY, 160, btnH, 0x2d6a4f)
      .setStrokeStyle(2, 0x1a0f08).setDepth(depth);
    const whyText = this.add.text(whyX, btnY, 'WHY?', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const whyHit = this.add.rectangle(whyX, btnY, 160, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    let explanationOpen = false;
    whyHit.on('pointerdown', () => {
      explanationOpen = !explanationOpen;
      expText.setText(explanationOpen ? fullExplanation : quickSummary);
      expText.setFontSize(explanationOpen ? 13 : 16);
      whyText.setText(explanationOpen ? 'SUMMARY' : 'WHY?');
    });
    elements.push(btnBg, btnText, btnHit, whyBg, whyText, whyHit);

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

    const title = this.add.text(512, 282, 'LESSON CLEAR', {
      fontSize: '28px', color: '#4a9e4a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const level = GameConfig.beginner.trainingLevels[this.currentTrainingLevel];
    const lessonName = level?.title.split(':')[1]?.trim() || 'Lesson';
    const subText = this.add.text(512, 322, `You learned: ${lessonName}`, {
      fontSize: '16px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5).setDepth(depth + 1);

    const expText = this.add.text(512, 392, `Rule check\n${level.objective}\n\nWhy it works\n${q.explanation}`, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif',
      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, title, subText, expText];

    const isLastLesson = this.round >= this.maxRounds;
    const btnLabel = isLastLesson ? 'FINISH GUIDE' : 'NEXT LESSON';
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

    const title = this.add.text(512, 286, 'REVIEW THIS SHAPE', {
      fontSize: '25px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const level = GameConfig.beginner.trainingLevels[this.currentTrainingLevel];
    const subText = this.add.text(512, 328, level.tip, {
      fontSize: '15px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif',
      align: 'center', wordWrap: { width: panelW - 70 },
    }).setOrigin(0.5).setDepth(depth + 1);

    const expText = this.add.text(512, 388, `Goal: ${level.objective}\n\n${q.explanation}`, {
      fontSize: '14px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);

    const btnW = 180;
    const btnH = 44;
    const btnY = 360 + panelH / 2 - 36;
    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0x4a9e4a)
      .setStrokeStyle(2, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(512, btnY, 'TRY AGAIN', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const btnHit = this.add.rectangle(512, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0x5abf5a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0x4a9e4a));
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
    const btnText = this.add.text(430, btnY, 'RUN SUMMARY', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const btnHit = this.add.rectangle(430, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0xe04e4a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0xc73e3a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      this.finishRun(false);
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
      this.finishRun(false);
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

  private showRonFeedback(q: QuizQuestion): void {
    const depth = 1100;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.86).setDepth(depth);
    const panelW = 680;
    const panelH = 440;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x120a06)
      .setStrokeStyle(2, 0xc73e3a, 0.9).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 2, panelW - 12, 3, 0xc73e3a, 0.9).setDepth(depth);

    const title = this.add.text(512, 185, 'RON!', {
      fontSize: '38px', color: '#c73e3a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const opponent = OPPONENT_DEFS[this.currentOpponent];
    const sub = this.add.text(512, 232, `${opponent.name} caught your discard`, {
      fontSize: '17px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const riskLine = this.lives > 0
      ? `Risk reached 100% · Lost 1 life · Pressure reset to ${this.opponentRisk}%`
      : 'Risk reached 100% · Dealt in · Run over';
    const consequence = this.add.text(512, 278, `${this.lastRonReason}\n${riskLine}`, {
      fontSize: '13px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
      align: 'center', wordWrap: { width: panelW - 80 }, lineSpacing: 5,
    }).setOrigin(0.5).setDepth(depth + 1);

    const correctIndex = q.correctIndices[0];
    const correctChoice = q.optionLabels?.[correctIndex] ?? String.fromCharCode(65 + correctIndex);
    const betterChoice = this.add.text(512, 329, `BETTER CHOICE · ${correctChoice}   |   GOAL · ${this.currentObjective.title}`, {
      fontSize: '13px', color: '#6fbf73', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      align: 'center', wordWrap: { width: panelW - 70 },
    }).setOrigin(0.5).setDepth(depth + 1);

    const divider = this.add.rectangle(512, 354, panelW - 80, 1, 0x6a5845, 0.6).setDepth(depth + 1);
    const expText = this.add.text(512, 410, q.explanation, {
      fontSize: '13px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif',
      align: 'center', wordWrap: { width: panelW - 90 }, lineSpacing: 5,
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, sub, consequence, betterChoice, divider, expText];

    const btnW = 190;
    const btnH = 46;
    const btnY = 360 + panelH / 2 - 38;
    const btnLabel = this.lives > 0 ? 'CONTINUE' : 'RUN SUMMARY';
    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(512, btnY, btnLabel, {
      fontSize: '15px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const btnHit = this.add.rectangle(512, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0xe04e4a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0xc73e3a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      if (this.lives > 0) {
        elements.forEach(el => el.destroy());
        this.proceedToNextRound();
      } else {
        this.finishRun(false);
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

  // ===== Round progression =====
  private proceedToNextRound(): void {
    if (this.teachingMode) {
      if (this.round >= this.maxRounds) {
        window.location.href = '/play.html';
        return;
      }

      this.round += 1;
      this.startRound();
      return;
    }

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
      this.swapUsedThisChapter = false;
      this.riskSealUsedThisChapter = false;
      this.riskFrozen = false;
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

    const difficulty = this.isDaily ? 'daily' : this.isReview ? 'review' : this.isEndless ? 'endless' : this.isBeginner ? 'beginner' : 'normal';
    const metaDifficulty = this.isEndless ? 'endless' : this.isBeginner ? 'beginner' : 'normal';
    const perfectRun = this.mistakesThisRun === 0;
    const { meta, newAchievements } = endRun(runState, won, {
      score: this.score,
      won,
      difficulty: metaDifficulty,
      maxRound: this.round,
      bestCombo: this.bestCombo,
      perfectRun,
      bossKills: this.bossKillsThisRun,
      relicsCollected: this.relics.length,
    });
    trackRunComplete(won, this.score, this.round);
    if (won && this.isDaily) completeDailyChallenge(this.score);

    if (won) {
      if (this.isBeginner && !this.isDaily && !this.isReview) {
        localStorage.setItem(GameConfig.beginner.completedKey, '1');
      }
      if (!this.isBeginner && !this.isEndless && this.round >= this.maxRounds) {
        localStorage.setItem('mjrg_normal_done', '1');
      }
    }
    this.scene.launch('GameOverScene', {
      runState,
      won,
      meta,
      newAchievements,
      bestCombo: this.bestCombo,
      bossKills: this.bossKillsThisRun,
      relicCount: this.relics.length,
      perfectRun,
      difficulty,
      buildName: BUILD_DEFS[this.buildStrategy].label,
    });
    this.scene.pause();
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
        'lucky-coin': '🪙', 'shield-tile': '🛡', 'red-five': '5',
        'swap-charm': '↻', 'risk-seal': '◆',
      };
      const icon = this.add.text(x, y - 20, iconMap[relic.id] || '?', {
        fontSize: '48px',
        color: relic.id === 'red-five' ? '#c73e3a' : '#f5e6d3',
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
    const cardW = 230;
    const cardH = 320;
    const gap = 28;
    const y = 380;
    const paths: PathId[] = ['safe', 'elite', 'treasure'];
    const startX = 512 - (paths.length * cardW + (paths.length - 1) * gap) / 2 + cardW / 2;

    paths.forEach((path, i) => {
      const def = PATH_DEFS[path];
      const x = startX + i * (cardW + gap);
      const bg = this.add.rectangle(x, y, cardW, cardH, 0x1a0f08)
        .setStrokeStyle(3, def.color).setDepth(depth);
      const titleText = this.add.text(x, y - 112, def.title, {
        fontSize: '18px', color: def.textColor, fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(depth + 1);
      const desc = this.add.text(x, y - 42, def.description, {
        fontSize: '13px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
        align: 'center', lineSpacing: 6, wordWrap: { width: cardW - 28 },
      }).setOrigin(0.5).setDepth(depth + 1);
      const mult = this.add.text(x, y + 54, `x${def.multiplier.toFixed(1)} SCORE`, {
        fontSize: '18px', color: path === 'safe' ? '#f5e6d3' : '#e5b567',
        fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(depth + 1);
      const hint = this.add.text(x, y + 112, path === 'elite' ? 'High risk route' : path === 'treasure' ? 'Build faster' : 'Stabilize run', {
        fontSize: '12px', color: '#8a7560', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(depth + 1);
      const hit = this.add.rectangle(x, y, cardW, cardH, 0xffffff, 0)
        .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
      hit.on('pointerover', () => bg.setStrokeStyle(5, def.color));
      hit.on('pointerout', () => bg.setStrokeStyle(3, def.color));
      hit.on('pointerdown', () => {
        this.soundManager.playClick();
        this.currentPath = path;
        this.pathMultiplier = def.multiplier;
        if (path === 'safe') {
          this.lives += 1;
        }
        elements.forEach(el => el.destroy());
        this.updateTopBar();
        if (path === 'treasure') {
          this.showRelicChoice(onDone);
        } else {
          onDone();
        }
      });
      elements.push(bg, titleText, desc, mult, hint, hit);
    });

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

  private getTileKeyLabel(key: string): string {
    const [suit, rankText] = key.split('-');
    const rank = Number(rankText);
    if (suit === 'man') return `${rank}m`;
    if (suit === 'pin') return `${rank}p`;
    if (suit === 'sou') return `${rank}s`;
    if (suit === 'wind') return ['E', 'S', 'W', 'N'][rank - 1] || '?';
    if (suit === 'dragon') return ['Rd', 'Wh', 'Gr'][rank - 1] || '?';
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
