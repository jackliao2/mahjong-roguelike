import Phaser from 'phaser';
import { Tile } from '@/types';
import { getTileDisplay, tileKey } from '@/game/tiles';

export const TILE_WIDTH = 48;
export const TILE_HEIGHT = 64;
export const TILE_SCALE = 1;

// Colors matching the warm izakaya pixel-art palette
const COLORS = {
  tileBg: 0xf5e6d3,      // cream
  tileBgHover: 0xfff4e0,  // lighter cream
  tileBorder: 0x2b1810,   // dark wood
  tileShadow: 0x8b6f47,   // warm brown shadow
  man: 0x1a1a2e,          // dark ink for characters
  pin: 0x2c5f8a,          // blue for circles
  sou: 0x2d6a4f,          // green for bamboo
  wind: 0x5c4033,         // brown for winds
  dragon: 0xc73e3a,       // red for dragons
  accent: 0xd4a574,       // amber accent
};

/**
 * Generate a pixel-art mahjong tile texture in Phaser.
 * Each tile is rendered as a small canvas with the tile symbol.
 * Red five tiles get a special red-tinted background.
 * Custom tiles get a golden border.
 */
export function generateTileTexture(scene: Phaser.Scene, tile: Tile): string {
  const key = `tile-${tileKey(tile)}`;
  if (scene.textures.exists(key)) return key;

  const display = getTileDisplay(tile);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // Detect red five (custom tile with id starting 'red-five-')
  const isRedFive = tile.id.startsWith('red-five-');
  // Detect golden/custom tile (any non-red custom tile)
  const isCustomTile = tile.id.startsWith('golden-') || tile.id.startsWith('lucky-');

  // Tile background — red fives get a pinkish tint, custom tiles get a golden tint
  const bgColor = isRedFive ? 0xf5d5d0 : isCustomTile ? 0xfff4d0 : COLORS.tileBg;
  g.fillStyle(bgColor, 1);
  g.fillRect(2, 2, TILE_WIDTH - 4, TILE_HEIGHT - 4);

  // Top highlight (pixel bevel)
  g.fillStyle(0xffffff, 0.3);
  g.fillRect(2, 2, TILE_WIDTH - 4, 2);
  g.fillRect(2, 2, 2, TILE_HEIGHT - 4);

  // Bottom shadow
  g.fillStyle(COLORS.tileShadow, 0.5);
  g.fillRect(2, TILE_HEIGHT - 4, TILE_WIDTH - 4, 2);
  g.fillRect(TILE_WIDTH - 4, 2, 2, TILE_HEIGHT - 4);

  // Border — red fives get red border, custom tiles get gold border
  if (isRedFive) {
    g.lineStyle(2, COLORS.dragon, 1);
  } else if (isCustomTile) {
    g.lineStyle(2, 0xe5b567, 1);
  } else {
    g.lineStyle(2, COLORS.tileBorder, 1);
  }
  g.strokeRect(1, 1, TILE_WIDTH - 2, TILE_HEIGHT - 2);

  // Draw suit-specific symbol
  // Red fives: always render the 5 in red regardless of suit
  const colorCode = isRedFive ? COLORS.dragon : getColorForSuit(display.suit);
  drawTileSymbol(g, tile, colorCode);

  // Red five: add a small "DORA" indicator dot in the corner
  if (isRedFive) {
    g.fillStyle(COLORS.dragon, 1);
    g.fillCircle(TILE_WIDTH - 7, 7, 2);
  }
  // Custom tiles: add a small star sparkle in the corner
  if (isCustomTile) {
    g.fillStyle(0xe5b567, 1);
    g.fillRect(TILE_WIDTH - 8, 5, 2, 2);
    g.fillRect(TILE_WIDTH - 6, 7, 2, 2);
    g.fillRect(TILE_WIDTH - 8, 9, 2, 2);
  }

  g.generateTexture(key, TILE_WIDTH, TILE_HEIGHT);
  g.destroy();

  return key;
}

function getColorForSuit(suit: string): number {
  switch (suit) {
    case 'man': return COLORS.man;
    case 'pin': return COLORS.pin;
    case 'sou': return COLORS.sou;
    case 'wind': return COLORS.wind;
    case 'dragon': return COLORS.dragon;
    default: return COLORS.tileBorder;
  }
}

function drawTileSymbol(g: Phaser.GameObjects.Graphics, tile: Tile, color: number): void {
  const cx = TILE_WIDTH / 2;
  const cy = TILE_HEIGHT / 2;

  if (tile.suit === 'man') {
    // Draw number + "Char" text representation using rectangles
    drawNumber(g, tile.rank, cx, cy - 8, color);
    drawSmallText(g, 'CHAR', cx, cy + 16, color);
  } else if (tile.suit === 'pin') {
    // Draw dots (circles) arranged in traditional pattern
    drawDots(g, tile.rank, cx, cy, color);
  } else if (tile.suit === 'sou') {
    // Draw bamboo sticks
    drawBamboo(g, tile.rank, cx, cy, color);
  } else if (tile.suit === 'wind') {
    drawWindSymbol(g, tile.rank, cx, cy, color);
  } else if (tile.suit === 'dragon') {
    drawDragonSymbol(g, tile.rank, cx, cy, color);
  }
}

function drawNumber(g: Phaser.GameObjects.Graphics, num: number, cx: number, cy: number, color: number): void {
  g.fillStyle(color, 1);
  // Draw the number using simple pixel blocks
  const str = num.toString();
  const charWidth = 6;
  const startX = cx - (str.length * charWidth) / 2;
  for (let i = 0; i < str.length; i++) {
    drawPixelDigit(g, parseInt(str[i]), startX + i * charWidth, cy, color);
  }
}

function drawPixelDigit(g: Phaser.GameObjects.Graphics, digit: number, x: number, y: number, color: number): void {
  // Simple 3x5 pixel font for digits 1-9
  const fonts: Record<number, number[][]> = {
    1: [[0,1,0],[1,1,0],[0,1,0],[0,1,0],[1,1,1]],
    2: [[1,1,0],[0,0,1],[0,1,0],[1,0,0],[1,1,1]],
    3: [[1,1,0],[0,0,1],[0,1,0],[0,0,1],[1,1,0]],
    4: [[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1]],
    5: [[1,1,1],[1,0,0],[1,1,0],[0,0,1],[1,1,0]],
    6: [[1,1,1],[1,0,0],[1,1,1],[1,0,1],[1,1,1]],
    7: [[1,1,1],[0,0,1],[0,1,0],[0,1,0],[0,1,0]],
    8: [[1,1,1],[1,0,1],[1,1,1],[1,0,1],[1,1,1]],
    9: [[1,1,1],[1,0,1],[1,1,1],[0,0,1],[1,1,1]],
  };
  const font = fonts[digit];
  if (!font) return;
  const pixelSize = 2;
  g.fillStyle(color, 1);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (font[row][col]) {
        g.fillRect(x + col * pixelSize, y + row * pixelSize, pixelSize, pixelSize);
      }
    }
  }
}

function drawSmallText(g: Phaser.GameObjects.Graphics, text: string, cx: number, cy: number, color: number): void {
  // Draw small label text using simple rectangles (very basic)
  g.fillStyle(color, 0.6);
  const charWidth = 3;
  const startX = cx - (text.length * charWidth) / 2;
  for (let i = 0; i < text.length; i++) {
    g.fillRect(startX + i * charWidth, cy, 2, 2);
  }
}

function drawDots(g: Phaser.GameObjects.Graphics, count: number, cx: number, cy: number, color: number): void {
  g.fillStyle(color, 1);
  const dotSize = 4;
  const spacing = 10;

  // Simple grid arrangement
  const positions = getDotPositions(count);
  for (const [dx, dy] of positions) {
    g.fillCircle(cx + dx, cy + dy, dotSize);
  }
}

function getDotPositions(count: number): [number, number][] {
  switch (count) {
    case 1: return [[0, 0]];
    case 2: return [[-6, -6], [6, 6]];
    case 3: return [[-8, -8], [0, 0], [8, 8]];
    case 4: return [[-6, -6], [6, -6], [-6, 6], [6, 6]];
    case 5: return [[-8, -8], [8, -8], [0, 0], [-8, 8], [8, 8]];
    case 6: return [[-6, -10], [6, -10], [-6, 0], [6, 0], [-6, 10], [6, 10]];
    case 7: return [[0, -12], [-6, -4], [6, -4], [-8, 4], [0, 4], [8, 4], [0, 12]];
    case 8: return [[-6, -12], [6, -12], [-8, -4], [0, -4], [8, -4], [-6, 4], [6, 4], [0, 12]];
    case 9: return [[-8, -12], [0, -12], [8, -12], [-8, 0], [0, 0], [8, 0], [-8, 12], [0, 12], [8, 12]];
    default: return [[0, 0]];
  }
}

function drawBamboo(g: Phaser.GameObjects.Graphics, count: number, cx: number, cy: number, color: number): void {
  g.fillStyle(color, 1);
  const positions = getDotPositions(count);
  for (const [dx, dy] of positions) {
    // Draw a small vertical bamboo stick
    g.fillRect(cx + dx - 1, cy + dy - 4, 2, 8);
    // Small node line
    g.fillRect(cx + dx - 2, cy + dy - 1, 4, 1);
  }
}

function drawWindSymbol(g: Phaser.GameObjects.Graphics, rank: number, cx: number, cy: number, color: number): void {
  g.fillStyle(color, 1);
  // Draw large letter for wind direction
  const letters = ['E', 'S', 'W', 'N'];
  const letter = letters[rank - 1] || '?';
  drawPixelLetter(g, letter, cx - 6, cy - 8, color);
}

function drawDragonSymbol(g: Phaser.GameObjects.Graphics, rank: number, cx: number, cy: number, color: number): void {
  g.fillStyle(color, 1);
  if (rank === 1) {
    // Red dragon - draw a red rectangle (simplified 中)
    g.fillRect(cx - 8, cy - 10, 16, 20);
    g.fillStyle(COLORS.tileBg, 1);
    g.fillRect(cx - 4, cy - 6, 8, 12);
  } else if (rank === 2) {
    // White dragon - draw a border rectangle (simplified 白)
    g.lineStyle(2, color, 1);
    g.strokeRect(cx - 8, cy - 10, 16, 20);
  } else if (rank === 3) {
    // Green dragon - draw green rectangle (simplified 發)
    g.fillRect(cx - 7, cy - 10, 14, 20);
    g.fillStyle(COLORS.tileBg, 1);
    g.fillRect(cx - 3, cy - 6, 6, 4);
    g.fillRect(cx - 3, cy + 2, 6, 4);
  }
}

function drawPixelLetter(g: Phaser.GameObjects.Graphics, letter: string, x: number, y: number, color: number): void {
  // Simple 5x7 pixel font for E, S, W, N
  const fonts: Record<string, number[][]> = {
    E: [[1,1,1],[1,0,0],[1,1,0],[1,0,0],[1,0,0]],
    S: [[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
    W: [[1,0,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
    N: [[1,0,1],[1,1,1],[1,1,1],[1,0,1],[1,0,1]],
  };
  const font = fonts[letter];
  if (!font) return;
  const pixelSize = 3;
  g.fillStyle(color, 1);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (font[row][col]) {
        g.fillRect(x + col * pixelSize, y + row * pixelSize, pixelSize, pixelSize);
      }
    }
  }
}

/**
 * Generate all tile textures for the game.
 */
export function generateAllTileTextures(scene: Phaser.Scene): void {
  const suits: Array<{ suit: string; max: number }> = [
    { suit: 'man', max: 9 },
    { suit: 'pin', max: 9 },
    { suit: 'sou', max: 9 },
    { suit: 'wind', max: 4 },
    { suit: 'dragon', max: 3 },
  ];
  for (const { suit, max } of suits) {
    for (let rank = 1; rank <= max; rank++) {
      const tile: Tile = { suit: suit as Tile['suit'], rank, id: `template-${suit}-${rank}` };
      generateTileTexture(scene, tile);
    }
  }
}
