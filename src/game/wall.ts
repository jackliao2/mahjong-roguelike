import { Tile, CustomTile } from '@/types';
import { createFullTileSet } from './tiles';

export class TileWall {
  private wall: Tile[] = [];
  private drawIndex = 0;
  private deadWall: Tile[] = [];
  private doraRevealed: Tile[] = [];

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

  /**
   * Reveal a dora indicator from the wall (used when riichi is declared).
   * Returns the indicator tile without removing it from the wall.
   * In real mahjong, dora indicators come from the dead wall; here we peek
   * a few tiles ahead to simulate flipping a dora indicator.
   */
  revealDoraIndicator(): Tile | null {
    // Peek 4 tiles ahead as the "dora indicator" position (simulates dead wall)
    const indicatorIdx = this.drawIndex + 4;
    if (indicatorIdx >= this.wall.length) return null;
    const indicator = this.wall[indicatorIdx];
    this.doraRevealed.push(indicator);
    return indicator;
  }

  get doraIndicators(): Tile[] {
    return [...this.doraRevealed];
  }

  /**
   * Return tiles to the wall and reshuffle the undrawn portion.
   * Used by beginner-friendly dealing to reject scattered hands.
   */
  returnTiles(tiles: Tile[]): void {
    this.wall.splice(this.drawIndex, 0, ...tiles);
    const undrawn = this.wall.slice(this.drawIndex);
    const shuffled = this.shuffle(undrawn);
    this.wall = [...this.wall.slice(0, this.drawIndex), ...shuffled];
  }

  /**
   * Draw a specific tile type from the undrawn wall if available.
   * Used by deterministic beginner hand construction.
   */
  drawSpecific(suit: string, rank: number): Tile | null {
    for (let i = this.drawIndex; i < this.wall.length; i++) {
      const t = this.wall[i];
      if (t.suit === suit && t.rank === rank) {
        this.wall.splice(i, 1);
        return t;
      }
    }
    return null;
  }

  /**
   * Get all remaining (undrawn) tiles. Useful for constructing hands.
   */
  getRemainingTiles(): Tile[] {
    return this.wall.slice(this.drawIndex);
  }

  /**
   * Move a specific tile type to a position near the front of the undrawn wall.
   * Used to guarantee beginner-friendly winning tiles appear early.
   */
  bringToFront(suit: string, rank: number, position: number = 0): Tile | null {
    const targetIndex = this.wall.findIndex((t, i) => i >= this.drawIndex && t.suit === suit && t.rank === rank);
    if (targetIndex === -1) return null;
    const [tile] = this.wall.splice(targetIndex, 1);
    const insertAt = Math.max(this.drawIndex, Math.min(this.drawIndex + position, this.wall.length));
    this.wall.splice(insertAt, 0, tile);
    return tile;
  }
}

