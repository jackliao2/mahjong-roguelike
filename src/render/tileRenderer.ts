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
  man: 0x1a1a2e,          // dark ink for numbers
  pin: 0x2c5f8a,          // blue for circles
  sou: 0x2d6a4f,          // green for bamboo
  wind: 0x5c4033,         // brown for winds
  dragon: 0xc73e3a,       // red for dragons
  accent: GameConfig.colors.amber,  // amber accent
  wanRed: 0xc73e3a,       // red for 萬 character (traditional mahjong)
};

// ===== Canvas-based graphics wrapper (mimics Phaser.Graphics API) =====
interface Gfx {
  fillStyle(color: number, alpha: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  lineStyle(width: number, color: number, alpha: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
}

function hexToRgba(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

function createCanvasGfx(ctx: CanvasRenderingContext2D): Gfx {
  return {
    fillStyle(color: number, alpha: number): void {
      ctx.fillStyle = hexToRgba(color, alpha);
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      ctx.fillRect(x, y, w, h);
    },
    lineStyle(width: number, color: number, alpha: number): void {
      ctx.lineWidth = width;
      ctx.strokeStyle = hexToRgba(color, alpha);
    },
    strokeRect(x: number, y: number, w: number, h: number): void {
      ctx.strokeRect(x, y, w, h);
    },
  };
}

/**
 * Generate a pixel-art mahjong tile texture using HTML5 canvas.
 * Canvas allows mixing pixel-art (fillRect) with text (fillText) for 萬 characters.
 */
export function generateTileTexture(scene: Phaser.Scene, tile: Tile): string {
  const key = `tile-${tileKey(tile)}`;
  if (scene.textures.exists(key)) return key;

  const display = getTileDisplay(tile);
  const isRedFive = tile.id.startsWith('red-five-');
  const isCustomTile = tile.id.startsWith('golden-') || tile.id.startsWith('lucky-');

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = TILE_WIDTH;
  canvas.height = TILE_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const g = createCanvasGfx(ctx);

  // Tile background
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

  // Border
  if (isRedFive) {
    g.lineStyle(2, COLORS.dragon, 1);
  } else if (isCustomTile) {
    g.lineStyle(2, 0xe5b567, 1);
  } else {
    g.lineStyle(2, COLORS.tileBorder, 1);
  }
  g.strokeRect(1, 1, TILE_WIDTH - 2, TILE_HEIGHT - 2);

  // Draw suit-specific symbol
  const colorCode = isRedFive ? COLORS.dragon : getColorForSuit(display.suit);
  drawTileSymbol(g, ctx, tile, colorCode);

  // Red five: DORA indicator dot in corner
  if (isRedFive) {
    drawPixelCircle(g, TILE_WIDTH - 7, 7, 2, COLORS.dragon);
  }
  // Custom tiles: star sparkle in corner
  if (isCustomTile) {
    g.fillStyle(0xe5b567, 1);
    g.fillRect(TILE_WIDTH - 8, 5, 2, 2);
    g.fillRect(TILE_WIDTH - 6, 7, 2, 2);
    g.fillRect(TILE_WIDTH - 8, 9, 2, 2);
  }

  // Register canvas as Phaser texture
  scene.textures.addCanvas(key, canvas);
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

function drawTileSymbol(g: Gfx, ctx: CanvasRenderingContext2D, tile: Tile, color: number): void {
  const cx = TILE_WIDTH / 2;
  const cy = TILE_HEIGHT / 2;

  if (tile.suit === 'man') {
    // Draw Arabic number at top (in suit color)
    drawNumber(g, tile.rank, cx, cy - 20, color);
    // Draw traditional Chinese 萬 character in red below (like real mahjong tiles)
    ctx.fillStyle = hexToRgba(COLORS.wanRed, 1);
    ctx.font = 'bold 18px "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "SimHei", "Noto Sans CJK SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('萬', cx, cy + 14);
  } else if (tile.suit === 'pin') {
    drawDots(g, tile.rank, cx, cy, color);
  } else if (tile.suit === 'sou') {
    drawBamboo(g, tile.rank, cx, cy, color);
  } else if (tile.suit === 'wind') {
    drawWindSymbol(g, tile.rank, cx, cy, color);
  } else if (tile.suit === 'dragon') {
    drawDragonSymbol(g, tile.rank, cx, cy, color);
  }
}

function drawNumber(g: Gfx, num: number, cx: number, cy: number, color: number): void {
  g.fillStyle(color, 1);
  const str = num.toString();
  const charWidth = 9;
  const startX = cx - (str.length * charWidth) / 2;
  for (let i = 0; i < str.length; i++) {
    drawPixelDigit(g, parseInt(str[i]), startX + i * charWidth, cy, color);
  }
}

function drawPixelDigit(g: Gfx, digit: number, x: number, y: number, color: number): void {
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

// ===== Pin (筒/circles) =====
function drawDots(g: Gfx, count: number, cx: number, cy: number, color: number): void {
  // 1-pin: traditional large single circle with bold ring + center dot
  if (count === 1) {
    drawPixelCircle(g, cx, cy, 15, color);
    g.fillStyle(0xf5e6d3, 1);
    drawPixelCircle(g, cx, cy, 8, 0xf5e6d3);
    g.fillStyle(color, 1);
    drawPixelCircle(g, cx, cy, 4, color);
    return;
  }

  // 2-9 pin: radius depends on count to prevent overlap
  const positions = getDotPositions(count);
  // Use smaller dots when more dots need to fit
  const radius = count <= 5 ? 7 : 5;
  for (const [dx, dy] of positions) {
    const px = cx + dx;
    const py = cy + dy;
    drawPixelCircle(g, px, py, radius, color);
    // Small cream highlight makes dots look rounded and readable
    g.fillStyle(0xffffff, 0.35);
    drawPixelCircle(g, px - 2, py - 2, 2, 0xffffff);
    g.fillStyle(color, 1);
  }
}

// Pixel-art style circle using filled rectangles (sharp, no anti-aliasing blur)
function drawPixelCircle(g: Gfx, cx: number, cy: number, radius: number, color: number): void {
  g.fillStyle(color, 1);
  const r = radius;
  for (let dy = -r; dy <= r; dy++) {
    const chord = Math.floor(Math.sqrt(r * r - dy * dy));
    g.fillRect(cx - chord, cy + dy, chord * 2 + 1, 1);
  }
}

function getDotPositions(count: number): [number, number][] {
  // Tile inner area: ~52 wide × ~68 tall. Center at (0,0).
  // Layouts follow traditional mahjong tile designs.
  switch (count) {
    case 1: return [[0, 0]];
    // 2: vertical pair
    case 2: return [[0, -10], [0, 10]];
    // 3: diagonal line (top-left, center, bottom-right)
    case 3: return [[-9, -10], [0, 0], [9, 10]];
    // 4: 2x2 grid
    case 4: return [[-9, -10], [9, -10], [-9, 10], [9, 10]];
    // 5: 4 corners + center
    case 5: return [[-9, -10], [9, -10], [0, 0], [-9, 10], [9, 10]];
    // 6-pin: two vertical columns of three dots.
    case 6: return [
      [-13, -16], [13, -16],
      [-13, 0], [13, 0],
      [-13, 16], [13, 16],
    ];
    // 7-pin: 6-pin layout with a center dot.
    case 7: return [
      [-13, -16], [13, -16],
      [-13, 0], [13, 0],
      [0, 0],
      [-13, 16], [13, 16],
    ];
    // 8: 4-4 (4 top, 4 bottom) — traditional 八筒
    case 8: return [
      [-18, -10], [-6, -10], [6, -10], [18, -10],
      [-18, 10], [-6, 10], [6, 10], [18, 10],
    ];
    // 9: 3-3-3 (3 rows of 3) — traditional 九筒
    case 9: return [
      [-11, -13], [0, -13], [11, -13],
      [-11, 0], [0, 0], [11, 0],
      [-11, 13], [0, 13], [11, 13],
    ];
    default: return [[0, 0]];
  }
}

// ===== Sou (索/bamboo) =====
function drawBamboo(g: Gfx, count: number, cx: number, cy: number, color: number): void {
  g.fillStyle(color, 1);
  const positions = getBambooPositions(count);
  for (const [dx, dy] of positions) {
    drawBambooStick(g, cx + dx, cy + dy, color);
  }
}

function drawBambooStick(g: Gfx, x: number, y: number, color: number): void {
  g.fillStyle(color, 1);
  // Main stalk (thicker, rounded)
  g.fillRect(x - 2, y - 8, 4, 16);
  g.fillRect(x - 3, y - 6, 6, 12);
  // Bamboo nodes (two horizontal bands)
  g.fillRect(x - 4, y - 3, 8, 2);
  g.fillRect(x - 4, y + 3, 8, 2);
  // Subtle highlight on left edge
  g.fillStyle(0xffffff, 0.25);
  g.fillRect(x - 1, y - 7, 1, 14);
  g.fillStyle(color, 1);
}

function getBambooPositions(count: number): [number, number][] {
  const s = 14;
  switch (count) {
    case 1: return [[0, 0]];
    case 2: return [[0, -s * 0.55], [0, s * 0.55]];
    case 3: return [[-s * 0.55, -s * 0.55], [0, 0], [s * 0.55, s * 0.55]];
    case 4: return [[-s * 0.5, -s * 0.5], [s * 0.5, -s * 0.5], [-s * 0.5, s * 0.5], [s * 0.5, s * 0.5]];
    case 5: return [[-s * 0.55, -s * 0.55], [s * 0.55, -s * 0.55], [0, 0], [-s * 0.55, s * 0.55], [s * 0.55, s * 0.55]];
    // 6索: 3 columns × 2 rows (3 top, 3 bottom) — traditional 六索
    case 6: return [
      [-s, -s * 0.7], [0, -s * 0.7], [s, -s * 0.7],
      [-s, s * 0.7], [0, s * 0.7], [s, s * 0.7],
    ];
    // 7索: single stick on top + 3+3 below — user requested "那单独条是在上面的"
    case 7: return [
      [0, -s * 1.3],
      [-s, 0], [0, 0], [s, 0],
      [-s, s * 1.3], [0, s * 1.3], [s, s * 1.3],
    ];
    // 8索: 3-2-3 layout (3 top, 2 middle, 3 bottom) — traditional 八索
    case 8: return [
      [-s, -s], [0, -s], [s, -s],
      [-s * 0.5, 0], [s * 0.5, 0],
      [-s, s], [0, s], [s, s],
    ];
    case 9: return [
      [-s, -s], [0, -s], [s, -s],
      [-s, 0], [0, 0], [s, 0],
      [-s, s], [0, s], [s, s],
    ];
    default: return [[0, 0]];
  }
}

// ===== Winds =====
function drawWindSymbol(g: Gfx, rank: number, cx: number, cy: number, color: number): void {
  g.fillStyle(color, 1);
  const letters = ['E', 'S', 'W', 'N'];
  const letter = letters[rank - 1] || '?';
  drawPixelLetter(g, letter, cx - 8, cy - 10, color);
}

// ===== Dragons =====
function drawDragonSymbol(g: Gfx, rank: number, cx: number, cy: number, color: number): void {
  g.fillStyle(color, 1);
  if (rank === 1) {
    // Red dragon - simplified 中
    g.fillRect(cx - 11, cy - 14, 22, 28);
    g.fillStyle(COLORS.tileBg, 1);
    g.fillRect(cx - 6, cy - 8, 12, 16);
  } else if (rank === 2) {
    // White dragon - simplified 白
    g.lineStyle(3, color, 1);
    g.strokeRect(cx - 11, cy - 14, 22, 28);
  } else if (rank === 3) {
    // Green dragon - simplified 發
    g.fillRect(cx - 10, cy - 14, 20, 28);
    g.fillStyle(COLORS.tileBg, 1);
    g.fillRect(cx - 5, cy - 8, 10, 6);
    g.fillRect(cx - 5, cy + 2, 10, 6);
  }
}

function drawPixelLetter(g: Gfx, letter: string, x: number, y: number, color: number): void {
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
