import Phaser from 'phaser';
import { GameScene } from '@/scenes/GameScene';
import { BootScene } from '@/scenes/BootScene';
import { RewardScene } from '@/scenes/RewardScene';
import { GameOverScene } from '@/scenes/GameOverScene';

const GAME_WIDTH = 1024;
const GAME_HEIGHT = 720;

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#2b1810',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, GameScene, RewardScene, GameOverScene],
  });
}
