import Phaser from 'phaser';
import { GameConfig } from '@/config/game-config';
import { GameScene } from '@/scenes/GameScene';
import { BootScene } from '@/scenes/BootScene';
import { GameOverScene } from '@/scenes/GameOverScene';
import { DeckSelectScene } from '@/scenes/DeckSelectScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  const { width, height, backgroundColor, pixelArt } = GameConfig.canvas;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor,
    pixelArt,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
    },
    scene: [BootScene, DeckSelectScene, GameScene, GameOverScene],
  });
  (window as any).game = game;
  return game;
}
