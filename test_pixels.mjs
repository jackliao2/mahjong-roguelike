import puppeteer from 'puppeteer-core';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173/play.html';

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
  await sleep(3000);

  await page.evaluate(() => {
    localStorage.setItem('mjrg_tutorial_seen', '1');
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.key === 'DeckSelectScene');
    if (scene) {
      scene.scene.start('GameScene', { action: 'new_run', difficulty: 'beginner' });
    }
  });
  await sleep(3000);

  // Wait for round intro to finish (2.5s)
  await sleep(3000);

  // Check pixel colors at top bar positions
  const pixelData = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const scale = canvas.width / 1024; // game uses 1024x720 logical

    const points = [
      { name: 'topBarBg', x: 512, y: 30 },
      { name: 'scoreBox-center', x: 420, y: 30 },
      { name: 'scoreValue', x: 340, y: 38 },
      { name: 'relicBox-center', x: 640, y: 30 },
      { name: 'relicLabel', x: 550, y: 38 },
      { name: 'livesLabel', x: 30, y: 40 },
      { name: 'roundLabel', x: 30, y: 22 },
      { name: 'background', x: 512, y: 400 },
    ];

    const results = {};
    for (const p of points) {
      const px = Math.floor(p.x * scale);
      const py = Math.floor(p.y * scale);
      const data = ctx.getImageData(px, py, 1, 1).data;
      results[p.name] = { x: p.x, y: p.y, r: data[0], g: data[1], b: data[2], a: data[3], hex: '#' + [data[0], data[1], data[2]].map(v => v.toString(16).padStart(2, '0')).join('') };
    }
    return { results, canvasW: w, canvasH: h, scale };
  });
  console.log('Pixel data:', JSON.stringify(pixelData, null, 2));

  await page.screenshot({ path: 'game_playing.png', fullPage: false });
  console.log('Saved game_playing.png');

  // Also check what's covering the top bar (if anything)
  const topObjects = await page.evaluate(() => {
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.isActive() && s.scene.key === 'GameScene');
    if (!scene) return { error: 'no GameScene' };

    // Get all display objects at y=30 area (y 10-50)
    const allObjects = [];
    scene.children.list.forEach(obj => {
      if (obj.y >= 0 && obj.y <= 60) {
        allObjects.push({
          name: obj.name || '(unnamed)',
          type: obj.type,
          x: obj.x,
          y: obj.y,
          depth: obj.depth,
          visible: obj.visible,
          alpha: obj.alpha,
          width: obj.width,
          height: obj.height,
        });
      }
    });
    // Sort by depth descending (highest depth = rendered on top)
    allObjects.sort((a, b) => b.depth - a.depth);
    return { objectsAtTopBar: allObjects };
  });
  console.log('Top bar objects:', JSON.stringify(topObjects, null, 2));

} catch (err) {
  console.error('Test failed:', err.message);
} finally {
  await browser.close();
}
