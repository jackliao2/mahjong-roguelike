import Phaser from 'phaser';
import { RunState } from '@/types';
import { MetaProgression } from '@/types';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create(data: { runState: RunState; won: boolean; meta: MetaProgression }): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    const { runState, won, meta } = data;

    // Overlay
    this.add.rectangle(0, 0, 1024, 720, 0x000000, 0.8).setOrigin(0);

    // Title
    const title = won ? 'RUN COMPLETE!' : 'GAME OVER';
    const titleColor = won ? '#d4a574' : '#c73e3a';
    this.add.text(512, 120, title, {
      fontSize: '48px',
      color: titleColor,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Stats panel
    const panelX = 512;
    const panelY = 300;
    const panel = this.add.rectangle(panelX, panelY, 400, 260, 0x1a0f08)
      .setStrokeStyle(3, 0xd4a574);

    const stats: string[] = [
      `Rounds Survived: ${runState.round} / ${runState.maxRounds}`,
      `Final Score: ${runState.score}`,
      `Target: ${runState.targetScore}`,
      '',
      `--- Meta Stats ---`,
      `Total Runs: ${meta.totalRuns}`,
      `Total Wins: ${meta.totalWins}`,
      `Best Score: ${meta.bestScore}`,
      `Currency: ${meta.currency}`,
    ];

    this.add.text(panelX, panelY, stats.join('\n'), {
      fontSize: '16px',
      color: '#f5e6d3',
      fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5);

    // Relics collected
    if (runState.relics.length > 0) {
      this.add.text(512, 480, `Relics: ${runState.relics.map(r => r.name).join(', ')}`, {
        fontSize: '12px',
        color: '#8b6f47',
        fontFamily: 'monospace',
        align: 'center',
        wordWrap: { width: 600 },
      }).setOrigin(0.5);
    }

    // Buttons
    this.createButton(400, 600, 'NEW RUN', 0xc73e3a, () => this.startNewRun());
    this.createButton(624, 600, 'HOME', 0xd4a574, () => this.goHome());
  }

  private createButton(x: number, y: number, label: string, color: number, callback: () => void): void {
    const bg = this.add.rectangle(0, 0, 160, 44, color)
      .setStrokeStyle(2, 0x2b1810);
    const text = this.add.text(0, 0, label, {
      fontSize: '14px',
      color: '#2b1810',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, text])
      .setSize(160, 44)
      .setInteractive({ useHandCursor: true });

    container.on('pointerover', () => {
      bg.setScale(1.05);
      text.setScale(1.05);
    });
    container.on('pointerout', () => {
      bg.setScale(1);
      text.setScale(1);
    });
    container.on('pointerdown', callback);
  }

  private startNewRun(): void {
    this.scene.stop('GameScene');
    this.scene.start('GameScene', { action: 'new_run' });
  }

  private goHome(): void {
    window.location.href = '/';
  }
}
