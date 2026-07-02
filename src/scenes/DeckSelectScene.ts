import Phaser from 'phaser';
import { MetaProgression } from '@/types';
import { SoundManager } from '@/render/sound';
import { GameConfig } from '@/config/game-config';

type Difficulty = 'beginner' | 'normal' | 'endless';

export class DeckSelectScene extends Phaser.Scene {
  private meta!: MetaProgression;
  private difficulty: Difficulty = 'beginner';
  private soundManager!: SoundManager;

  constructor() {
    super('DeckSelectScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    this.soundManager = new SoundManager(this);

    // Background
    this.add.rectangle(0, 0, 1024, 720, 0x2b1810).setOrigin(0);
    for (let y = 0; y < 720; y += 4) {
      const alpha = 0.04 + Math.random() * 0.04;
      this.add.rectangle(0, y, 1024, 2, 0x5c3825, alpha).setOrigin(0);
    }
    this.add.rectangle(0, 0, 1024, 720, 0x000000, 0.4).setOrigin(0);

    // Decorative lanterns
    this.createLantern(60, 90);
    this.createLantern(964, 90);

    // Load meta
    this.meta = JSON.parse(localStorage.getItem('mjrg_meta') || '{}');
    if (!this.meta.unlockedDecks) this.meta.unlockedDecks = ['default'];

    // Title
    this.add.text(512, 70, 'MAHJONG QUIZ', {
      fontSize: '32px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(512, 108, 'Test your tile reading skills', {
      fontSize: '16px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Difficulty cards
    this.renderDifficultyCards();

    // Bottom buttons: START + HOME
    this.createBottomButtons();
  }

  private renderDifficultyCards(): void {
    const beginnerDone = localStorage.getItem(GameConfig.beginner.completedKey) === '1';
    const normalDone = localStorage.getItem('mjrg_normal_done') === '1';
    const y = 320;

    const options: { id: Difficulty; label: string; desc: string; locked: boolean; recommended: boolean }[] = [
      { id: 'beginner', label: 'BEGINNER', desc: '8 questions · 2 lives\nChapters 1-3 (tenpai→tanyao→pinfu)\nBoss questions · Relics · Safe/Risky paths', locked: false, recommended: !beginnerDone },
      { id: 'normal', label: 'NORMAL', desc: beginnerDone ? '12 questions · 1 life\nFull 4-chapter course\nCombo bonuses + timed questions' : 'Complete Beginner\nto unlock', locked: !beginnerDone, recommended: beginnerDone && !normalDone },
      { id: 'endless', label: 'ENDLESS', desc: normalDone ? 'Infinite chapters\nDifficulty ramps up\nHow far can you go?' : 'Complete Normal\nto unlock', locked: !normalDone, recommended: false },
    ];

    const cardW = 290;
    const cardH = 290;
    const gap = 24;
    const startX = 512 - (options.length * cardW + (options.length - 1) * gap) / 2 + cardW / 2;

    options.forEach((opt, i) => {
      const x = startX + i * (cardW + gap);
      const isSelected = this.difficulty === opt.id;
      this.createDifficultyCard(x, y, cardW, cardH, opt, isSelected);
    });
  }

  private createDifficultyCard(
    x: number, y: number, w: number, h: number,
    opt: { id: Difficulty; label: string; desc: string; locked: boolean; recommended: boolean },
    isSelected: boolean,
  ): void {
    const elements: Phaser.GameObjects.GameObject[] = [];
    const shadow = this.add.rectangle(4, 4, w, h, 0x000000, 0.5);
    const bgColor = opt.locked ? 0x1a0f08 : (isSelected ? 0x3d2418 : 0x2a1d10);
    const borderColor = isSelected ? 0xc73e3a : (opt.locked ? 0x5c3825 : 0xd4a574);
    const bg = this.add.rectangle(0, 0, w, h, bgColor).setStrokeStyle(isSelected ? 5 : 3, borderColor);
    const topAccent = this.add.rectangle(0, -h / 2 + 4, w - 10, 4, isSelected ? 0xc73e3a : 0xe5b567);
    elements.push(shadow, bg, topAccent);

    if (opt.recommended) {
      const badge = this.add.text(0, -h / 2 + 32, '★ RECOMMENDED', {
        fontSize: '12px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      elements.push(badge);
    }

    const nameColor = opt.locked ? '#5c3825' : '#f5e6d3';
    const nameY = opt.recommended ? -h / 2 + 64 : -h / 2 + 50;
    const name = this.add.text(0, nameY, opt.label, {
      fontSize: '26px', color: nameColor, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    elements.push(name);

    if (opt.locked) {
      const lockIcon = this.add.text(0, nameY + 40, '[ LOCKED ]', {
        fontSize: '14px', color: '#5c3825', fontFamily: 'monospace',
      }).setOrigin(0.5);
      elements.push(lockIcon);
    }

    const descColor = opt.locked ? '#5c3825' : '#c9b89a';
    const desc = this.add.text(0, 30, opt.desc, {
      fontSize: '15px', color: descColor, fontFamily: 'monospace',
      align: 'center', lineSpacing: 8,
    }).setOrigin(0.5);
    elements.push(desc);

    const statusText = opt.locked ? '' : (isSelected ? '✓ SELECTED' : 'CLICK TO SELECT');
    if (statusText) {
      const status = this.add.text(0, h / 2 - 30, statusText, {
        fontSize: '14px', color: isSelected ? '#c73e3a' : '#c9b89a',
        fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      elements.push(status);
    }

    const card = this.add.container(x, y, elements).setSize(w, h);
    if (isSelected) card.setScale(1.05);

    if (!opt.locked) {
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => { if (this.difficulty !== opt.id) this.tweens.add({ targets: card, scale: 1.04, y: y - 4, duration: 120 }); });
      card.on('pointerout', () => { if (this.difficulty !== opt.id) this.tweens.add({ targets: card, scale: 1, y: y, duration: 120 }); });
      card.on('pointerdown', () => {
        this.soundManager.playClick();
        this.difficulty = opt.id;
        this.scene.restart();
      });
    }
  }

  private createBottomButtons(): void {
    const y = 640;

    // START QUIZ (large, right)
    const startW = 240;
    const startH = 52;
    const startX = 760;
    const startShadow = this.add.rectangle(startX + 4, y + 4, startW, startH, 0x000000, 0.5);
    const startBg = this.add.rectangle(startX, y, startW, startH, 0xc73e3a).setStrokeStyle(3, 0x2b1810);
    const startHighlight = this.add.rectangle(startX, y - startH / 2 + 3, startW - 6, 2, 0xffffff, 0.4);
    const startText = this.add.text(startX, y, 'START QUIZ ▶', {
      fontSize: '17px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    const startHit = this.add.rectangle(startX, y, startW, startH, 0xffffff, 0).setInteractive({ useHandCursor: true });
    startHit.on('pointerover', () => { startBg.setFillStyle(0xe04e4a); startHit.setScale(1.05); });
    startHit.on('pointerout', () => { startBg.setFillStyle(0xc73e3a); startHit.setScale(1); });
    startHit.on('pointerdown', () => {
      this.soundManager.playClick();
      const isEndless = this.difficulty === 'endless';
      const isBeginner = this.difficulty === 'beginner';
      const isFirstTime = localStorage.getItem(GameConfig.beginner.tutorialSeenKey) !== '1';

      if (isBeginner && isFirstTime) {
        localStorage.setItem(GameConfig.beginner.tutorialSeenKey, '1');
        this.scene.start('GameScene', {
          action: 'new_run',
          difficulty: 'beginner',
          tutorial: true,
        });
      } else {
        this.scene.start('GameScene', {
          action: 'new_run',
          difficulty: isEndless ? 'normal' : this.difficulty,
          endless: isEndless,
        });
      }
    });

    // HOME (left)
    const homeW = 140;
    const homeH = 44;
    const homeX = 140;
    const homeShadow = this.add.rectangle(homeX + 4, y + 4, homeW, homeH, 0x000000, 0.5);
    const homeBg = this.add.rectangle(homeX, y, homeW, homeH, 0xd4a574).setStrokeStyle(3, 0x2b1810);
    const homeHighlight = this.add.rectangle(homeX, y - homeH / 2 + 3, homeW - 6, 2, 0xffffff, 0.4);
    const homeText = this.add.text(homeX, y, '◀ HOME', {
      fontSize: '14px', color: '#2b1810', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    const homeHit = this.add.rectangle(homeX, y, homeW, homeH, 0xffffff, 0).setInteractive({ useHandCursor: true });
    homeHit.on('pointerover', () => { homeBg.setFillStyle(0xe8c088); homeHit.setScale(1.05); });
    homeHit.on('pointerout', () => { homeBg.setFillStyle(0xd4a574); homeHit.setScale(1); });
    homeHit.on('pointerdown', () => {
      this.soundManager.playClick();
      window.location.href = '/';
    });
  }

  private createLantern(x: number, y: number): void {
    const rope = this.add.rectangle(x, y - 40, 2, 40, 0x8b6f47);
    const lantern = this.add.ellipse(x, y, 28, 36, 0xc73e3a).setStrokeStyle(2, 0x9b2b28);
    const glow = this.add.ellipse(x, y, 50, 50, 0xc73e3a, 0.15);
    this.add.rectangle(x, y - 18, 16, 4, 0x2b1810);
    this.add.rectangle(x, y + 18, 12, 3, 0xe5b567);
    this.tweens.add({
      targets: [rope, lantern, glow], angle: 3, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }
}
