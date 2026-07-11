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

  create(data?: { difficulty?: Difficulty }): void {
    this.difficulty = data?.difficulty || this.difficulty;
    this.cameras.main.setBackgroundColor('#1a1008');
    this.soundManager = new SoundManager(this);

    // Background
    this.add.rectangle(0, 0, 1024, 720, 0x1a1008).setOrigin(0);

    // Load meta
    this.meta = JSON.parse(localStorage.getItem('mjrg_meta') || '{}');
    if (!this.meta.unlockedDecks) this.meta.unlockedDecks = ['default'];

    // Title
    this.add.text(512, 80, 'MAHJONG QUIZ', {
      fontSize: '28px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(512, 118, 'Test your tile reading skills', {
      fontSize: '14px', color: '#8b7a67', fontFamily: '"Nunito", sans-serif',
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
      { id: 'beginner', label: 'BEGINNER', desc: 'Learn or play\n5 guided lessons + 8 question run\nNo Risk meter in lessons', locked: false, recommended: !beginnerDone },
      { id: 'normal', label: 'NORMAL', desc: beginnerDone ? '12 questions · 1 life\nCh.1-4: win / yaku / defense\nOpponent Risk active' : 'Complete Beginner\nto unlock', locked: !beginnerDone, recommended: beginnerDone && !normalDone },
      { id: 'endless', label: 'ENDLESS', desc: normalDone ? 'Infinite chapters\nDifficulty ramps up\nHow far can you go?' : 'Complete Normal\nto unlock', locked: !normalDone, recommended: false },
    ];

    const cardW = 290;
    const cardH = 310;
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
    const bgColor = opt.locked ? 0x1a0f08 : (isSelected ? 0x281a10 : 0x1f140c);
    const borderColor = isSelected ? 0xc73e3a : (opt.locked ? 0x2a2018 : 0x4a3828);
    const bg = this.add.rectangle(0, 0, w, h, bgColor).setStrokeStyle(2, borderColor);
    elements.push(bg);

    if (opt.recommended) {
      const badge = this.add.text(0, -h / 2 + 28, '★', {
        fontSize: '16px', color: '#c73e3a', fontFamily: '"Nunito", sans-serif',
      }).setOrigin(0.5);
      elements.push(badge);
    }

    const nameColor = opt.locked ? '#3a2f26' : '#f5e6d3';
    const nameY = opt.recommended ? -h / 2 + 56 : -h / 2 + 44;
    const name = this.add.text(0, nameY, opt.label, {
      fontSize: '22px', color: nameColor, fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    elements.push(name);

    if (opt.locked) {
      const lockIcon = this.add.text(0, nameY + 36, 'LOCKED', {
        fontSize: '12px', color: '#3a2f26', fontFamily: '"Nunito", sans-serif',
      }).setOrigin(0.5);
      elements.push(lockIcon);
    }

    const descColor = opt.locked ? '#3a2f26' : '#7a6855';
    const desc = this.add.text(0, 36, opt.desc, {
      fontSize: '12px', color: descColor, fontFamily: '"Nunito", sans-serif',
      align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
    elements.push(desc);

    const statusText = opt.locked ? '' : (isSelected ? 'SELECTED' : '');
    if (statusText) {
      const status = this.add.text(0, h / 2 - 24, statusText, {
        fontSize: '12px', color: '#c73e3a',
        fontFamily: '"Nunito", sans-serif',
      }).setOrigin(0.5);
      elements.push(status);
    }

    const card = this.add.container(x, y, elements).setSize(w, h);
    if (isSelected) card.setScale(1.02);

    if (!opt.locked) {
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => { if (this.difficulty !== opt.id) this.tweens.add({ targets: card, scale: 1.02, duration: 100 }); });
      card.on('pointerout', () => { if (this.difficulty !== opt.id) this.tweens.add({ targets: card, scale: 1, duration: 100 }); });
      card.on('pointerdown', () => {
        this.soundManager.playClick();
        this.difficulty = opt.id;
        this.scene.restart({ difficulty: opt.id });
      });
    }
  }

  private createBottomButtons(): void {
    const y = 640;

    if (this.difficulty === 'beginner') {
      this.createActionButton(610, y, 190, 48, 'LEARN GUIDE', 0x2d6a4f, 0x4a9e4a, () => {
        this.scene.start('GameScene', {
          action: 'new_run',
          difficulty: 'beginner',
          teaching: true,
        });
      });
      this.createActionButton(820, y, 190, 48, 'START RUN', 0xc73e3a, 0xd44a46, () => {
        this.scene.start('GameScene', {
          action: 'new_run',
          difficulty: 'beginner',
        });
      });
    } else {
      const isEndless = this.difficulty === 'endless';
      this.createActionButton(760, y, 220, 48, isEndless ? 'START ENDLESS' : 'START NORMAL', 0xc73e3a, 0xd44a46, () => {
        this.scene.start('GameScene', {
          action: 'new_run',
          difficulty: isEndless ? 'normal' : this.difficulty,
          endless: isEndless,
        });
      });
    }

    // HOME (left)
    const homeW = 120;
    const homeH = 40;
    const homeX = 140;
    const homeBg = this.add.rectangle(homeX, y, homeW, homeH, 0x281a10).setStrokeStyle(1, 0x6a5845);
    const homeText = this.add.text(homeX, y, 'HOME', {
      fontSize: '12px', color: '#8b7a67', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5);
    const homeHit = this.add.rectangle(homeX, y, homeW, homeH, 0xffffff, 0).setInteractive({ useHandCursor: true });
    homeHit.on('pointerover', () => { homeBg.setFillStyle(0x2f2214); });
    homeHit.on('pointerout', () => { homeBg.setFillStyle(0x281a10); });
    homeHit.on('pointerdown', () => {
      this.soundManager.playClick();
      window.location.href = '/';
    });
  }

  private createActionButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    color: number,
    hoverColor: number,
    onClick: () => void,
  ): void {
    const bg = this.add.rectangle(x, y, w, h, color).setStrokeStyle(1, 0x2b1810);
    const text = this.add.text(x, y, label, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    const hit = this.add.rectangle(x, y, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      bg.setFillStyle(hoverColor);
      text.setScale(1.03);
    });
    hit.on('pointerout', () => {
      bg.setFillStyle(color);
      text.setScale(1);
    });
    hit.on('pointerdown', () => {
      this.soundManager.playClick();
      onClick();
    });
  }
}
