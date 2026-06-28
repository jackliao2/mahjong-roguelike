import Phaser from 'phaser';
import { MetaProgression } from '@/types';
import { StartingDeck, getUnlockedDecks, STARTING_DECKS } from '@/roguelike/meta';
import { getRelicById } from '@/roguelike/relics';
import { SoundManager } from '@/render/sound';
import { GameConfig } from '@/config/game-config';

const CARD_W = 220;
const CARD_H = 300;
const CARD_SPACING = 24;

type Difficulty = 'beginner' | 'normal';

export class DeckSelectScene extends Phaser.Scene {
  private meta!: MetaProgression;
  private selectedDeckId: string = 'default';
  private difficulty: Difficulty = 'normal';
  private soundManager!: SoundManager;

  constructor() {
    super('DeckSelectScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    this.soundManager = new SoundManager(this);

    // ===== Wood-grain background =====
    this.add.rectangle(0, 0, 1024, 720, 0x2b1810).setOrigin(0);
    for (let y = 0; y < 720; y += 4) {
      const alpha = 0.04 + Math.random() * 0.04;
      this.add.rectangle(0, y, 1024, 2, 0x5c3825, alpha).setOrigin(0);
    }
    // Dim overlay
    this.add.rectangle(0, 0, 1024, 720, 0x000000, 0.4).setOrigin(0);

    // ===== Decorative lanterns =====
    this.createLantern(60, 90);
    this.createLantern(964, 90);

    // ===== Title =====
    this.add.text(510, 76, 'CHOOSE YOUR DECK', {
      fontSize: '28px', color: '#1a0e08', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    const titleText = this.add.text(512, 74, 'CHOOSE YOUR DECK', {
      fontSize: '28px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(512, 110, 'Each deck offers a different starting relic build', {
      fontSize: '13px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Title entrance animation
    titleText.setScale(0.6);
    this.tweens.add({
      targets: titleText,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });

    // ===== Difficulty selector =====
    this.createDifficultySelector();

    // Load meta progression
    this.meta = JSON.parse(localStorage.getItem('mjrg_meta') || '{}');
    if (!this.meta.unlockedDecks) this.meta.unlockedDecks = ['default'];

    // ===== Render deck cards =====
    this.renderDeckCards();

    // ===== Buttons =====
    this.createStartButton();
    this.createBackButton();
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

  private renderDeckCards(): void {
    const unlockedDecks = getUnlockedDecks(this.meta);
    const unlockedIds = new Set(unlockedDecks.map(d => d.id));

    const totalWidth = STARTING_DECKS.length * CARD_W + (STARTING_DECKS.length - 1) * CARD_SPACING;
    const startX = 512 - totalWidth / 2;
    const cardY = 360;

    STARTING_DECKS.forEach((deck, index) => {
      const x = startX + index * (CARD_W + CARD_SPACING) + CARD_W / 2;
      const isUnlocked = unlockedIds.has(deck.id);
      const isDefault = deck.id === this.selectedDeckId;
      this.createDeckCard(x, cardY, deck, isUnlocked, isDefault, index);
    });
  }

  private createDeckCard(
    x: number, y: number, deck: StartingDeck,
    isUnlocked: boolean, isDefault: boolean, index: number
  ): void {
    // Pixel shadow
    const shadow = this.add.rectangle(4, 4, CARD_W, CARD_H, 0x000000, 0.5);
    // Card bg
    const borderColor = isDefault ? 0xe5b567 : (isUnlocked ? 0xd4a574 : 0x5c3825);
    const bgTint = isUnlocked ? 0x2a1d10 : 0x1a0f08;
    const cardBg = this.add.rectangle(0, 0, CARD_W, CARD_H, bgTint)
      .setStrokeStyle(isDefault ? 4 : 3, borderColor);
    // Top accent strip
    const accentColor = isUnlocked ? 0xe5b567 : 0x5c3825;
    const topStrip = this.add.rectangle(0, -CARD_H / 2 + 4, CARD_W - 6, 4, accentColor);
    // Bottom accent strip
    const bottomStrip = this.add.rectangle(0, CARD_H / 2 - 4, CARD_W - 6, 2, borderColor);
    // Corner sparkles
    const sparkleL = this.add.rectangle(-CARD_W / 2 + 8, -CARD_H / 2 + 12, 2, 2, accentColor);
    const sparkleR = this.add.rectangle(CARD_W / 2 - 8, -CARD_H / 2 + 12, 2, 2, accentColor);

    // Deck name
    const nameColor = isUnlocked ? '#f5e6d3' : '#5c3825';
    const nameText = this.add.text(0, -CARD_H / 2 + 32, deck.name, {
      fontSize: '16px', color: nameColor, fontFamily: 'monospace', fontStyle: 'bold',
      align: 'center', wordWrap: { width: CARD_W - 20 },
    }).setOrigin(0.5);

    // Deck icon (gem shape)
    this.createDeckIcon(0, -CARD_H / 2 + 80, accentColor, isUnlocked);

    // Description
    const descColor = isUnlocked ? '#c9b89a' : '#5c3825';
    const descText = this.add.text(0, -10, this.wrapText(deck.description, 28), {
      fontSize: '11px', color: descColor, fontFamily: 'monospace',
      align: 'center', wordWrap: { width: CARD_W - 24 },
    }).setOrigin(0.5);

    // Starting relics label
    let relicsSection: Phaser.GameObjects.Text;
    if (deck.startingRelics.length > 0) {
      const relicNames = deck.startingRelics
        .map(id => getRelicById(id)?.name || id)
        .join('\n');
      relicsSection = this.add.text(0, 60, `STARTING RELIC:\n${relicNames}`, {
        fontSize: '10px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
        align: 'center', wordWrap: { width: CARD_W - 24 },
      }).setOrigin(0.5);
    } else {
      relicsSection = this.add.text(0, 60, 'No starting relic\n(pure skill build)', {
        fontSize: '10px', color: '#8b6f47', fontFamily: 'monospace',
        align: 'center',
      }).setOrigin(0.5);
    }

    // Unlock status / lock icon
    const statusText = isUnlocked
      ? (isDefault ? '> SELECTED <' : 'CLICK TO SELECT')
      : `LOCKED\n${deck.unlockCondition}`;
    const statusColor = isUnlocked
      ? (isDefault ? '#e5b567' : '#c9b89a')
      : '#5c3825';
    const status = this.add.text(0, CARD_H / 2 - 22, statusText, {
      fontSize: '10px', color: statusColor, fontFamily: 'monospace', fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [
      shadow, cardBg, topStrip, bottomStrip, sparkleL, sparkleR,
      nameText, descText, relicsSection, status,
    ]);
    container.setSize(CARD_W, CARD_H);

    if (isUnlocked) {
      container.setInteractive({ useHandCursor: true });
      // Hover lift
      container.on('pointerover', () => {
        if (deck.id !== this.selectedDeckId) {
          this.tweens.add({ targets: container, scale: 1.04, y: y - 4, duration: 120 });
        }
      });
      container.on('pointerout', () => {
        if (deck.id !== this.selectedDeckId) {
          this.tweens.add({ targets: container, scale: 1, y: y, duration: 120 });
        }
      });
      container.on('pointerdown', () => {
        this.soundManager.playClick();
        this.selectedDeckId = deck.id;
        // Re-render cards to update selected highlight
        this.children.removeAll();
        this.create();
      });
    }

    // Staggered entrance
    container.setAlpha(0);
    container.setY(y - 30);
    this.tweens.add({
      targets: container,
      alpha: 1,
      y: y,
      duration: 350,
      delay: index * 80,
      ease: 'Back.easeOut',
    });
  }

  // ===== Deck icon (gem shape) =====
  private createDeckIcon(x: number, y: number, color: number, isUnlocked: boolean): void {
    const g = this.add.graphics();
    g.fillStyle(color, isUnlocked ? 1 : 0.4);
    // Diamond/gem shape
    g.fillRect(x - 2, y - 14, 4, 4);
    g.fillRect(x - 6, y - 10, 12, 4);
    g.fillRect(x - 10, y - 6, 20, 4);
    g.fillRect(x - 6, y - 2, 12, 4);
    g.fillRect(x - 2, y + 2, 4, 4);
    // Sparkle dots
    g.fillRect(x + 8, y - 14, 2, 2);
    g.fillRect(x - 10, y + 2, 2, 2);
  }

  // ===== Difficulty selector toggle =====
  private createDifficultySelector(): void {
    const beginnerDone = localStorage.getItem(GameConfig.beginner.completedKey) === '1';
    const centerX = 512;
    const y = 140;

    // Label
    this.add.text(centerX, y - 8, 'DIFFICULTY', {
      fontSize: '10px', color: '#8b6f47', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Beginner button
    const btnW = 140;
    const btnH = 32;
    const gap = 8;
    const beginnerX = centerX - btnW / 2 - gap / 2;
    const normalX = centerX + btnW / 2 + gap / 2 + 1;

    this.createDiffButton(beginnerX, y + 16, 'BEGINNER', 'beginner',
      '3 rounds · 4 yaku\nEasier targets');
    this.createDiffButton(normalX, y + 16, 'NORMAL', 'normal',
      beginnerDone ? '5 rounds · all yaku\nStandard difficulty' : 'Complete Beginner\nmode to unlock');

    // Show "recommended" hint for new players
    if (!beginnerDone) {
      this.add.text(centerX, y + 44, '(Recommended for new players)', {
        fontSize: '9px', color: '#e5b567', fontFamily: 'monospace',
      }).setOrigin(0.5);
    }

    this.difficulty = 'normal';
  }

  private createDiffButton(x: number, y: number, label: string, diff: Difficulty, desc: string): void {
    const beginnerDone = localStorage.getItem(GameConfig.beginner.completedKey) === '1';
    const isNormal = diff === 'normal';
    const locked = isNormal && !beginnerDone;
    const selected = this.difficulty === diff;

    const bgColor = selected ? 0xc73e3a : (locked ? 0x1a0f08 : 0x2b1810);
    const borderColor = selected ? 0xe5b567 : (locked ? 0x5c3825 : 0xd4a574);
    const textColor = locked ? '#5c3825' : (selected ? '#f5e6d3' : '#d4a574');

    const lockIcon = locked ? '[ ] ' : '';
    const bg = this.add.rectangle(0, 0, 140, 32, bgColor)
      .setStrokeStyle(selected ? 3 : 2, borderColor);
    const txt = this.add.text(0, 0, lockIcon + label, {
      fontSize: '12px', color: textColor, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, txt])
      .setSize(140, 32);

    if (!locked) {
      container.setInteractive({ useHandCursor: true });
      container.on('pointerover', () => container.setScale(1.05));
      container.on('pointerout', () => container.setScale(1));
      container.on('pointerdown', () => {
        this.soundManager.playClick();
        this.difficulty = diff;
        // Re-render to update selection
        this.children.removeAll();
        this.create();
      });
    }
  }

  private createStartButton(): void {
    const x = 624;
    const y = 640;
    const width = 200;
    const height = 48;
    const shadow = this.add.rectangle(4, 4, width, height, 0x000000, 0.5);
    const bg = this.add.rectangle(0, 0, width, height, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810);
    const highlightStrip = this.add.rectangle(0, -height / 2 + 3, width - 6, 2, 0xffffff, 0.4);
    const text = this.add.text(0, 0, 'START RUN', {
      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
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
      this.soundManager.playClick();
      this.scene.start('GameScene', { action: 'new_run', deckId: this.selectedDeckId, difficulty: this.difficulty });
    });
  }

  private createBackButton(): void {
    const x = 400;
    const y = 640;
    const width = 160;
    const height = 48;
    const shadow = this.add.rectangle(4, 4, width, height, 0x000000, 0.5);
    const bg = this.add.rectangle(0, 0, width, height, 0xd4a574)
      .setStrokeStyle(3, 0x2b1810);
    const highlightStrip = this.add.rectangle(0, -height / 2 + 3, width - 6, 2, 0xffffff, 0.4);
    const text = this.add.text(0, 0, 'BACK', {
      fontSize: '14px', color: '#2b1810', fontFamily: 'monospace', fontStyle: 'bold',
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
      this.soundManager.playClick();
      window.location.href = '/';
    });
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
