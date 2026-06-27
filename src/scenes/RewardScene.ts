import Phaser from 'phaser';
import { Reward } from '@/roguelike/rewards';
import { RunState, MetaProgression } from '@/types';
import { buyReroll } from '@/roguelike/run';
import { loadMeta, saveMeta } from '@/data/storage';
import { SoundManager } from '@/render/sound';

const CARD_WIDTH = 200;
const CARD_HEIGHT = 280;
const CARD_SPACING = 30;

export class RewardScene extends Phaser.Scene {
  private runState!: RunState;
  private meta!: MetaProgression;
  private currentRewards: Reward[] = [];
  private rewardCards: Phaser.GameObjects.Container[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private currencyText!: Phaser.GameObjects.Text;
  private rerollButton: Phaser.GameObjects.Container | null = null;
  private hoverIndex: number = -1;
  private soundManager!: SoundManager;

  constructor() {
    super('RewardScene');
  }

  create(data: { runState: RunState; rewards: Reward[] }): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    this.runState = data.runState;
    this.meta = loadMeta();
    this.currentRewards = data.rewards;
    this.rewardCards = [];
    this.soundManager = new SoundManager(this);

    // Dim background
    this.add.rectangle(0, 0, 1024, 720, 0x000000, 0.7).setOrigin(0);

    // Title
    this.titleText = this.add.text(512, 80, 'CHOOSE YOUR REWARD', {
      fontSize: '28px',
      color: '#d4a574',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(512, 115, `Round ${data.runState.round} cleared! Pick one bonus.`, {
      fontSize: '16px',
      color: '#f5e6d3',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Currency display
    this.currencyText = this.add.text(512, 145, '', {
      fontSize: '13px',
      color: '#e5b567',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Create 3 reward cards
    this.renderRewardCards();

    // Skip button
    this.createSkipButton();

    // Reroll button
    this.createRerollButton();

    this.updateCurrencyDisplay();
  }

  private renderRewardCards(): void {
    // Destroy old cards
    this.rewardCards.forEach(c => c.destroy());
    this.rewardCards = [];

    const totalWidth = 3 * CARD_WIDTH + 2 * CARD_SPACING;
    const startX = 512 - totalWidth / 2;

    this.currentRewards.forEach((reward, index) => {
      const x = startX + index * (CARD_WIDTH + CARD_SPACING) + CARD_WIDTH / 2;
      const card = this.createRewardCard(x, 360, reward, index);
      this.rewardCards.push(card);
    });
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
      this.soundManager.playReward();
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

    const container = this.add.container(412, 640, [skipBg, skipText])
      .setSize(120, 36)
      .setInteractive({ useHandCursor: true });

    container.on('pointerover', () => skipBg.setScale(1.05));
    container.on('pointerout', () => skipBg.setScale(1));
    container.on('pointerdown', () => {
      this.soundManager.playClick();
      this.scene.resume('GameScene', { action: 'skip_reward' });
      this.scene.stop();
    });
  }

  private createRerollButton(): void {
    if (this.rerollButton) {
      this.rerollButton.destroy();
      this.rerollButton = null;
    }

    const canFreeReroll = this.runState.rerollTokens > 0;
    const cost = canFreeReroll ? 0 : 50;
    const canAfford = canFreeReroll || this.meta.currency >= cost;

    const bg = this.add.rectangle(0, 0, 200, 36, canAfford ? 0x2d6a4f : 0x3a3a3a)
      .setStrokeStyle(2, canAfford ? 0x4ade80 : 0x666666);
    const label = canFreeReroll ? 'REROLL (FREE)' : `REROLL (${cost})`;
    const textColor = canAfford ? '#f5e6d3' : '#888888';
    const txt = this.add.text(0, 0, label, {
      fontSize: '13px',
      color: textColor,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const container = this.add.container(612, 640, [bg, txt])
      .setSize(200, 36);

    if (canAfford) {
      container.setInteractive({ useHandCursor: true });
      container.on('pointerover', () => bg.setScale(1.05));
      container.on('pointerout', () => bg.setScale(1));
      container.on('pointerdown', () => this.doReroll());
    }

    this.rerollButton = container;
  }

  private doReroll(): void {
    const result = buyReroll(this.meta, this.runState);
    if (!result.success) return;

    this.meta = result.meta;
    this.runState = result.run;
    saveMeta(this.meta);

    // Generate new rewards, excluding currently shown ones to avoid duplicates
    const excludeIds = this.currentRewards.map(r => {
      const d = r.data as { id?: string };
      return d?.id || '';
    }).filter(Boolean);

    // Reuse the rewards generator via GameScene by asking it to regenerate
    this.soundManager.playClick();
    this.scene.resume('GameScene', {
      action: 'reroll_rewards',
      excludeIds,
      runState: this.runState,
    });
    // GameScene will relaunch us with new rewards
    this.scene.stop();
  }

  private updateCurrencyDisplay(): void {
    const freeText = this.runState.rerollTokens > 0
      ? `  |  Free rerolls: ${this.runState.rerollTokens}`
      : '';
    this.currencyText.setText(`Currency: ${this.meta.currency}${freeText}`);
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
