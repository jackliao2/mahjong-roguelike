import puppeteer from 'puppeteer-core';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'https://mahjong-roguelike.vercel.app/play.html';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,800'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const client = await page.target().createCDPSession();
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(4000);

  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
    if (window.caches) {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(4000);

  await page.evaluate(() => {
    localStorage.setItem('mjrg_tutorial_seen', '1');
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.key === 'DeckSelectScene');
    if (scene) {
      scene.scene.start('GameScene', { action: 'new_run', difficulty: 'beginner' });
    }
  });
  await sleep(5000);

  // Read pixel colors directly from the game canvas
  const pixelColors = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { error: 'no ctx' };
    const w = canvas.width;
    const h = canvas.height;
    const scaleX = w / 1024;
    const scaleY = h / 720;

    const points = [
      { name: 'topBarBg-center', x: 512, y: 30 },
      { name: 'scoreBox-center', x: 420, y: 30 },
      { name: 'scoreValue-0', x: 345, y: 38 },
      { name: 'relicBox-center', x: 640, y: 30 },
      { name: 'relicLabel', x: 555, y: 38 },
      { name: 'livesLabel', x: 25, y: 40 },
      { name: 'roundLabel', x: 25, y: 22 },
      { name: 'background-middle', x: 512, y: 400 },
      { name: 'background-top', x: 512, y: 100 },
    ];

    const results = {};
    for (const p of points) {
      const px = Math.floor(p.x * scaleX);
      const py = Math.floor(p.y * scaleY);
      const data = ctx.getImageData(px, py, 1, 1).data;
      results[p.name] = {
        gameX: p.x, gameY: p.y,
        canvasX: px, canvasY: py,
        r: data[0], g: data[1], b: data[2], a: data[3],
        hex: '#' + [data[0], data[1], data[2]].map(v => v.toString(16).padStart(2, '0')).join(''),
      };
    }

    // Also sample a horizontal strip at y=30 to see the top bar
    const strip = [];
    for (let gx = 0; gx <= 1024; gx += 32) {
      const px = Math.floor(gx * scaleX);
      const py = Math.floor(30 * scaleY);
      const data = ctx.getImageData(px, py, 1, 1).data;
      strip.push({ x: gx, hex: '#' + [data[0], data[1], data[2]].map(v => v.toString(16).padStart(2, '0')).join('') });
    }

    return { canvasW: w, canvasH: h, scaleX, scaleY, points: results, strip };
  });
  console.log('Pixel colors:', JSON.stringify(pixelColors, null, 2));

  await page.screenshot({ path: 'game_verify.png', fullPage: false });
  console.log('Saved game_verify.png');

  // Also crop just the top bar region
  const canvasRect = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
  // Top bar is at game y=5 to y=55
  const tbTop = canvasRect.top + 5 * (canvasRect.height / 720);
  const tbHeight = 50 * (canvasRect.height / 720);
  await page.screenshot({
    path: 'topbar_crop.png',
    clip: { x: canvasRect.left, y: tbTop, width: canvasRect.width, height: tbHeight },
  });
  console.log('Saved topbar_crop.png');

} catch (err) {
  console.error('Test failed:', err.message);
} finally {
  await browser.close();
}
