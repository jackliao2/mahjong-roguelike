import { Tile } from '@/types';
import { createFullTileSet } from './tiles';

export class TileWall {
  private wall: Tile[] = [];
  private drawIndex = 0;
  private deadWall: Tile[] = []; // for kan/dora (not used in MVP but structure ready)

  constructor() {
    this.wall = this.shuffle(createFullTileSet());
    this.drawIndex = 0;
  }

  private shuffle(array: Tile[]): Tile[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  draw(): Tile | null {
    if (this.drawIndex >= this.wall.length) return null;
    return this.wall[this.drawIndex++];
  }

  get remaining(): number {
    return this.wall.length - this.drawIndex;
  }

  get totalTiles(): number {
    return this.wall.length;
  }

  // Peek at the next tile without drawing (for AI/debug)
  peek(): Tile | null {
    if (this.drawIndex >= this.wall.length) return null;
    return this.wall[this.drawIndex];
  }
}
