import Phaser from 'phaser';
import { RunState, MetaProgression } from '@/types';
import { Achievement } from '@/roguelike/meta';
import { addLeaderboardEntry, LeaderboardEntry } from '@/data/storage';

export class GameOverScene extends Phaser.Scene {
  private titleColorHex = '#c73e3a';

  constructor() {
    super('GameOverScene');
  }

  create(data: {
    runState: RunState;
    won: boolean;
    meta: MetaProgression;
    newAchievements?: Achievement[];
    bestCombo?: number;
    bossKills?: number;
    relicCount?: number;
    perfectRun?: boolean;
    difficulty?: string;
    buildName?: string;
  }): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    const { runState, won, meta, newAchievements } = data;
    const leaderboard = addLeaderboardEntry({
      score: runState.score,
      round: runState.round,
      maxRounds: runState.maxRounds,
      won,
      difficulty: data.difficulty || 'run',
      build: data.buildName || 'Build',
      date: new Date().toLocaleDateString(),
    });

    // ===== Decorative background (matches GameScene theme) =====
    this.add.rectangle(0, 0, 1024, 720, 0x2b1810).setOrigin(0);
    for (let y = 0; y < 720; y += 4) {
      const alpha = 0.04 + Math.random() * 0.04;
      this.add.rectangle(0, y, 1024, 2, 0x5c3825, alpha).setOrigin(0);
    }
    // Dim overlay so content stands out
    this.add.rectangle(0, 0, 1024, 720, 0x000000, 0.55).setOrigin(0);

    this.titleColorHex = won ? '#d4a574' : '#c73e3a';

    // ===== Decorative hanging lanterns (top corners) =====
    this.createLantern(60, 90);
    this.createLantern(964, 90);

    // ===== Title with pixel shadow + subtitle =====
    const title = won ? 'RUN COMPLETE!' : 'GAME OVER';
    this.add.text(508, 96, title, {
      fontSize: '44px',
      color: '#1a0e08',
      fontFamily: '"Nunito", sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const titleText = this.add.text(512, 92, title, {
      fontSize: '44px',
      color: this.titleColorHex,
      fontFamily: '"Nunito", sans-serif',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    // Subtitle
    const subtitle = won
      ? `You conquered all ${runState.maxRounds} rounds`
      : `Fell on round ${runState.round} of ${runState.maxRounds}`;
    this.add.text(512, 132, subtitle, {
      fontSize: '16px',
      color: '#c9b89a',
      fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5);

    // Bounce-in animation for title
    titleText.setScale(0.4);
    this.tweens.add({
      targets: titleText,
      scale: 1,
      duration: 500,
      ease: 'Back.easeOut',
    });

    // ===== Stats panel with decorative border =====
    this.createStatsPanel(330, 320, runState, meta, won, data);
    this.createLeaderboardPanel(770, 320, leaderboard, runState.score);

    // ===== New achievements banner (if any) =====
    if (newAchievements && newAchievements.length > 0) {
      this.createAchievementBanner(512, 482, newAchievements);
    }

    // ===== Relics & Custom Tiles summary =====
    this.createCollectionSummary(512, 540, runState);

    // ===== Buttons =====
    this.createButton(400, 640, 'NEW RUN', 0xc73e3a, () => this.startNewRun());
    this.createButton(624, 640, 'HOME', 0xd4a574, () => this.goHome());
  }

  // ===== Decorative lantern (matches GameScene) =====
  private createLantern(x: number, y: number): void {
    const rope = this.add.rectangle(x, y - 40, 2, 40, 0x8b6f47);
    const lantern = this.add.ellipse(x, y, 28, 36, 0xc73e3a)
      .setStrokeStyle(2, 0x9b2b28);
    const glow = this.add.ellipse(x, y, 50, 50, 0xc73e3a, 0.15);
    this.add.rectangle(x, y - 18, 16, 4, 0x2b1810);
    this.add.rectangle(x, y + 18, 12, 3, 0xe5b567);
    this.tweens.add({
      targets: [rope, lantern, glow],
      angle: 3,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // ===== Stats panel with framed sections =====
  private createStatsPanel(
    cx: number,
    cy: number,
    runState: RunState,
    meta: MetaProgression,
    won: boolean,
    runStats: { bestCombo?: number; bossKills?: number; relicCount?: number; perfectRun?: boolean }
  ): void {
    const panelW = 480;
    const panelH = 310;

    // Outer shadow
    this.add.rectangle(cx + 4, cy + 4, panelW, panelH, 0x000000, 0.5).setOrigin(0.5);
    // Main panel bg
    this.add.rectangle(cx, cy, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0xd4a574);
    // Inner accent line (red for loss, gold for win)
    const accentColor = won ? 0xe5b567 : 0xc73e3a;
    this.add.rectangle(cx, cy - panelH / 2 + 4, panelW - 10, 2, accentColor).setOrigin(0.5);
    this.add.rectangle(cx, cy + panelH / 2 - 4, panelW - 10, 2, accentColor).setOrigin(0.5);
    // Corner accent dots (decorative)
    const cornerOffset = 14;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const dot = this.add.rectangle(
        cx + dx * (panelW / 2 - cornerOffset),
        cy + dy * (panelH / 2 - cornerOffset),
        4, 4, 0xe5b567
      );
      dot.setStrokeStyle(1, 0x2b1810);
    }

    // Section header: THIS RUN
    this.add.text(cx, cy - panelH / 2 + 22, 'THIS RUN', {
      fontSize: '13px', color: '#8b6f47', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5);

    // Run stats - 2-column layout
    const runStatsY = cy - 70;
    this.createStatRow(cx - 110, runStatsY, 'ROUNDS', `${runState.round} / ${runState.maxRounds}`, '#f5e6d3');
    this.createStatRow(cx + 110, runStatsY, 'SCORE', `${runState.score}`, '#e5b567');
    this.createStatRow(cx - 110, runStatsY + 36, 'BEST COMBO', `${runStats.bestCombo ?? 0}`, '#ffd700');
    this.createStatRow(cx + 110, runStatsY + 36, 'RESULT', won ? 'WIN' : 'LOSS', won ? '#d4a574' : '#c73e3a');
    this.createStatRow(cx - 110, runStatsY + 72, 'BOSS KILLS', `${runStats.bossKills ?? 0}`, '#c73e3a');
    this.createStatRow(cx + 110, runStatsY + 72, 'RELICS', `${runStats.relicCount ?? 0}`, '#6aa3e0');
    if (runStats.perfectRun) {
      this.add.text(cx, runStatsY + 105, 'PERFECT RUN', {
        fontSize: '13px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5);
    }

    // Divider
    this.add.rectangle(cx, cy + 48, panelW - 40, 1, 0x5c3825);

    // Section header: META
    this.add.text(cx, cy + 62, 'META PROGRESSION', {
      fontSize: '13px', color: '#8b6f47', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5);

    // Meta stats - 2-column layout
    const metaStatsY = cy + 90;
    const isNewBest = runState.score >= meta.bestScore && runState.score > 0;
    this.createStatRow(cx - 110, metaStatsY, 'TOTAL RUNS', `${meta.totalRuns}`, '#f5e6d3');
    this.createStatRow(cx + 110, metaStatsY, 'TOTAL WINS', `${meta.totalWins}`, '#d4a574');
    this.createStatRow(cx - 110, metaStatsY + 36, 'TOP',
      `${meta.bestScore}${isNewBest ? '  *NEW*' : ''}`,
      isNewBest ? '#e5b567' : '#c9b89a');
  }

  private createLeaderboardPanel(cx: number, cy: number, entries: LeaderboardEntry[], currentScore: number): void {
    const panelW = 350;
    const panelH = 310;
    this.add.rectangle(cx + 4, cy + 4, panelW, panelH, 0x000000, 0.45).setOrigin(0.5);
    this.add.rectangle(cx, cy, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0x4a6fa5);
    this.add.rectangle(cx, cy - panelH / 2 + 4, panelW - 10, 2, 0x4a6fa5).setOrigin(0.5);

    this.add.text(cx, cy - 130, 'LOCAL TOP 5', {
      fontSize: '13px', color: '#8b9cc8', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      letterSpacing: 2,
    }).setOrigin(0.5);

    if (entries.length === 0) {
      this.add.text(cx, cy, 'No scores yet', {
        fontSize: '14px', color: '#8b7a67', fontFamily: '"Nunito", sans-serif',
      }).setOrigin(0.5);
      return;
    }

    entries.forEach((entry, index) => {
      const y = cy - 92 + index * 44;
      const isCurrent = entry.score === currentScore && index === entries.findIndex(e => e.score === currentScore);
      const rowColor = isCurrent ? 0x263a22 : 0x120a06;
      const strokeColor = isCurrent ? 0x4a9e4a : 0x2a2018;
      this.add.rectangle(cx, y, panelW - 30, 34, rowColor, 0.8)
        .setStrokeStyle(1, strokeColor, 0.9);
      this.add.text(cx - 150, y, `${index + 1}`, {
        fontSize: '15px', color: isCurrent ? '#4a9e4a' : '#8b7a67',
        fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      this.add.text(cx - 118, y - 6, `${entry.score}`, {
        fontSize: '16px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      this.add.text(cx - 118, y + 9, `${entry.difficulty.toUpperCase()} · ${entry.build}`, {
        fontSize: '10px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
      }).setOrigin(0, 0.5);
      this.add.text(cx + 132, y, entry.won ? 'WIN' : `R${entry.round}`, {
        fontSize: '12px', color: entry.won ? '#4a9e4a' : '#c73e3a',
        fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(1, 0.5);
    });
  }

  // ===== Single labeled stat row =====
  private createStatRow(x: number, y: number, label: string, value: string, valueColor: string): void {
    this.add.text(x - 70, y, label, {
      fontSize: '12px', color: '#8b6f47', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0, 0.5);
    this.add.text(x + 70, y, value, {
      fontSize: '17px', color: valueColor, fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(1, 0.5);
  }

  // ===== Yaku collection summary =====
  private createCollectionSummary(cx: number, y: number, runState: RunState): void {
    const yakuCount = runState.unlockedYaku.length;

    // Background bar
    this.add.rectangle(cx, y, 700, 56, 0x1a0f08, 0.6)
      .setStrokeStyle(2, 0x5c3825);

    // Single centered stat column: Yaku unlocked
    this.add.text(cx, y - 12, 'YAKU UNLOCKED', {
      fontSize: '12px', color: '#8b6f47', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5);
    this.add.text(cx, y + 8, `${yakuCount}`, {
      fontSize: '24px', color: '#2d6a4f', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  // ===== New achievements unlocked banner =====
  private createAchievementBanner(cx: number, y: number, achievements: Achievement[]): void {
    const bannerW = 560;
    const bannerH = 36;
    // Background with golden glow
    this.add.rectangle(cx, y, bannerW, bannerH, 0x2a1d10, 0.9)
      .setStrokeStyle(2, 0xe5b567);
    // Trophy icon (pixel star)
    this.add.text(cx - bannerW / 2 + 18, y, '*', {
      fontSize: '20px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    // Achievement text
    const names = achievements.map(a => a.name).join('  +  ');
    const text = this.add.text(cx, y, `ACHIEVEMENT UNLOCKED: ${names}`, {
      fontSize: '11px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      align: 'center', wordWrap: { width: bannerW - 80 },
    }).setOrigin(0.5);

    // Slide-in animation from left
    text.setAlpha(0);
    text.setX(cx - 60);
    this.tweens.add({
      targets: text,
      alpha: 1,
      x: cx,
      duration: 600,
      delay: 800,
      ease: 'Back.easeOut',
    });
  }

  // ===== Button with pixel shadow + hover lift (matches GameScene) =====
  private createButton(x: number, y: number, label: string, color: number, callback: () => void): void {
    const width = 180;
    const height = 48;
    const shadow = this.add.rectangle(4, 4, width, height, 0x000000, 0.5);
    const bg = this.add.rectangle(0, 0, width, height, color)
      .setStrokeStyle(3, 0x2b1810);
    const highlightStrip = this.add.rectangle(0, -height / 2 + 3, width - 6, 2, 0xffffff, 0.4);
    const text = this.add.text(0, 0, label, {
      fontSize: '16px', color: '#f5e6d3',
      fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [shadow, bg, highlightStrip, text])
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
      callback();
    });
  }

  private startNewRun(): void {
    this.scene.stop('GameScene');
    this.scene.start('DeckSelectScene');
  }

  private goHome(): void {
    window.location.href = '/';
  }
}
