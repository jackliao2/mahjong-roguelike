import Phaser from 'phaser';
import { GameConfig } from '@/config/game-config';
import { GameScene } from '@/scenes/GameScene';
import { BootScene } from '@/scenes/BootScene';
import { RewardScene } from '@/scenes/RewardScene';
import { GameOverScene } from '@/scenes/GameOverScene';
import { DeckSelectScene } from '@/scenes/DeckSelectScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  const { width, height, backgroundColor, pixelArt } = GameConfig.canvas;
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor,
    pixelArt,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, DeckSelectScene, GameScene, RewardScene, GameOverScene],
  });
}
