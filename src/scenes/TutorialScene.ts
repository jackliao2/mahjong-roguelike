import Phaser from 'phaser';
import { GameConfig } from '@/config/game-config';
import { SoundManager } from '@/render/sound';
import { Tile } from '@/types';

type TutorialTile = Pick<Tile, 'suit' | 'rank'>;

const TOTAL_STEPS = 7;

export class TutorialScene extends Phaser.Scene {
  private step = 0;
  private locked = false;
  private soundManager!: SoundManager;

  constructor() {
    super('TutorialScene');
  }

  create(): void {
    this.soundManager = new SoundManager(this);
    this.cameras.main.setBackgroundColor('#1a1008');
    this.renderStep();
  }

  private renderStep(): void {
    this.locked = false;
    this.tweens.killAll();
    this.children.removeAll(true);
    this.add.rectangle(0, 0, 1024, 720, 0x1a1008).setOrigin(0);
    this.renderHeader();

    switch (this.step) {
      case 0: this.renderTileFamilies(); break;
      case 1: this.renderWinningShape(); break;
      case 2: this.renderDrawDiscard(); break;
      case 3: this.renderWait(); break;
      case 4: this.renderYaku(); break;
      case 5: this.renderRiichi(); break;
      case 6: this.renderDefense(); break;
      default: this.renderComplete();
    }
  }

  private renderHeader(): void {
    this.add.text(50, 36, 'RIICHI IN 3 MINUTES', {
      fontSize: '14px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      letterSpacing: 2,
    });

    if (this.step < TOTAL_STEPS) {
      this.add.text(974, 36, `${this.step + 1} / ${TOTAL_STEPS}`, {
        fontSize: '14px', color: '#8b7a67', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(1, 0);

      for (let i = 0; i < TOTAL_STEPS; i++) {
        this.add.rectangle(408 + i * 34, 43, 24, 4, i <= this.step ? 0xc73e3a : 0x3d2a1d);
      }

      if (this.step > 0) {
        this.makeTextLink(50, 680, '← BACK', () => {
          this.step -= 1;
          this.renderStep();
        });
      }
      this.makeTextLink(974, 680, 'SKIP', () => this.finishTutorial(), 1);
    }
  }

  private addLessonCopy(title: string, body: string, instruction: string): void {
    this.add.text(512, 105, title, {
      fontSize: '30px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(512, 158, body, {
      fontSize: '16px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
      align: 'center', wordWrap: { width: 760 }, lineSpacing: 5,
    }).setOrigin(0.5);
    this.add.text(512, 626, instruction, {
      fontSize: '14px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  private renderTileFamilies(): void {
    this.addLessonCopy(
      'MEET THE TILES',
      'Three numbered suits make sequences. Winds and dragons are honor tiles.',
      'Tap the BAMBOO tile',
    );

    const examples: Array<{ tile: TutorialTile; label: string; sub: string; correct?: boolean }> = [
      { tile: { suit: 'man', rank: 3 }, label: 'CHARACTERS', sub: 'MAN' },
      { tile: { suit: 'pin', rank: 4 }, label: 'CIRCLES', sub: 'PIN' },
      { tile: { suit: 'sou', rank: 5 }, label: 'BAMBOO', sub: 'SOU', correct: true },
      { tile: { suit: 'wind', rank: 1 }, label: 'HONORS', sub: 'WINDS + DRAGONS' },
    ];

    examples.forEach((item, index) => {
      const x = 278 + index * 156;
      this.addTileChoice(item.tile, x, 340, item.correct === true, () => {
        if (item.correct) this.correct('Bamboo is the green numbered suit.');
        else this.nudge('Look for the green bamboo sticks.');
      }, 1.2);
      this.add.text(x, 415, item.label, {
        fontSize: '13px', color: item.correct ? '#6fbf73' : '#f5e6d3',
        fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(x, 438, item.sub, {
        fontSize: '10px', color: '#8b7a67', fontFamily: '"Nunito", sans-serif',
      }).setOrigin(0.5);
    });
  }

  private renderWinningShape(): void {
    this.addLessonCopy(
      'BUILD 4 GROUPS + 1 PAIR',
      'A standard winning hand has four groups of three tiles and one matching pair.',
      'Complete the pair',
    );

    const hand: TutorialTile[] = [
      { suit: 'man', rank: 1 }, { suit: 'man', rank: 2 }, { suit: 'man', rank: 3 },
      { suit: 'pin', rank: 4 }, { suit: 'pin', rank: 5 }, { suit: 'pin', rank: 6 },
      { suit: 'sou', rank: 6 }, { suit: 'sou', rank: 7 }, { suit: 'sou', rank: 8 },
      { suit: 'man', rank: 6 }, { suit: 'man', rank: 7 }, { suit: 'man', rank: 8 },
      { suit: 'pin', rank: 7 },
    ];
    this.renderHand(hand, 512, 330, 0.75, [3, 6, 9, 12]);

    const choices: TutorialTile[] = [
      { suit: 'pin', rank: 6 }, { suit: 'pin', rank: 7 }, { suit: 'sou', rank: 9 },
    ];
    choices.forEach((tile, index) => {
      const correct = tile.suit === 'pin' && tile.rank === 7;
      this.addTileChoice(tile, 422 + index * 90, 490, correct, () => {
        if (correct) this.correct('Four groups plus a pair makes the basic winning shape.');
        else this.nudge('The final 7 Circles needs an identical partner.');
      });
    });
  }

  private renderDrawDiscard(): void {
    this.addLessonCopy(
      'DRAW ONE, DISCARD ONE',
      'You normally hold 13 tiles. On your turn you draw a 14th, then discard back to 13.',
      'Discard the isolated EAST tile',
    );
    const hand: TutorialTile[] = [
      { suit: 'man', rank: 2 }, { suit: 'man', rank: 3 }, { suit: 'man', rank: 4 },
      { suit: 'pin', rank: 3 }, { suit: 'pin', rank: 4 }, { suit: 'pin', rank: 5 },
      { suit: 'sou', rank: 4 }, { suit: 'sou', rank: 5 }, { suit: 'sou', rank: 6 },
      { suit: 'man', rank: 7 }, { suit: 'man', rank: 8 },
      { suit: 'dragon', rank: 1 }, { suit: 'dragon', rank: 1 },
    ];
    this.renderHand(hand, 477, 350, 0.72);
    this.add.text(882, 280, 'DRAWN', {
      fontSize: '11px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.addTileChoice({ suit: 'wind', rank: 1 }, 882, 350, true, () => {
      this.correct('Good. The hand returns to 13 tiles and the turn passes.');
    }, 0.9);
  }

  private renderWait(): void {
    this.addLessonCopy(
      'TENPAI MEANS ONE TILE AWAY',
      'This hand already has four groups. It only needs a second 7 Circles to make the pair.',
      'Tap the winning tile',
    );
    const hand: TutorialTile[] = [
      { suit: 'man', rank: 1 }, { suit: 'man', rank: 2 }, { suit: 'man', rank: 3 },
      { suit: 'man', rank: 4 }, { suit: 'man', rank: 5 }, { suit: 'man', rank: 6 },
      { suit: 'pin', rank: 1 }, { suit: 'pin', rank: 2 }, { suit: 'pin', rank: 3 },
      { suit: 'sou', rank: 4 }, { suit: 'sou', rank: 5 }, { suit: 'sou', rank: 6 },
      { suit: 'pin', rank: 7 },
    ];
    this.renderHand(hand, 512, 325, 0.75, [3, 6, 9, 12]);
    const choices: TutorialTile[] = [
      { suit: 'pin', rank: 7 }, { suit: 'pin', rank: 8 }, { suit: 'sou', rank: 3 },
    ];
    choices.forEach((tile, index) => {
      const correct = tile.suit === 'pin' && tile.rank === 7;
      this.addTileChoice(tile, 422 + index * 90, 490, correct, () => {
        if (correct) this.correct('That is your wait. Drawing it is TSUMO; claiming it is RON.');
        else this.nudge('Look for the lonely tile that needs a matching partner.');
      });
    });
  }

  private renderYaku(): void {
    this.addLessonCopy(
      'A WINNING HAND NEEDS A YAKU',
      'TANYAO is an easy yaku: use only number tiles 2 through 8—no terminals or honors.',
      'Remove the tile that breaks TANYAO',
    );
    const choices: Array<{ tile: TutorialTile; label: string; correct?: boolean }> = [
      { tile: { suit: 'man', rank: 1 }, label: 'TERMINAL', correct: true },
      { tile: { suit: 'man', rank: 4 }, label: 'SIMPLE' },
      { tile: { suit: 'pin', rank: 5 }, label: 'SIMPLE' },
      { tile: { suit: 'sou', rank: 7 }, label: 'SIMPLE' },
    ];
    choices.forEach((item, index) => {
      const x = 377 + index * 90;
      this.addTileChoice(item.tile, x, 365, item.correct === true, () => {
        if (item.correct) this.correct('Right. With only 2–8 tiles, the hand can qualify for Tanyao.');
        else this.nudge('Tanyao allows 2 through 8. Find the 1 or 9.');
      });
      this.add.text(x, 420, item.label, {
        fontSize: '10px', color: item.correct ? '#e5b567' : '#8b7a67', fontFamily: '"Nunito", sans-serif',
      }).setOrigin(0.5);
    });
  }

  private renderRiichi(): void {
    this.addLessonCopy(
      'RIICHI IS YOUR SIGNATURE BET',
      'If your hand is closed and tenpai, bet 1,000 points to declare Riichi. Your hand locks, but winning becomes more valuable.',
      'Declare RIICHI',
    );
    this.add.rectangle(512, 338, 520, 118, 0x120a06, 0.9).setStrokeStyle(1, 0x6a5845);
    this.add.text(512, 315, 'CLOSED HAND  ·  TENPAI', {
      fontSize: '14px', color: '#6fbf73', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      letterSpacing: 2,
    }).setOrigin(0.5);
    this.add.text(512, 356, '25,000  →  24,000 points', {
      fontSize: '16px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5);
    this.makeButton(512, 485, 240, 56, 'RIICHI · 1,000', 0xc73e3a, () => {
      this.correct('Riichi gives you a yaku and access to ura-dora if you win.');
    });
  }

  private renderDefense(): void {
    this.addLessonCopy(
      'WHEN THEY RIICHI, SAFETY MATTERS',
      'A tile that opponent already discarded cannot deal into that same opponent. This is called genbutsu.',
      'Choose the guaranteed safe tile',
    );
    this.add.text(512, 245, 'OPPONENT RIVER', {
      fontSize: '12px', color: '#c73e3a', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      letterSpacing: 2,
    }).setOrigin(0.5);
    const river: TutorialTile[] = [
      { suit: 'wind', rank: 3 }, { suit: 'pin', rank: 1 }, { suit: 'man', rank: 5 }, { suit: 'sou', rank: 9 },
    ];
    river.forEach((tile, index) => this.addTileStatic(tile, 377 + index * 90, 315, 0.68));
    this.add.text(557, 370, '5 Characters is already here', {
      fontSize: '11px', color: '#6fbf73', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);

    const choices: TutorialTile[] = [
      { suit: 'man', rank: 5 }, { suit: 'pin', rank: 8 }, { suit: 'sou', rank: 3 },
    ];
    choices.forEach((tile, index) => {
      const correct = tile.suit === 'man' && tile.rank === 5;
      this.addTileChoice(tile, 422 + index * 90, 495, correct, () => {
        if (correct) this.correct('Safe fold. Defense is often stronger than forcing a weak attack.');
        else this.nudge('Match a tile you can already see in the opponent’s river.');
      });
    });
  }

  private renderComplete(): void {
    this.add.text(512, 175, 'YOU CAN PLAY RIICHI', {
      fontSize: '34px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(512, 232, 'You now know the essentials:', {
      fontSize: '16px', color: '#c9b89a', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5);

    const recap = [
      'DRAW → DISCARD',
      'BUILD 4 GROUPS + 1 PAIR',
      'KEEP A YAKU',
      'RIICHI WHEN CLOSED + TENPAI',
      'FOLD WITH SAFE TILES',
    ];
    recap.forEach((line, index) => {
      this.add.text(512, 295 + index * 42, `✓  ${line}`, {
        fontSize: '15px', color: index === 0 ? '#e5b567' : '#f5e6d3',
        fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      }).setOrigin(0.5);
    });
    this.makeButton(512, 550, 300, 58, 'START YOUR FIRST HAND', 0xc73e3a, () => this.finishTutorial());
    this.add.text(512, 606, 'No timer pressure. Explanations appear after every choice.', {
      fontSize: '12px', color: '#8b7a67', fontFamily: '"Nunito", sans-serif',
    }).setOrigin(0.5);
  }

  private renderHand(tiles: TutorialTile[], centerX: number, y: number, scale: number, gaps: number[] = []): void {
    const tileW = 56 * scale;
    const gap = 4;
    const groupGap = 13;
    const totalGroups = gaps.filter(index => index < tiles.length).length;
    const totalW = tiles.length * tileW + (tiles.length - 1) * gap + totalGroups * groupGap;
    let x = centerX - totalW / 2 + tileW / 2;
    tiles.forEach((tile, index) => {
      if (gaps.includes(index)) x += groupGap;
      this.addTileStatic(tile, x, y, scale);
      x += tileW + gap;
    });
  }

  private addTileStatic(tile: TutorialTile, x: number, y: number, scale = 1): Phaser.GameObjects.Image {
    return this.add.image(x, y, `tile-${tile.suit}-${tile.rank}`)
      .setDisplaySize(56 * scale, 72 * scale);
  }

  private addTileChoice(
    tile: TutorialTile,
    x: number,
    y: number,
    guided: boolean,
    onClick: () => void,
    scale = 1,
  ): void {
    const glow = this.add.rectangle(x, y, 62 * scale, 78 * scale, guided ? 0x4a9e4a : 0x2b1810, guided ? 0.28 : 0.3)
      .setStrokeStyle(guided ? 2 : 1, guided ? 0x6fbf73 : 0x6a5845);
    const image = this.addTileStatic(tile, x, y, scale).setInteractive({ useHandCursor: true });
    image.on('pointerover', () => {
      image.setDisplaySize(56 * scale * 1.06, 72 * scale * 1.06);
      glow.setStrokeStyle(2, 0xe5b567);
    });
    image.on('pointerout', () => {
      image.setDisplaySize(56 * scale, 72 * scale);
      glow.setStrokeStyle(guided ? 2 : 1, guided ? 0x6fbf73 : 0x6a5845);
    });
    image.on('pointerdown', () => {
      if (this.locked) return;
      this.soundManager.playClick();
      onClick();
    });
    if (guided) {
      this.tweens.add({ targets: glow, alpha: { from: 0.35, to: 0.75 }, duration: 850, yoyo: true, repeat: -1 });
    }
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, color: number, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, w, h, color).setStrokeStyle(2, 0x2b1810);
    const text = this.add.text(x, y, label, {
      fontSize: '15px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    const hit = this.add.rectangle(x, y, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { bg.setFillStyle(0xd44a46); text.setScale(1.03); });
    hit.on('pointerout', () => { bg.setFillStyle(color); text.setScale(1); });
    hit.on('pointerdown', () => {
      if (this.locked) return;
      this.soundManager.playClick();
      onClick();
    });
  }

  private makeTextLink(x: number, y: number, label: string, onClick: () => void, originX = 0): void {
    const link = this.add.text(x, y, label, {
      fontSize: '12px', color: '#8b7a67', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
    }).setOrigin(originX, 0.5).setInteractive({ useHandCursor: true });
    link.on('pointerover', () => link.setColor('#f5e6d3'));
    link.on('pointerout', () => link.setColor('#8b7a67'));
    link.on('pointerdown', () => {
      if (this.locked) return;
      this.soundManager.playClick();
      onClick();
    });
  }

  private correct(message: string): void {
    if (this.locked) return;
    this.locked = true;
    this.add.rectangle(512, 585, 620, 46, 0x2d6a4f, 0.92).setStrokeStyle(1, 0x6fbf73);
    this.add.text(512, 585, `✓  ${message}`, {
      fontSize: '13px', color: '#f5e6d3', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      align: 'center', wordWrap: { width: 580 },
    }).setOrigin(0.5);
    this.time.delayedCall(1050, () => {
      this.step += 1;
      this.renderStep();
    });
  }

  private nudge(message: string): void {
    const old = this.children.getByName('tutorial-nudge');
    old?.destroy();
    const nudge = this.add.text(512, 585, message, {
      fontSize: '13px', color: '#e5b567', fontFamily: '"Nunito", sans-serif', fontStyle: 'bold',
      align: 'center', wordWrap: { width: 600 },
    }).setName('tutorial-nudge').setOrigin(0.5);
    nudge.setAlpha(0);
    this.tweens.add({ targets: nudge, alpha: 1, duration: 160 });
  }

  private finishTutorial(): void {
    localStorage.setItem(GameConfig.beginner.tutorialSeenKey, '1');
    this.scene.start('GameScene', { action: 'new_run', difficulty: 'beginner' });
  }
}
