import { Tile, CustomTile } from '@/types';
import { createFullTileSet } from './tiles';

export class TileWall {
  private wall: Tile[] = [];
  private drawIndex = 0;
  private deadWall: Tile[] = [];

  constructor(customTiles: CustomTile[] = []) {
    // Start with standard 136-tile set
    let tiles = createFullTileSet();

    // Inject custom tiles (replace one copy of their base tile type)
    for (const custom of customTiles) {
      // Remove one matching base tile from the set, add the custom tile
      const baseKey = `${custom.baseTile.suit}-${custom.baseTile.rank}`;
      const replaceIdx = tiles.findIndex(t => `${t.suit}-${t.rank}` === baseKey);
      if (replaceIdx !== -1) {
        tiles[replaceIdx] = { ...custom.baseTile, id: custom.id };
      } else {
        // No matching tile to replace — just add it
        tiles.push({ ...custom.baseTile, id: custom.id });
      }
    }

    this.wall = this.shuffle(tiles);
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
