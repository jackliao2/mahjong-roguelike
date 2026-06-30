import Phaser from 'phaser';
import { Reward } from '@/roguelike/rewards';
import { RunState, MetaProgression } from '@/types';
import { buyReroll } from '@/roguelike/run';
import { loadMeta, saveMeta } from '@/data/storage';
import { SoundManager } from '@/render/sound';

const CARD_WIDTH = 200;
const CARD_HEIGHT = 280;
const CARD_SPACING = 30;

// Per-type palette: border, accent (top strip), glow, bg tint, label color
const TYPE_STYLE: Record<string, {
  border: number; accent: number; glow: number; bgTint: number; label: string;
}> = {
  relic:      { border: 0xd4a574, accent: 0xe5b567, glow: 0xd4a574, bgTint: 0x2a1d10, label: 'RELIC' },
  customTile: { border: 0xc73e3a, accent: 0xe55b56, glow: 0xc73e3a, bgTint: 0x2a1010, label: 'TILE' },
  yakuBoost:  { border: 0x2d6a4f, accent: 0x4ade80, glow: 0x2d6a4f, bgTint: 0x0f2418, label: 'YAKU+' },
};

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

    // ===== Wood-grain background (matches GameScene/GameOverScene) =====
    this.add.rectangle(0, 0, 1024, 720, 0x2b1810).setOrigin(0);
    for (let y = 0; y < 720; y += 4) {
      const alpha = 0.04 + Math.random() * 0.04;
      this.add.rectangle(0, y, 1024, 2, 0x5c3825, alpha).setOrigin(0);
    }
    // Dim overlay
    this.add.rectangle(0, 0, 1024, 720, 0x000000, 0.55).setOrigin(0);

    // ===== Decorative lanterns =====
    this.createLantern(60, 90);
    this.createLantern(964, 90);

    // ===== Title with pixel shadow + subtitle =====
    this.add.text(510, 76, 'CHOOSE YOUR REWARD', {
      fontSize: '26px', color: '#1a0e08', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.titleText = this.add.text(512, 74, 'CHOOSE YOUR REWARD', {
      fontSize: '26px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(512, 108, `Round ${data.runState.round} cleared — pick one bonus`, {
      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Currency display in a small framed box
    this.add.rectangle(512, 142, 320, 28, 0x1a0f08, 0.7)
      .setStrokeStyle(2, 0x5c3825);
    this.currencyText = this.add.text(512, 142, '', {
      fontSize: '14px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    // ===== Reward cards =====
    this.renderRewardCards();

    // ===== Buttons =====
    this.createSkipButton();
    this.createRerollButton();

    this.updateCurrencyDisplay();

    // Title entrance animation
    this.titleText.setScale(0.6);
    this.tweens.add({
      targets: this.titleText,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });
  }

  // ===== Decorative lantern (matches other scenes) =====
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

      // Staggered entrance: cards drop in from above
      card.setAlpha(0);
      card.setY(360 - 40);
      this.tweens.add({
        targets: card,
        alpha: 1,
        y: 360,
        duration: 350,
        delay: index * 100,
        ease: 'Back.easeOut',
      });
    });
  }

  private createRewardCard(x: number, y: number, reward: Reward, index: number): Phaser.GameObjects.Container {
    const style = TYPE_STYLE[reward.type] || TYPE_STYLE.relic;

    // Pixel shadow (offset)
    const shadow = this.add.rectangle(4, 4, CARD_WIDTH, CARD_HEIGHT, 0x000000, 0.5);
    // Card background with type tint
    const cardBg = this.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, style.bgTint)
      .setStrokeStyle(3, style.border);
    // Top accent strip (type color band)
    const topStrip = this.add.rectangle(0, -CARD_HEIGHT / 2 + 4, CARD_WIDTH - 6, 4, style.accent);
    // Bottom accent strip
    const bottomStrip = this.add.rectangle(0, CARD_HEIGHT / 2 - 4, CARD_WIDTH - 6, 2, style.border);
    // Corner sparkles (decorative, local coords)
    const sparkleL = this.add.rectangle(-CARD_WIDTH / 2 + 8, -CARD_HEIGHT / 2 + 12, 2, 2, style.accent);
    const sparkleR = this.add.rectangle(CARD_WIDTH / 2 - 8, -CARD_HEIGHT / 2 + 12, 2, 2, style.accent);

    // Type label (in the top accent band area)
    const typeLabel = this.add.text(0, -CARD_HEIGHT / 2 + 22, style.label, {
      fontSize: '15px', color: '#1a0e08', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Reward name
    const nameText = this.add.text(0, -CARD_HEIGHT / 2 + 58, this.wrapText(reward.name, 18), {
      fontSize: '17px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
      align: 'center', wordWrap: { width: CARD_WIDTH - 20 },
    }).setOrigin(0.5);

    // Decorative icon (drawn shape, type-specific)
    const iconGfx = this.createTypeIcon(reward.type, style.accent);

    // Description
    const descText = this.add.text(0, 60, this.wrapText(reward.description, 28), {
      fontSize: '13px', color: '#c9b89a', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: CARD_WIDTH - 24 },
    }).setOrigin(0.5);

    // Hover glow (hidden initially via gameobject alpha; local coords at container origin)
    const hoverGlow = this.add.rectangle(0, 0, CARD_WIDTH + 12, CARD_HEIGHT + 12, style.glow, 0.4)
      .setStrokeStyle(3, style.glow, 1)
      .setAlpha(0);

    const container = this.add.container(x, y, [
      hoverGlow, shadow, cardBg, topStrip, bottomStrip,
      sparkleL, sparkleR, typeLabel, nameText, iconGfx, descText,
    ]);
    container.setSize(CARD_WIDTH, CARD_HEIGHT);
    container.setInteractive({ useHandCursor: true });

    // Hover effects: lift + glow + scale
    container.on('pointerover', () => {
      this.hoverIndex = index;
      this.tweens.add({
        targets: container,
        scale: 1.06,
        y: y - 6,
        duration: 150,
        ease: 'Quad.easeOut',
      });
      this.tweens.add({
        targets: hoverGlow,
        alpha: 0.5,
        duration: 150,
      });
      cardBg.setStrokeStyle(4, 0xf5e6d3);
    });

    container.on('pointerout', () => {
      this.hoverIndex = -1;
      this.tweens.add({
        targets: container,
        scale: 1,
        y: y,
        duration: 150,
        ease: 'Quad.easeOut',
      });
      this.tweens.add({
        targets: hoverGlow,
        alpha: 0,
        duration: 150,
      });
      cardBg.setStrokeStyle(3, style.border);
    });

    container.on('pointerdown', () => {
      this.soundManager.playReward();
      // Click feedback: quick shrink-then-select
      this.tweens.add({
        targets: container,
        scale: 0.95,
        duration: 80,
        yoyo: true,
        onComplete: () => this.selectReward(reward),
      });
    });

    return container;
  }

  // ===== Draw a type-specific decorative icon (pixel art) =====
  private createTypeIcon(type: string, color: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    if (type === 'relic') {
      // Diamond / gem shape
      const cy = -10;
      g.fillRect(-2, cy - 14, 4, 4);
      g.fillRect(-6, cy - 10, 12, 4);
      g.fillRect(-10, cy - 6, 20, 4);
      g.fillRect(-6, cy - 2, 12, 4);
      g.fillRect(-2, cy + 2, 4, 4);
      // Sparkle
      g.fillRect(8, cy - 14, 2, 2);
      g.fillRect(-10, cy + 2, 2, 2);
    } else if (type === 'customTile') {
      // Mini tile outline with corner star
      g.lineStyle(2, color, 1);
      g.strokeRect(-12, -22, 24, 30);
      g.fillStyle(color, 0.3);
      g.fillRect(-12, -22, 24, 30);
      g.fillStyle(color, 1);
      // Star in middle
      g.fillRect(-1, -12, 2, 6);
      g.fillRect(-3, -10, 6, 2);
      g.fillRect(6, -18, 2, 2);
    } else if (type === 'yakuBoost') {
      // Plus sign in a circle
      g.lineStyle(2, color, 1);
      g.strokeCircle(0, -8, 14);
      g.fillRect(-1, -14, 2, 12);
      g.fillRect(-6, -9, 12, 2);
    }
    return g;
  }

  private createSkipButton(): void {
    const width = 140;
    const height = 40;
    const x = 412;
    const y = 640;
    const shadow = this.add.rectangle(3, 3, width, height, 0x000000, 0.5);
    const bg = this.add.rectangle(0, 0, width, height, 0x5c4033)
      .setStrokeStyle(2, 0x8b6f47);
    const highlightStrip = this.add.rectangle(0, -height / 2 + 3, width - 6, 2, 0xffffff, 0.3);
    const skipText = this.add.text(0, 0, 'SKIP', {
      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [shadow, bg, highlightStrip, skipText])
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

    const width = 220;
    const height = 40;
    const x = 612;
    const y = 640;

    const shadow = this.add.rectangle(3, 3, width, height, 0x000000, 0.5);
    const bg = this.add.rectangle(0, 0, width, height, canAfford ? 0x2d6a4f : 0x3a3a3a)
      .setStrokeStyle(2, canAfford ? 0x4ade80 : 0x666666);
    const highlightStrip = this.add.rectangle(0, -height / 2 + 3, width - 6, 2, 0xffffff, 0.3);
    const label = canFreeReroll ? 'REROLL (FREE)' : `REROLL (${cost})`;
    const textColor = canAfford ? '#f5e6d3' : '#888888';
    const txt = this.add.text(0, 0, label, {
      fontSize: '15px', color: textColor, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [shadow, bg, highlightStrip, txt])
      .setSize(width, height);

    if (canAfford) {
      container.setInteractive({ useHandCursor: true });
      container.on('pointerover', () => {
        container.setScale(1.05);
        container.setY(y - 2);
      });
      container.on('pointerout', () => {
        container.setScale(1);
        container.setY(y);
      });
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
    this.currencyText.setText(`CURRENCY: ${this.meta.currency}${freeText}`);
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
}
