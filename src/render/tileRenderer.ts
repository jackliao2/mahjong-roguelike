import Phaser from 'phaser';
import { Tile } from '@/types';
import { getTileDisplay, tileKey } from '@/game/tiles';

import { GameConfig } from '@/config/game-config';

export const TILE_WIDTH = GameConfig.tiles.width;
export const TILE_HEIGHT = GameConfig.tiles.height;
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
  accent: GameConfig.colors.amber,  // amber accent
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
  const charWidth = 9;
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

function drawSmallText(g: Phaser.GameObjects.Graphics, text: string, cx: number, cy: number, color: number): void {
  // Draw small label text using simple rectangles (very basic)
  g.fillStyle(color, 0.7);
  const charWidth = 5;
  const startX = cx - (text.length * charWidth) / 2;
  for (let i = 0; i < text.length; i++) {
    g.fillRect(startX + i * charWidth, cy, 3, 3);
  }
}

function drawDots(g: Phaser.GameObjects.Graphics, count: number, cx: number, cy: number, color: number): void {
  g.fillStyle(color, 1);
  // 1-pin: traditional large single circle (like a real mahjong tile)
  if (count === 1) {
    drawPixelCircle(g, cx, cy, 13, color);
    // Inner highlight ring (traditional 1-pin has a ring shape)
    g.fillStyle(0xf5e6d3, 1);
    drawPixelCircle(g, cx, cy, 6, 0xf5e6d3);
    g.fillStyle(color, 1);
    drawPixelCircle(g, cx, cy, 3, color);
    return;
  }
  // 2-9 pin: standard dot arrangements
  const spacing = 14;
  const positions = getDotPositions(count);
  for (const [dx, dy] of positions) {
    drawPixelCircle(g, cx + dx, cy + dy, 7, color);
  }
}

// Pixel-art style circle using filled rectangles (sharp, no anti-aliasing blur)
function drawPixelCircle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number, color: number): void {
  g.fillStyle(color, 1);
  const r = radius;
  // Draw horizontal scanlines to form a circle
  for (let dy = -r; dy <= r; dy++) {
    const chord = Math.floor(Math.sqrt(r * r - dy * dy));
    g.fillRect(cx - chord, cy + dy, chord * 2 + 1, 1);
  }
}

function getDotPositions(count: number): [number, number][] {
  const s = 13; // spacing
  switch (count) {
    case 1: return [[0, 0]];
    case 2: return [[-s/2, -s/2], [s/2, s/2]];
    case 3: return [[-s, -s], [0, 0], [s, s]];
    case 4: return [[-s/2, -s/2], [s/2, -s/2], [-s/2, s/2], [s/2, s/2]];
    case 5: return [[-s, -s], [s, -s], [0, 0], [-s, s], [s, s]];
    case 6: return [[-s/2, -s], [s/2, -s], [-s/2, 0], [s/2, 0], [-s/2, s], [s/2, s]];
    // 7筒：传统布局 — 上排3个 + 中排3个 + 下排1个居中（对称）
    case 7: return [[-s, -s], [0, -s], [s, -s], [-s, 0], [0, 0], [s, 0], [0, s]];
    // 8筒：传统布局 — 上排2个 + 中排4个 + 下排2个（对称）
    case 8: return [[-s/2, -s], [s/2, -s], [-s*1.2, 0], [-s*0.4, 0], [s*0.4, 0], [s*1.2, 0], [-s/2, s], [s/2, s]];
    case 9: return [[-s, -s], [0, -s], [s, -s], [-s, 0], [0, 0], [s, 0], [-s, s], [0, s], [s, s]];
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
  drawPixelLetter(g, letter, cx - 8, cy - 10, color);
}

function drawDragonSymbol(g: Phaser.GameObjects.Graphics, rank: number, cx: number, cy: number, color: number): void {
  g.fillStyle(color, 1);
  if (rank === 1) {
    // Red dragon - draw a red rectangle (simplified 中)
    g.fillRect(cx - 11, cy - 14, 22, 28);
    g.fillStyle(COLORS.tileBg, 1);
    g.fillRect(cx - 6, cy - 8, 12, 16);
  } else if (rank === 2) {
    // White dragon - draw a border rectangle (simplified 白)
    g.lineStyle(3, color, 1);
    g.strokeRect(cx - 11, cy - 14, 22, 28);
  } else if (rank === 3) {
    // Green dragon - draw green rectangle (simplified 發)
    g.fillRect(cx - 10, cy - 14, 20, 28);
    g.fillStyle(COLORS.tileBg, 1);
    g.fillRect(cx - 5, cy - 8, 10, 6);
    g.fillRect(cx - 5, cy + 2, 10, 6);
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
  const pixelSize = 4;
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
