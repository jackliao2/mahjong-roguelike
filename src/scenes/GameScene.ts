import Phaser from 'phaser';
import { Tile, Hand, RunState } from '@/types';
import { TileWall } from '@/game/wall';
import { createHand, sortHand, getAllTiles } from '@/game/hand';
import { detectWin, findWaitingTiles } from '@/game/winDetector';
import { calculateScore, calculateTargetScore, createRunState } from '@/game/scoring';
import { checkAllYaku } from '@/game/yaku';
import { tileKey, getTileDisplay } from '@/game/tiles';
import { TILE_WIDTH, TILE_HEIGHT } from '@/render/tileRenderer';

type GamePhase = 'idle' | 'drew' | 'won' | 'lost' | 'round_end';

interface GameState {
  wall: TileWall;
  hand: Hand;
  runState: RunState;
  phase: GamePhase;
  discardedTiles: Tile[];
  roundScore: number;
}

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private tileSprites: Phaser.GameObjects.Container[] = [];
  private uiText: Record<string, Phaser.GameObjects.Text> = {};
  private actionButtons: Record<string, Phaser.GameObjects.Container> = {};
  private messageText!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#2b1810');
    this.startNewRun();
  }

  private startNewRun(): void {
    const runState = createRunState(5);
    this.state = {
      wall: new TileWall(),
      hand: createHand(),
      runState,
      phase: 'idle',
      discardedTiles: [],
      roundScore: 0,
    };
    this.dealInitialHand();
    this.createUI();
    this.renderHand();
  }

  private dealInitialHand(): void {
    const tiles: Tile[] = [];
    for (let i = 0; i < 13; i++) {
      const tile = this.state.wall.draw();
      if (tile) tiles.push(tile);
    }
    this.state.hand = createHand(tiles);
  }

  // ========== UI CREATION ==========

  private createUI(): void {
    // Top bar - score panel
    const topBg = this.add.rectangle(0, 0, 1024, 60, 0x1a0f08, 0.9)
      .setOrigin(0, 0);
    topBg.setStrokeStyle(2, 0xd4a574);

    this.uiText.round = this.add.text(20, 12, '', {
      fontSize: '16px',
      color: '#f5e6d3',
      fontFamily: 'monospace',
    });

    this.uiText.score = this.add.text(200, 12, '', {
      fontSize: '16px',
      color: '#d4a574',
      fontFamily: 'monospace',
    });

    this.uiText.target = this.add.text(400, 12, '', {
      fontSize: '16px',
      color: '#c73e3a',
      fontFamily: 'monospace',
    });

    this.uiText.wall = this.add.text(650, 12, '', {
      fontSize: '16px',
      color: '#8b6f47',
      fontFamily: 'monospace',
    });

    this.uiText.phase = this.add.text(850, 12, '', {
      fontSize: '14px',
      color: '#f5e6d3',
      fontFamily: 'monospace',
    });

    // Message area (center)
    this.messageText = this.add.text(512, 250, '', {
      fontSize: '28px',
      color: '#f5e6d3',
      fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5);

    // Action buttons
    this.createButton('draw', 512, 400, 'DRAW TILE', () => this.drawTile());
    this.createButton('riichi', 350, 400, 'RIICHI', () => this.declareRiichi());
    this.createButton('win', 674, 400, 'WIN!', () => this.declareWin(), true);
    this.createButton('nextRound', 512, 400, 'NEXT ROUND', () => this.nextRound());
    this.createButton('newRun', 512, 400, 'NEW RUN', () => this.startNewRun());

    this.updateUI();
  }

  private createButton(
    key: string, x: number, y: number, label: string,
    callback: () => void, highlight: boolean = false
  ): void {
    const width = 140;
    const height = 44;
    const bg = this.add.rectangle(0, 0, width, height, highlight ? 0xc73e3a : 0xd4a574)
      .setStrokeStyle(2, 0x2b1810);
    const text = this.add.text(0, 0, label, {
      fontSize: '14px',
      color: '#2b1810',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, text])
      .setSize(width, height)
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

    this.actionButtons[key] = container;
  }

  private showButton(key: string): void {
    if (this.actionButtons[key]) this.actionButtons[key].setVisible(true);
  }

  private hideButton(key: string): void {
    if (this.actionButtons[key]) this.actionButtons[key].setVisible(false);
  }

  private hideAllButtons(): void {
    Object.values(this.actionButtons).forEach(btn => btn.setVisible(false));
  }

  // ========== GAME ACTIONS ==========

  private drawTile(): void {
    if (this.state.phase !== 'idle') return;

    const tile = this.state.wall.draw();
    if (!tile) {
      this.endRound(false);
      return;
    }

    this.state.hand.drawnTile = tile;
    this.state.phase = 'drew';

    // Check for win
    const allTiles = getAllTiles(this.state.hand);
    const win = detectWin(allTiles);
    if (win) {
      this.showMessage('Tsumo! You can win!');
    }

    this.renderHand();
    this.updateUI();
  }

  private discardTile(tileId: string): void {
    if (this.state.phase !== 'drew') return;

    // Can be from hand tiles or drawn tile
    let discarded: Tile;
    if (this.state.hand.drawnTile && this.state.hand.drawnTile.id === tileId) {
      discarded = this.state.hand.drawnTile;
      this.state.hand.drawnTile = null;
    } else {
      const idx = this.state.hand.tiles.findIndex(t => t.id === tileId);
      if (idx === -1) return;
      discarded = this.state.hand.tiles[idx];
      this.state.hand.tiles.splice(idx, 1);
      // If there was a drawn tile, move it into the hand
      if (this.state.hand.drawnTile) {
        this.state.hand.tiles.push(this.state.hand.drawnTile);
        this.state.hand.drawnTile = null;
      }
    }

    this.state.hand.tiles = sortHand(this.state.hand.tiles);
    this.state.discardedTiles.push(discarded);
    this.state.phase = 'idle';

    // Check if wall is exhausted
    if (this.state.wall.remaining === 0) {
      this.endRound(false);
      return;
    }

    // If in riichi, auto-draw
    if (this.state.runState.isRiichi) {
      this.time.delayedCall(300, () => this.drawTile());
    }

    this.renderHand();
    this.updateUI();
  }

  private declareRiichi(): void {
    if (this.state.phase !== 'idle') return;
    if (this.state.runState.isRiichi) return;

    // Check if in tenpai (1 tile away from win)
    const waiting = findWaitingTiles(this.state.hand.tiles);
    if (waiting.length === 0) {
      this.showMessage('Not in tenpai! Cannot declare Riichi.');
      this.time.delayedCall(1500, () => this.showMessage(''));
      return;
    }

    this.state.runState.isRiichi = true;
    this.showMessage('Riichi declared! Auto-draw enabled.');
    this.time.delayedCall(1500, () => this.showMessage(''));
    this.updateUI();
  }

  private declareWin(): void {
    if (this.state.phase !== 'drew') return;

    const allTiles = getAllTiles(this.state.hand);
    const win = detectWin(allTiles);
    if (!win) {
      this.showMessage('Not a winning hand!');
      return;
    }

    const score = calculateScore(
      win,
      allTiles,
      this.state.runState.isRiichi,
      this.state.runState.relics
    );

    this.state.roundScore = score.finalScore;
    this.state.runState.score += score.finalScore;
    this.state.phase = 'won';

    // Show win message with yaku
    const yakuNames = score.yakuList.map(y => y.yaku.name).join(', ');
    this.showMessage(
      `WIN! ${score.finalScore} pts\n${yakuNames}\nHan: ${score.totalHan}`
    );

    this.endRound(true);
  }

  private endRound(won: boolean): void {
    this.state.phase = won ? 'won' : 'lost';

    if (!won) {
      // Check if score meets target
      if (this.state.runState.score >= this.state.runState.targetScore) {
        this.showMessage(`Round survived! Score: ${this.state.runState.score}`);
      } else {
        this.showMessage(`Game Over! Score: ${this.state.runState.score}/${this.state.runState.targetScore}`);
      }
    }

    this.renderHand();
    this.updateUI();
  }

  private nextRound(): void {
    this.state.runState.round++;
    this.state.runState.isRiichi = false;
    this.state.wall = new TileWall();
    this.state.hand = createHand();
    this.state.discardedTiles = [];
    this.state.roundScore = 0;
    this.state.runState.targetScore = calculateTargetScore(
      this.state.runState.round,
      this.state.runState.maxRounds
    );
    this.state.phase = 'idle';
    this.dealInitialHand();
    this.showMessage('');
    this.renderHand();
    this.updateUI();
  }

  // ========== RENDERING ==========

  private renderHand(): void {
    // Clear old sprites
    this.tileSprites.forEach(s => s.destroy());
    this.tileSprites = [];

    const hand = this.state.hand;
    const tileSpacing = 4;
    const totalWidth = hand.tiles.length * (TILE_WIDTH + tileSpacing);
    const startX = 512 - totalWidth / 2;
    const y = 620;

    // Render hand tiles
    hand.tiles.forEach((tile, index) => {
      const x = startX + index * (TILE_WIDTH + tileSpacing);
      const sprite = this.createTileSprite(tile, x, y);
      this.tileSprites.push(sprite);
    });

    // Render drawn tile (separated)
    if (hand.drawnTile) {
      const drawnX = startX + hand.tiles.length * (TILE_WIDTH + tileSpacing) + 20;
      const sprite = this.createTileSprite(hand.drawnTile, drawnX, y, true);
      this.tileSprites.push(sprite);
    }

    // Render discard area (top right)
    this.renderDiscards();
  }

  private createTileSprite(tile: Tile, x: number, y: number, isDrawn: boolean = false): Phaser.GameObjects.Container {
    const textureKey = `tile-${tileKey(tile)}`;
    const sprite = this.add.image(0, 0, textureKey);

    // Tile back/shadow
    const shadow = this.add.rectangle(2, 4, TILE_WIDTH, TILE_HEIGHT, 0x000000, 0.3);

    const container = this.add.container(x, y, [shadow, sprite]);

    // Hover and click interaction
    container.setSize(TILE_WIDTH, TILE_HEIGHT);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerover', () => {
      container.setY(y - 8);
      this.showTileTooltip(tile, x, y - TILE_HEIGHT - 20);
    });

    container.on('pointerout', () => {
      container.setY(y);
      this.hideTooltip();
    });

    container.on('pointerdown', () => {
      if (this.state.phase === 'drew') {
        this.discardTile(tile.id);
      }
    });

    return container;
  }

  private tooltipText: Phaser.GameObjects.Text | null = null;
  private tooltipBg: Phaser.GameObjects.Rectangle | null = null;

  private showTileTooltip(tile: Tile, x: number, y: number): void {
    this.hideTooltip();
    const display = getTileDisplay(tile);

    this.tooltipBg = this.add.rectangle(x, y, 180, 60, 0x1a0f08, 0.95)
      .setStrokeStyle(2, 0xd4a574)
      .setDepth(1000);

    this.tooltipText = this.add.text(x, y, `${display.englishName}\n(${display.romaji})\n${display.westernHint}`, {
      fontSize: '12px',
      color: '#f5e6d3',
      fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5).setDepth(1001);
  }

  private hideTooltip(): void {
    if (this.tooltipText) { this.tooltipText.destroy(); this.tooltipText = null; }
    if (this.tooltipBg) { this.tooltipBg.destroy(); this.tooltipBg = null; }
  }

  private renderDiscards(): void {
    // Simple discard pile in top right
    const x = 950;
    const y = 100;
    const count = this.state.discardedTiles.length;
    if (this.uiText['discardCount']) {
      this.uiText['discardCount'].setText(`Discards: ${count}`);
    } else {
      this.uiText['discardCount'] = this.add.text(x - 60, y, `Discards: ${count}`, {
        fontSize: '12px',
        color: '#8b6f47',
        fontFamily: 'monospace',
      });
    }
  }

  private showMessage(msg: string): void {
    this.messageText.setText(msg);
  }

  private updateUI(): void {
    const rs = this.state.runState;
    this.uiText.round.setText(`Round ${rs.round}/${rs.maxRounds}`);
    this.uiText.score.setText(`Score: ${rs.score}`);
    this.uiText.target.setText(`Target: ${rs.targetScore}`);
    this.uiText.wall.setText(`Wall: ${this.state.wall.remaining}`);

    const phaseLabels: Record<GamePhase, string> = {
      idle: 'Your Turn',
      drew: 'Discard or Win',
      won: 'Round Won!',
      lost: 'Round Over',
      round_end: 'Round End',
    };
    this.uiText.phase.setText(phaseLabels[this.state.phase]);

    if (this.uiText['discardCount']) {
      this.uiText['discardCount'].setText(`Discards: ${this.state.discardedTiles.length}`);
    }

    // Button visibility
    this.hideAllButtons();

    switch (this.state.phase) {
      case 'idle':
        this.showButton('draw');
        if (!rs.isRiichi) this.showButton('riichi');
        break;
      case 'drew':
        // Show win button if hand is winning
        const allTiles = getAllTiles(this.state.hand);
        if (detectWin(allTiles)) this.showButton('win');
        break;
      case 'won':
        if (rs.round < rs.maxRounds) {
          this.showButton('nextRound');
        } else {
          this.showMessage(`Run Complete! Final Score: ${rs.score}`);
          this.showButton('newRun');
        }
        break;
      case 'lost':
        this.showButton('newRun');
        break;
    }
  }
}
