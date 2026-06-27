import Phaser from 'phaser';
import { Reward } from '@/roguelike/rewards';
import { RunState } from '@/types';

const CARD_WIDTH = 200;
const CARD_HEIGHT = 280;
const CARD_SPACING = 30;

export class RewardScene extends Phaser.Scene {
  private runState!: RunState;
  private rewardCards: Phaser.GameObjects.Container[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private hoverIndex: number = -1;

  constructor() {
    super('RewardScene');
  }

  create(data: { runState: RunState; rewards: Reward[] }): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    this.runState = data.runState;
    this.rewardCards = [];

    // Dim background
    this.add.rectangle(0, 0, 1024, 720, 0x000000, 0.7).setOrigin(0);

    // Title
    this.titleText = this.add.text(512, 100, 'CHOOSE YOUR REWARD', {
      fontSize: '28px',
      color: '#d4a574',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(512, 140, `Round ${data.runState.round} cleared! Pick one bonus.`, {
      fontSize: '16px',
      color: '#f5e6d3',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Create 3 reward cards
    const totalWidth = 3 * CARD_WIDTH + 2 * CARD_SPACING;
    const startX = 512 - totalWidth / 2;

    data.rewards.forEach((reward, index) => {
      const x = startX + index * (CARD_WIDTH + CARD_SPACING) + CARD_WIDTH / 2;
      const card = this.createRewardCard(x, 360, reward, index);
      this.rewardCards.push(card);
    });

    // Skip button
    this.createSkipButton();
  }

  private createRewardCard(x: number, y: number, reward: Reward, index: number): Phaser.GameObjects.Container {
    const typeColors: Record<string, number> = {
      relic: 0xd4a574,
      customTile: 0xc73e3a,
      yakuBoost: 0x2d6a4f,
    };
    const typeLabels: Record<string, string> = {
      relic: 'RELIC',
      customTile: 'TILE',
      yakuBoost: 'YAKU+',
    };

    const bgColor = typeColors[reward.type] || 0xd4a574;
    const cardBg = this.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, 0x1a0f08)
      .setStrokeStyle(3, bgColor);

    // Type label
    const typeLabel = this.add.text(0, -CARD_HEIGHT / 2 + 20, typeLabels[reward.type], {
      fontSize: '14px',
      color: '#d4a574',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Reward name
    const nameText = this.add.text(0, -CARD_HEIGHT / 2 + 60, this.wrapText(reward.name, 18), {
      fontSize: '16px',
      color: '#f5e6d3',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: CARD_WIDTH - 20 },
    }).setOrigin(0.5);

    // Description
    const descText = this.add.text(0, 0, this.wrapText(reward.description, 28), {
      fontSize: '12px',
      color: '#c9b89a',
      fontFamily: 'monospace',
      align: 'center',
      wordWrap: { width: CARD_WIDTH - 30 },
    }).setOrigin(0.5);

    // Decorative icon area (top)
    const icon = this.add.text(0, -CARD_HEIGHT / 2 + 100, this.getIconForType(reward.type), {
      fontSize: '40px',
      color: '#d4a574',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [cardBg, typeLabel, nameText, icon, descText]);
    container.setSize(CARD_WIDTH, CARD_HEIGHT);
    container.setInteractive({ useHandCursor: true });

    // Hover effects
    container.on('pointerover', () => {
      this.hoverIndex = index;
      container.setScale(1.05);
      cardBg.setStrokeStyle(4, 0xf5e6d3);
    });

    container.on('pointerout', () => {
      this.hoverIndex = -1;
      container.setScale(1);
      cardBg.setStrokeStyle(3, bgColor);
    });

    container.on('pointerdown', () => {
      this.selectReward(reward);
    });

    return container;
  }

  private createSkipButton(): void {
    const skipBg = this.add.rectangle(0, 0, 120, 36, 0x5c4033)
      .setStrokeStyle(2, 0x8b6f47);
    const skipText = this.add.text(0, 0, 'SKIP', {
      fontSize: '14px',
      color: '#f5e6d3',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    const container = this.add.container(512, 640, [skipBg, skipText])
      .setSize(120, 36)
      .setInteractive({ useHandCursor: true });

    container.on('pointerover', () => skipBg.setScale(1.05));
    container.on('pointerout', () => skipBg.setScale(1));
    container.on('pointerdown', () => {
      this.scene.resume('GameScene', { action: 'skip_reward' });
      this.scene.stop();
    });
  }

  private selectReward(reward: Reward): void {
    // Pass selected reward back to GameScene
    this.scene.resume('GameScene', { action: 'reward_selected', reward });
    this.scene.stop();
  }

  private wrapText(text: string, maxChars: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      if ((current + ' ' + word).length > maxChars) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) lines.push(current);
    return lines.join('\n');
  }

  private getIconForType(type: string): string {
    switch (type) {
      case 'relic': return '*';
      case 'customTile': return '[]';
      case 'yakuBoost': return '+';
      default: return '?';
    }
  }
}
