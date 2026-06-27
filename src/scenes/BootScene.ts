import Phaser from 'phaser';
import { generateAllTileTextures } from '@/render/tileRenderer';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // No external assets to load - we generate everything procedurally
  }

  create(): void {
    // Generate all pixel-art tile textures
    generateAllTileTextures(this);

    // Transition to deck selection (player picks a build before each run)
    this.scene.start('DeckSelectScene');
  }
}
