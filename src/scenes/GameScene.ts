import Phaser from 'phaser';
import { Tile, Hand, RunState } from '@/types';
import { TileWall } from '@/game/wall';
import { createHand, sortHand, getAllTiles } from '@/game/hand';
import { detectWin, findWaitingTiles } from '@/game/winDetector';
import { calculateScore, createRunState } from '@/game/scoring';
import { checkAllYaku } from '@/game/yaku';
import { tileKey, getTileDisplay } from '@/game/tiles';
import { TILE_WIDTH, TILE_HEIGHT } from '@/render/tileRenderer';
import { generateRewards, Reward } from '@/roguelike/rewards';
import { addRelicToRun, addCustomTileToRun, applyYakuBoost, advanceRound, checkRunComplete, persistRun, endRun, loadYakuBonuses } from '@/roguelike/run';
import { loadMeta } from '@/data/storage';

type GamePhase = 'idle' | 'drew' | 'won' | 'lost' | 'round_end' | 'reward';

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
  private tooltipText: Phaser.GameObjects.Text | null = null;
  private tooltipBg: Phaser.GameObjects.Rectangle | null = null;
  private yakuInfoText!: Phaser.GameObjects.Text;

  constructor() {
    super('GameScene');
  }

  create(data?: { action?: string }): void {
    this.cameras.main.setBackgroundColor('#2b1810');

    // Handle scene resume from RewardScene
    if (data?.action === 'new_run' || !this.state) {
      this.startNewRun();
    }
    this.createUI();
    this.renderHand();
    this.updateUI();
  }

  // Called when scene resumes from RewardScene
  private handleResume(sys: Phaser.Scenes.Systems, data: { action?: string; reward?: Reward }): void {
    if (data.action === 'reward_selected' && data.reward) {
      this.applyReward(data.reward);
    }
    // Either way, advance to next round or end run
    this.proceedAfterReward();
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
    const topBg = this.add.rectangle(0, 0, 1024, 60, 0x1a0f08, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xd4a574);

    this.uiText.round = this.add.text(20, 12, '', {
      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace',
    });
    this.uiText.score = this.add.text(180, 12, '', {
      fontSize: '16px', color: '#d4a574', fontFamily: 'monospace',
    });
    this.uiText.target = this.add.text(380, 12, '', {
      fontSize: '16px', color: '#c73e3a', fontFamily: 'monospace',
    });
    this.uiText.wall = this.add.text(620, 12, '', {
      fontSize: '16px', color: '#8b6f47', fontFamily: 'monospace',
    });
    this.uiText.phase = this.add.text(820, 12, '', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
    });

    // Relics display (top bar right)
    this.uiText.relics = this.add.text(820, 34, '', {
      fontSize: '11px', color: '#d4a574', fontFamily: 'monospace',
    });

    // Message area (center)
    this.messageText = this.add.text(512, 220, '', {
      fontSize: '24px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5);

    // Yaku info display (below message)
    this.yakuInfoText = this.add.text(512, 300, '', {
      fontSize: '14px', color: '#d4a574', fontFamily: 'monospace',
      align: 'center',
    }).setOrigin(0.5);

    // Action buttons
    this.createButton('draw', 512, 420, 'DRAW TILE', () => this.drawTile());
    this.createButton('riichi', 340, 420, 'RIICHI', () => this.declareRiichi());
    this.createButton('win', 684, 420, 'WIN!', () => this.declareWin(), true);
    this.createButton('nextRound', 512, 420, 'NEXT ROUND', () => this.triggerRewardScreen());
    this.createButton('newRun', 512, 420, 'NEW RUN', () => this.startNewRun());

    // Register resume handler (only once)
    this.events.removeAllListeners('resume');
    this.events.on('resume', (sys: Phaser.Scenes.Systems, data: { action?: string; reward?: Reward }) => {
      this.handleResume(sys, data);
    });
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
      fontSize: '14px', color: '#2b1810', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, text])
      .setSize(width, height)
      .setInteractive({ useHandCursor: true });

    container.on('pointerover', () => { bg.setScale(1.05); text.setScale(1.05); });
    container.on('pointerout', () => { bg.setScale(1); text.setScale(1); });
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

    const allTiles = getAllTiles(this.state.hand);
    const win = detectWin(allTiles);
    if (win) {
      this.showMessage('Tsumo! You can win with this tile!');
    }

    this.renderHand();
    this.updateUI();
  }

  private discardTile(tileId: string): void {
    if (this.state.phase !== 'drew') return;

    let discarded: Tile;
    if (this.state.hand.drawnTile && this.state.hand.drawnTile.id === tileId) {
      discarded = this.state.hand.drawnTile;
      this.state.hand.drawnTile = null;
    } else {
      const idx = this.state.hand.tiles.findIndex(t => t.id === tileId);
      if (idx === -1) return;
      discarded = this.state.hand.tiles[idx];
      this.state.hand.tiles.splice(idx, 1);
      if (this.state.hand.drawnTile) {
        this.state.hand.tiles.push(this.state.hand.drawnTile);
        this.state.hand.drawnTile = null;
      }
    }

    this.state.hand.tiles = sortHand(this.state.hand.tiles);
    this.state.discardedTiles.push(discarded);
    this.state.phase = 'idle';

    if (this.state.wall.remaining === 0) {
      this.endRound(false);
      return;
    }

    // Show tenpai hint if close to winning
    const waiting = findWaitingTiles(this.state.hand.tiles);
    if (waiting.length > 0 && !this.state.runState.isRiichi) {
      this.showYakuInfo(`Tenpai! Waiting for: ${waiting.length} tile type(s)`);
    } else {
      this.showYakuInfo('');
    }

    if (this.state.runState.isRiichi) {
      this.time.delayedCall(300, () => this.drawTile());
    }

    this.renderHand();
    this.updateUI();
  }

  private declareRiichi(): void {
    if (this.state.phase !== 'idle') return;
    if (this.state.runState.isRiichi) return;

    const waiting = findWaitingTiles(this.state.hand.tiles);
    if (waiting.length === 0) {
      this.showMessage('Not in tenpai! Cannot declare Riichi.');
      this.time.delayedCall(1500, () => this.showMessage(''));
      return;
    }

    this.state.runState.isRiichi = true;
    this.showMessage('Riichi! Auto-draw enabled.');
    this.showYakuInfo(`Waiting tiles: ${waiting.length}`);
    this.time.delayedCall(1500, () => this.showMessage(''));
    persistRun(this.state.runState);
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

    const yakuNames = score.yakuList.map(y => `${y.yaku.name} (${y.han}h)`).join(', ');
    this.showMessage(`WIN! +${score.finalScore} pts`);
    this.showYakuInfo(`${yakuNames}\nTotal: ${score.totalHan} han`);

    persistRun(this.state.runState);
    this.endRound(true);
  }

  private endRound(won: boolean): void {
    this.state.phase = won ? 'won' : 'lost';

    if (!won) {
      if (this.state.runState.score >= this.state.runState.targetScore) {
        this.showMessage(`Round survived! Score: ${this.state.runState.score}/${this.state.runState.targetScore}`);
      } else {
        // Game over - run failed
        this.showMessage(`Game Over! Score: ${this.state.runState.score}/${this.state.runState.targetScore}`);
        const meta = loadMeta();
        endRun(this.state.runState, false);
        this.time.delayedCall(2000, () => {
          this.scene.launch('GameOverScene', { runState: this.state.runState, won: false, meta });
          this.scene.pause();
        });
        return;
      }
    }

    persistRun(this.state.runState);
    this.renderHand();
    this.updateUI();
  }

  // ========== REWARD SYSTEM ==========

  private triggerRewardScreen(): void {
    if (this.state.phase !== 'won') return;

    // Check if run is complete
    if (checkRunComplete(this.state.runState)) {
      // Run won!
      const meta = loadMeta();
      endRun(this.state.runState, true);
      this.scene.launch('GameOverScene', { runState: this.state.runState, won: true, meta });
      this.scene.pause();
      return;
    }

    // Generate 3 rewards and show RewardScene
    const rewards = generateRewards(
      this.state.runState.relics.map(r => r.id),
      this.state.runState.customTiles.map(t => t.id),
      this.state.runState.unlockedYaku
    );

    this.state.phase = 'reward';
    this.scene.launch('RewardScene', { runState: this.state.runState, rewards });
    this.scene.pause();
  }

  private applyReward(reward: Reward): void {
    switch (reward.type) {
      case 'relic':
        this.state.runState = addRelicToRun(this.state.runState, reward.data as any);
        break;
      case 'customTile':
        this.state.runState = addCustomTileToRun(this.state.runState, reward.data as any);
        break;
      case 'yakuBoost':
        const boost = reward.data as { yaku: any; hanBonus: number };
        this.state.runState = applyYakuBoost(this.state.runState, boost.yaku.id, boost.hanBonus);
        break;
    }
    persistRun(this.state.runState);
  }

  private proceedAfterReward(): void {
    // Advance to next round
    this.state.runState = advanceRound(this.state.runState);
    this.state.wall = new TileWall();
    this.state.hand = createHand();
    this.state.discardedTiles = [];
    this.state.roundScore = 0;
    this.state.phase = 'idle';
    this.dealInitialHand();
    this.showMessage('');
    this.showYakuInfo('');
    this.renderHand();
    this.updateUI();
  }

  // ========== RENDERING ==========

  private renderHand(): void {
    this.tileSprites.forEach(s => s.destroy());
    this.tileSprites = [];

    const hand = this.state.hand;
    const tileSpacing = 4;
    const totalWidth = hand.tiles.length * (TILE_WIDTH + tileSpacing);
    const startX = 512 - totalWidth / 2;
    const y = 620;

    hand.tiles.forEach((tile, index) => {
      const x = startX + index * (TILE_WIDTH + tileSpacing);
      const sprite = this.createTileSprite(tile, x, y);
      this.tileSprites.push(sprite);
    });

    if (hand.drawnTile) {
      const drawnX = startX + hand.tiles.length * (TILE_WIDTH + tileSpacing) + 20;
      const sprite = this.createTileSprite(hand.drawnTile, drawnX, y, true);
      this.tileSprites.push(sprite);
    }

    this.renderDiscards();
  }

  private createTileSprite(tile: Tile, x: number, y: number, isDrawn: boolean = false): Phaser.GameObjects.Container {
    const textureKey = `tile-${tileKey(tile)}`;
    const sprite = this.add.image(0, 0, textureKey);
    const shadow = this.add.rectangle(2, 4, TILE_WIDTH, TILE_HEIGHT, 0x000000, 0.3);

    const container = this.add.container(x, y, [shadow, sprite]);
    container.setSize(TILE_WIDTH, TILE_HEIGHT);
    container.setInteractive({ useHandCursor: true });

    // Highlight drawn tile
    if (isDrawn) {
      const highlight = this.add.rectangle(0, 0, TILE_WIDTH + 4, TILE_HEIGHT + 4, 0xd4a574, 0.3);
      container.addAt(highlight, 0);
    }

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

  private showTileTooltip(tile: Tile, x: number, y: number): void {
    this.hideTooltip();
    const display = getTileDisplay(tile);

    this.tooltipBg = this.add.rectangle(x, y, 180, 70, 0x1a0f08, 0.95)
      .setStrokeStyle(2, 0xd4a574)
      .setDepth(1000);

    this.tooltipText = this.add.text(x, y, `${display.englishName}\n(${display.romaji})\n${display.westernHint}`, {
      fontSize: '12px', color: '#f5e6d3', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5).setDepth(1001);
  }

  private hideTooltip(): void {
    if (this.tooltipText) { this.tooltipText.destroy(); this.tooltipText = null; }
    if (this.tooltipBg) { this.tooltipBg.destroy(); this.tooltipBg = null; }
  }

  private renderDiscards(): void {
    const count = this.state.discardedTiles.length;
    if (this.uiText['discardCount']) {
      this.uiText['discardCount'].setText(`Discards: ${count}`);
    } else {
      this.uiText['discardCount'] = this.add.text(920, 80, `Discards: ${count}`, {
        fontSize: '12px', color: '#8b6f47', fontFamily: 'monospace',
      });
    }
  }

  private showMessage(msg: string): void {
    this.messageText.setText(msg);
  }

  private showYakuInfo(msg: string): void {
    this.yakuInfoText.setText(msg);
  }

  private updateUI(): void {
    const rs = this.state.runState;
    this.uiText.round.setText(`Round ${rs.round}/${rs.maxRounds}`);
    this.uiText.score.setText(`Score: ${rs.score}`);
    this.uiText.target.setText(`Target: ${rs.targetScore}`);
    this.uiText.wall.setText(`Wall: ${this.state.wall.remaining}`);

    const phaseLabels: Record<GamePhase, string> = {
      idle: 'Your Turn', drew: 'Discard or Win', won: 'Round Won!',
      lost: 'Round Over', round_end: 'Round End', reward: 'Pick Reward',
    };
    this.uiText.phase.setText(phaseLabels[this.state.phase]);

    // Relics display
    if (rs.relics.length > 0) {
      this.uiText.relics.setText(`Relics: ${rs.relics.length}`);
    } else {
      this.uiText.relics.setText('');
    }

    if (this.uiText['discardCount']) {
      this.uiText['discardCount'].setText(`Discards: ${this.state.discardedTiles.length}`);
    }

    this.hideAllButtons();
    switch (this.state.phase) {
      case 'idle':
        this.showButton('draw');
        if (!rs.isRiichi) this.showButton('riichi');
        break;
      case 'drew':
        const allTiles = getAllTiles(this.state.hand);
        if (detectWin(allTiles)) this.showButton('win');
        break;
      case 'won':
        this.showButton('nextRound');
        break;
      case 'lost':
        this.showButton('newRun');
        break;
    }
  }
}
