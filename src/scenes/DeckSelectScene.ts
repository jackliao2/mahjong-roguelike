import Phaser from 'phaser';
import { MetaProgression } from '@/types';
import { StartingDeck, getUnlockedDecks, STARTING_DECKS } from '@/roguelike/meta';
import { SoundManager } from '@/render/sound';
import { GameConfig } from '@/config/game-config';

type Difficulty = 'beginner' | 'normal';
type PressureMode = 'off' | 'moves';

// 分步向导：一次只显示一个选择，避免元素堆叠拥挤
type WizardStep = 'difficulty' | 'pressure' | 'deck';

const CARD_W = 180;
const CARD_H = 300;
const CARD_SPACING = 20;

export class DeckSelectScene extends Phaser.Scene {
  private meta!: MetaProgression;
  private selectedDeckId: string = 'default';
  private difficulty: Difficulty = 'beginner';
  private pressureMode: PressureMode = 'off';
  private soundManager!: SoundManager;
  private currentStep: WizardStep = 'difficulty';
  private stepContainer!: Phaser.GameObjects.Container;

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
    this.add.rectangle(0, 0, 1024, 720, 0x000000, 0.4).setOrigin(0);

    // ===== Decorative lanterns =====
    this.createLantern(60, 90);
    this.createLantern(964, 90);

    // Load meta progression
    this.meta = JSON.parse(localStorage.getItem('mjrg_meta') || '{}');
    if (!this.meta.unlockedDecks) this.meta.unlockedDecks = ['default'];

    // Step container holds all step-specific UI; rebuilt when step changes
    this.stepContainer = this.add.container(0, 0);
    this.renderStep();
  }

  // ===== Render the current wizard step =====
  private renderStep(): void {
    this.stepContainer.removeAll(true);

    // Title + step indicator
    const titles: Record<WizardStep, string> = {
      difficulty: 'STEP 1: CHOOSE DIFFICULTY',
      pressure: 'STEP 2: PRESSURE MODE',
      deck: 'STEP 3: CHOOSE A DECK',
    };
    const subtitles: Record<WizardStep, string> = {
      difficulty: 'How hard do you want the challenge?',
      pressure: 'Add a move limit for bonus points?',
      deck: 'Pick a visual theme — all decks play identically',
    };

    const title = this.add.text(512, 70, titles[this.currentStep], {
      fontSize: '26px', color: '#d4a574', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    const subtitle = this.add.text(512, 104, subtitles[this.currentStep], {
      fontSize: '15px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Progress dots
    const dots: Phaser.GameObjects.Arc[] = [];
    const steps: WizardStep[] = ['difficulty', 'pressure', 'deck'];
    const dotY = 134;
    const dotSpacing = 22;
    const dotStartX = 512 - (steps.length - 1) * dotSpacing / 2;
    steps.forEach((s, i) => {
      const isCurrent = s === this.currentStep;
      const isDone = steps.indexOf(this.currentStep) > i;
      const color = isCurrent ? 0xc73e3a : (isDone ? 0xe5b567 : 0x5c3825);
      const dot = this.add.circle(dotStartX + i * dotSpacing, dotY, isCurrent ? 7 : 5, color);
      dots.push(dot);
    });

    this.stepContainer.add([title, subtitle, ...dots]);

    // Step-specific content
    if (this.currentStep === 'difficulty') {
      this.renderDifficultyStep();
    } else if (this.currentStep === 'pressure') {
      this.renderPressureStep();
    } else {
      this.renderDeckStep();
    }
  }

  // ===== Step 1: Difficulty selection =====
  private renderDifficultyStep(): void {
    const beginnerDone = localStorage.getItem(GameConfig.beginner.completedKey) === '1';
    const y = 300;

    const options: { id: Difficulty; label: string; desc: string; locked: boolean; recommended: boolean }[] = [
      { id: 'beginner', label: 'BEGINNER', desc: '3 rounds · 4 yaku\nEasier targets\nLearn the basics', locked: false, recommended: !beginnerDone },
      { id: 'normal', label: 'NORMAL', desc: beginnerDone ? '5 rounds · all yaku\nStandard difficulty' : 'Complete Beginner\nmode to unlock', locked: !beginnerDone, recommended: false },
    ];

    const cardW = 320;
    const cardH = 280;
    const gap = 40;
    const startX = 512 - (options.length * cardW + (options.length - 1) * gap) / 2 + cardW / 2;

    options.forEach((opt, i) => {
      const x = startX + i * (cardW + gap);
      const isSelected = this.difficulty === opt.id;

      const elements: Phaser.GameObjects.GameObject[] = [];
      const shadow = this.add.rectangle(4, 4, cardW, cardH, 0x000000, 0.5);
      const bgColor = opt.locked ? 0x1a0f08 : (isSelected ? 0x3d2418 : 0x2a1d10);
      const borderColor = isSelected ? 0xc73e3a : (opt.locked ? 0x5c3825 : 0xd4a574);
      const bg = this.add.rectangle(0, 0, cardW, cardH, bgColor).setStrokeStyle(isSelected ? 5 : 3, borderColor);
      const topAccent = this.add.rectangle(0, -cardH / 2 + 4, cardW - 10, 4, isSelected ? 0xc73e3a : 0xe5b567);
      elements.push(shadow, bg, topAccent);

      if (opt.recommended) {
        const badge = this.add.text(0, -cardH / 2 + 32, '★ RECOMMENDED', {
          fontSize: '12px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
        }).setOrigin(0.5);
        elements.push(badge);
      }

      const nameColor = opt.locked ? '#5c3825' : '#f5e6d3';
      const nameY = opt.recommended ? -cardH / 2 + 64 : -cardH / 2 + 50;
      const name = this.add.text(0, nameY, opt.label, {
        fontSize: '24px', color: nameColor, fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      elements.push(name);

      if (opt.locked) {
        const lockIcon = this.add.text(0, nameY + 36, '[ LOCKED ]', {
          fontSize: '14px', color: '#5c3825', fontFamily: 'monospace',
        }).setOrigin(0.5);
        elements.push(lockIcon);
      }

      const descColor = opt.locked ? '#5c3825' : '#c9b89a';
      const desc = this.add.text(0, 20, opt.desc, {
        fontSize: '14px', color: descColor, fontFamily: 'monospace',
        align: 'center', lineSpacing: 6,
      }).setOrigin(0.5);
      elements.push(desc);

      const statusText = opt.locked ? '' : (isSelected ? '✓ SELECTED' : 'CLICK TO SELECT');
      if (statusText) {
        const status = this.add.text(0, cardH / 2 - 30, statusText, {
          fontSize: '13px', color: isSelected ? '#c73e3a' : '#c9b89a',
          fontFamily: 'monospace', fontStyle: 'bold',
        }).setOrigin(0.5);
        elements.push(status);
      }

      const card = this.add.container(x, y, elements).setSize(cardW, cardH);

      if (!opt.locked) {
        if (isSelected) card.setScale(1.05);
        card.setInteractive({ useHandCursor: true });
        card.on('pointerover', () => { if (this.difficulty !== opt.id) this.tweens.add({ targets: card, scale: 1.04, y: y - 4, duration: 120 }); });
        card.on('pointerout', () => { if (this.difficulty !== opt.id) this.tweens.add({ targets: card, scale: 1, y: y, duration: 120 }); });
        card.on('pointerdown', () => {
          this.soundManager.playClick();
          this.difficulty = opt.id;
          // Beginner mode skips pressure step (no pressure in beginner)
          this.currentStep = opt.id === 'beginner' ? 'deck' : 'pressure';
          this.renderStep();
        });
      }

      this.stepContainer.add(card);
    });

    // BACK button (to home)
    this.createBackButton(true);
  }

  // ===== Step 2: Pressure mode selection (normal mode only) =====
  private renderPressureStep(): void {
    const y = 300;

    const options: { id: PressureMode; label: string; desc: string }[] = [
      { id: 'off', label: 'OFF', desc: 'Relaxed learning\nNo move limit\nFocus on strategy' },
      { id: 'moves', label: 'MOVE LIMIT', desc: '15 moves per round\nWin in time for +300 pts\nExtra tension' },
    ];

    const cardW = 320;
    const cardH = 280;
    const gap = 40;
    const startX = 512 - (options.length * cardW + (options.length - 1) * gap) / 2 + cardW / 2;

    options.forEach((opt, i) => {
      const x = startX + i * (cardW + gap);
      const isSelected = this.pressureMode === opt.id;

      const elements: Phaser.GameObjects.GameObject[] = [];
      const shadow = this.add.rectangle(4, 4, cardW, cardH, 0x000000, 0.5);
      const bgColor = isSelected ? 0x3d2418 : 0x2a1d10;
      const borderColor = isSelected ? 0xc73e3a : 0xd4a574;
      const bg = this.add.rectangle(0, 0, cardW, cardH, bgColor).setStrokeStyle(isSelected ? 5 : 3, borderColor);
      const topAccent = this.add.rectangle(0, -cardH / 2 + 4, cardW - 10, 4, isSelected ? 0xc73e3a : 0xe5b567);
      elements.push(shadow, bg, topAccent);

      const name = this.add.text(0, -cardH / 2 + 50, opt.label, {
        fontSize: '24px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      elements.push(name);

      const desc = this.add.text(0, 20, opt.desc, {
        fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace',
        align: 'center', lineSpacing: 6,
      }).setOrigin(0.5);
      elements.push(desc);

      const status = this.add.text(0, cardH / 2 - 30, isSelected ? '✓ SELECTED' : 'CLICK TO SELECT', {
        fontSize: '13px', color: isSelected ? '#c73e3a' : '#c9b89a',
        fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      elements.push(status);

      const card = this.add.container(x, y, elements).setSize(cardW, cardH);

      if (isSelected) card.setScale(1.05);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => { if (this.pressureMode !== opt.id) this.tweens.add({ targets: card, scale: 1.04, y: y - 4, duration: 120 }); });
      card.on('pointerout', () => { if (this.pressureMode !== opt.id) this.tweens.add({ targets: card, scale: 1, y: y, duration: 120 }); });
      card.on('pointerdown', () => {
        this.soundManager.playClick();
        this.pressureMode = opt.id;
        this.currentStep = 'deck';
        this.renderStep();
      });

      this.stepContainer.add(card);
    });

    // Back to difficulty
    this.createPrevStepButton('difficulty');
  }

  // ===== Step 3: Deck theme selection + START RUN =====
  private renderDeckStep(): void {
    const unlockedDecks = getUnlockedDecks(this.meta);
    const unlockedIds = new Set(unlockedDecks.map(d => d.id));

    const totalWidth = STARTING_DECKS.length * CARD_W + (STARTING_DECKS.length - 1) * CARD_SPACING;
    const startX = 512 - totalWidth / 2;
    const cardY = 340;

    STARTING_DECKS.forEach((deck, index) => {
      const x = startX + index * (CARD_W + CARD_SPACING) + CARD_W / 2;
      const isUnlocked = unlockedIds.has(deck.id);
      const isDefault = deck.id === this.selectedDeckId;
      this.createDeckCard(x, cardY, deck, isUnlocked, isDefault, index);
    });

    // Bottom action bar: BACK + START RUN + PUZZLE
    this.createBottomActionBar();

    // Back to previous step (pressure for normal, difficulty for beginner)
    this.createPrevStepButton(this.difficulty === 'beginner' ? 'difficulty' : 'pressure');
  }

  private createDeckCard(
    x: number, y: number, deck: StartingDeck,
    isUnlocked: boolean, isDefault: boolean, index: number
  ): void {
    const shadow = this.add.rectangle(4, 4, CARD_W, CARD_H, 0x000000, 0.5);
    const borderColor = isDefault ? 0xc73e3a : (isUnlocked ? 0xd4a574 : 0x5c3825);
    const bgTint = isUnlocked ? 0x2a1d10 : 0x1a0f08;
    const cardBg = this.add.rectangle(0, 0, CARD_W, CARD_H, bgTint)
      .setStrokeStyle(isDefault ? 5 : 3, borderColor);
    const topStrip = this.add.rectangle(0, -CARD_H / 2 + 4, CARD_W - 6, 4, isDefault ? 0xc73e3a : 0xe5b567);
    const bottomStrip = this.add.rectangle(0, CARD_H / 2 - 4, CARD_W - 6, isDefault ? 4 : 2, borderColor);

    let glow: Phaser.GameObjects.Rectangle | null = null;
    if (isDefault && isUnlocked) {
      glow = this.add.rectangle(0, 0, CARD_W + 10, CARD_H + 10, 0xc73e3a, 0.3)
        .setStrokeStyle(2, 0xc73e3a, 0.6);
      this.tweens.add({
        targets: glow, alpha: 0.1, duration: 1000, yoyo: true, repeat: -1,
      });
    }

    const nameColor = isUnlocked ? '#f5e6d3' : '#5c3825';
    const nameText = this.add.text(0, -CARD_H / 2 + 32, deck.name, {
      fontSize: '16px', color: nameColor, fontFamily: 'monospace', fontStyle: 'bold',
      align: 'center', wordWrap: { width: CARD_W - 20 },
    }).setOrigin(0.5);

    this.createDeckIcon(0, -CARD_H / 2 + 80, isDefault ? 0xc73e3a : 0xe5b567, isUnlocked);

    const descColor = isUnlocked ? '#c9b89a' : '#5c3825';
    const descText = this.add.text(0, -10, this.wrapText(deck.description, 28), {
      fontSize: '13px', color: descColor, fontFamily: 'monospace',
      align: 'center', wordWrap: { width: CARD_W - 24 },
    }).setOrigin(0.5);

    const themeText = this.add.text(0, 60, `THEME:\n${deck.theme}`, {
      fontSize: '13px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
      align: 'center', wordWrap: { width: CARD_W - 24 },
    }).setOrigin(0.5);

    const statusText = isUnlocked
      ? (isDefault ? '✓ SELECTED' : 'CLICK TO SELECT')
      : `LOCKED\n${deck.unlockCondition}`;
    const statusColor = isUnlocked ? (isDefault ? '#c73e3a' : '#c9b89a') : '#5c3825';
    const status = this.add.text(0, CARD_H / 2 - 22, statusText, {
      fontSize: '13px', color: statusColor, fontFamily: 'monospace', fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5);

    const elements: Phaser.GameObjects.GameObject[] = [
      shadow, cardBg, topStrip, bottomStrip, nameText, descText, themeText, status,
    ];
    if (glow) elements.unshift(glow);

    const container = this.add.container(x, y, elements).setSize(CARD_W, CARD_H);
    if (isDefault && isUnlocked) container.setScale(1.05);

    if (isUnlocked) {
      container.setInteractive({ useHandCursor: true });
      container.on('pointerover', () => {
        if (deck.id !== this.selectedDeckId) this.tweens.add({ targets: container, scale: 1.04, y: y - 4, duration: 120 });
      });
      container.on('pointerout', () => {
        if (deck.id !== this.selectedDeckId) this.tweens.add({ targets: container, scale: 1, y: y, duration: 120 });
      });
      container.on('pointerdown', () => {
        this.soundManager.playClick();
        this.selectedDeckId = deck.id;
        this.renderStep();
      });
    }

    container.setAlpha(0);
    container.setY(y - 30);
    this.tweens.add({
      targets: container, alpha: 1, y: y, duration: 350, delay: index * 80, ease: 'Back.easeOut',
    });

    this.stepContainer.add(container);
  }

  private createDeckIcon(x: number, y: number, color: number, isUnlocked: boolean): void {
    const g = this.add.graphics();
    g.fillStyle(color, isUnlocked ? 1 : 0.4);
    g.fillRect(x - 2, y - 14, 4, 4);
    g.fillRect(x - 6, y - 10, 12, 4);
    g.fillRect(x - 10, y - 6, 20, 4);
    g.fillRect(x - 6, y - 2, 12, 4);
    g.fillRect(x - 2, y + 2, 4, 4);
    g.fillRect(x + 8, y - 14, 2, 2);
    g.fillRect(x - 10, y + 2, 2, 2);
    this.stepContainer.add(g);
  }

  // ===== Bottom action bar on deck step: START RUN + PUZZLE MODE =====
  private createBottomActionBar(): void {
    const y = 640;

    // START RUN button (large, right)
    const startW = 220;
    const startH = 52;
    const startX = 700;
    const startShadow = this.add.rectangle(startX + 4, y + 4, startW, startH, 0x000000, 0.5);
    const startBg = this.add.rectangle(startX, y, startW, startH, 0xc73e3a).setStrokeStyle(3, 0x2b1810);
    const startHighlight = this.add.rectangle(startX, y - startH / 2 + 3, startW - 6, 2, 0xffffff, 0.4);
    const startText = this.add.text(startX, y, 'START RUN ▶', {
      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    const startHit = this.add.rectangle(startX, y, startW, startH, 0xffffff, 0).setInteractive({ useHandCursor: true });
    startHit.on('pointerover', () => { startBg.setFillStyle(0xe04e4a); startHit.setScale(1.05); });
    startHit.on('pointerout', () => { startBg.setFillStyle(0xc73e3a); startHit.setScale(1); });
    startHit.on('pointerdown', () => {
      this.soundManager.playClick();
      this.scene.start('GameScene', { action: 'new_run', deckId: this.selectedDeckId, difficulty: this.difficulty, pressureMode: this.pressureMode });
    });
    this.stepContainer.add([startShadow, startBg, startHighlight, startText, startHit]);

    // PUZZLE MODE button (smaller, left of START)
    const puzzleW = 160;
    const puzzleH = 44;
    const puzzleX = 512;
    const puzzleShadow = this.add.rectangle(puzzleX + 4, y + 4, puzzleW, puzzleH, 0x000000, 0.5);
    const puzzleBg = this.add.rectangle(puzzleX, y, puzzleW, puzzleH, 0x2b1810).setStrokeStyle(3, 0xe5b567);
    const puzzleHighlight = this.add.rectangle(puzzleX, y - puzzleH / 2 + 3, puzzleW - 6, 2, 0xffffff, 0.4);
    const puzzleText = this.add.text(puzzleX, y, 'PUZZLE MODE', {
      fontSize: '13px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    const puzzleHit = this.add.rectangle(puzzleX, y, puzzleW, puzzleH, 0xffffff, 0).setInteractive({ useHandCursor: true });
    puzzleHit.on('pointerover', () => puzzleBg.setFillStyle(0x3d2418));
    puzzleHit.on('pointerout', () => puzzleBg.setFillStyle(0x2b1810));
    puzzleHit.on('pointerdown', () => {
      this.soundManager.playClick();
      this.showPuzzleList();
    });
    this.stepContainer.add([puzzleShadow, puzzleBg, puzzleHighlight, puzzleText, puzzleHit]);
  }

  // ===== Previous step button (top-left) =====
  private createPrevStepButton(prevStep: WizardStep): void {
    const x = 140;
    const y = 640;
    const w = 140;
    const h = 44;
    const shadow = this.add.rectangle(x + 4, y + 4, w, h, 0x000000, 0.5);
    const bg = this.add.rectangle(x, y, w, h, 0xd4a574).setStrokeStyle(3, 0x2b1810);
    const highlight = this.add.rectangle(x, y - h / 2 + 3, w - 6, 2, 0xffffff, 0.4);
    const txt = this.add.text(x, y, '◀ BACK', {
      fontSize: '13px', color: '#2b1810', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    const hit = this.add.rectangle(x, y, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { bg.setFillStyle(0xe8c088); hit.setScale(1.05); });
    hit.on('pointerout', () => { bg.setFillStyle(0xd4a574); hit.setScale(1); });
    hit.on('pointerdown', () => {
      this.soundManager.playClick();
      this.currentStep = prevStep;
      this.renderStep();
    });
    this.stepContainer.add([shadow, bg, highlight, txt, hit]);
  }

  // ===== Back to home button (on difficulty step only) =====
  private createBackButton(toHome: boolean): void {
    const x = 140;
    const y = 640;
    const w = 140;
    const h = 44;
    const shadow = this.add.rectangle(x + 4, y + 4, w, h, 0x000000, 0.5);
    const bg = this.add.rectangle(x, y, w, h, 0xd4a574).setStrokeStyle(3, 0x2b1810);
    const highlight = this.add.rectangle(x, y - h / 2 + 3, w - 6, 2, 0xffffff, 0.4);
    const txt = this.add.text(x, y, '◀ HOME', {
      fontSize: '13px', color: '#2b1810', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    const hit = this.add.rectangle(x, y, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { bg.setFillStyle(0xe8c088); hit.setScale(1.05); });
    hit.on('pointerout', () => { bg.setFillStyle(0xd4a574); hit.setScale(1); });
    hit.on('pointerdown', () => {
      this.soundManager.playClick();
      window.location.href = '/';
    });
    this.stepContainer.add([shadow, bg, highlight, txt, hit]);
  }

  // ===== Decorative lantern =====
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

  private showPuzzleList(): void {
    const depth = 200;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.85).setDepth(depth);
    const panelW = 560;
    const panelH = 460;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0xd4a574).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 3, 0xe5b567).setDepth(depth);

    const title = this.add.text(512, 360 - panelH / 2 + 36, 'PUZZLE MODE', {
      fontSize: '22px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const subtitle = this.add.text(512, 360 - panelH / 2 + 64, 'Select a scenario to practice', {
      fontSize: '14px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, subtitle];

    const cardH = 90;
    const gap = 12;
    const startY = 360 - panelH / 2 + 100;
    GameConfig.puzzles.items.forEach((puzzle, i) => {
      const y = startY + i * (cardH + gap);
      const bg = this.add.rectangle(512, y, panelW - 40, cardH, 0x2b1810)
        .setStrokeStyle(2, 0xe5b567).setDepth(depth);
      const name = this.add.text(280, y - 22, puzzle.name, {
        fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0, 0.5).setDepth(depth + 1);
      const goal = this.add.text(280, y - 2, `GOAL: ${puzzle.goalYaku.toUpperCase()} · Optimal: ${puzzle.optimalMoves} moves`, {
        fontSize: '11px', color: '#d4a574', fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setDepth(depth + 1);
      const desc = this.add.text(280, y + 22, this.wrapText(puzzle.description, 60), {
        fontSize: '13px', color: '#c9b89a', fontFamily: 'monospace',
        wordWrap: { width: panelW - 360 },
      }).setOrigin(0, 0.5).setDepth(depth + 1);
      elements.push(bg, name, goal, desc);

      const hit = this.add.rectangle(512, y, panelW - 40, cardH, 0xffffff, 0).setDepth(depth + 2);
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => bg.setFillStyle(0x3d2418));
      hit.on('pointerout', () => bg.setFillStyle(0x2b1810));
      hit.on('pointerdown', () => {
        this.soundManager.playClick();
        this.scene.start('GameScene', { action: 'puzzle', puzzleId: puzzle.id });
      });
      elements.push(hit);
    });

    const closeBtnY = 360 + panelH / 2 - 32;
    const closeBg = this.add.rectangle(512, closeBtnY, 120, 36, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810).setDepth(depth);
    const closeText = this.add.text(512, closeBtnY, 'CLOSE', {
      fontSize: '13px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const closeHit = this.add.rectangle(512, closeBtnY, 120, 36, 0xffffff, 0).setDepth(depth + 2);
    closeHit.setInteractive({ useHandCursor: true });
    closeHit.on('pointerover', () => closeBg.setFillStyle(0xe04e4a));
    closeHit.on('pointerout', () => closeBg.setFillStyle(0xc73e3a));
    closeHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
    });
    elements.push(closeBg, closeText, closeHit);
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
