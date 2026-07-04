import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'https://mahjong-roguelike.vercel.app/play.html';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 720 });

const client = await page.target().createCDPSession();
await client.send('Network.setBypassServiceWorker', { bypass: true });

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await sleep(3000);

const canvas = await page.$('canvas');
const box = await canvas.boundingBox();
console.log('Canvas:', box);
const scaleX = box.width / 1024;
const scaleY = box.height / 720;
console.log('Scale:', scaleX, scaleY);

// Click START QUIZ (canvas x=760, y=640)
await page.mouse.click(box.x + 760 * scaleX, box.y + 640 * scaleY);
console.log('Clicked START QUIZ');
await sleep(5000);

// Check game state
const state = await page.evaluate(() => {
  const scenes = window.game?.scene?.scenes;
  if (!scenes) return { error: 'no scenes' };
  const scene = scenes.find(s => s && s.scene && s.scene.key === 'GameScene');
  if (!scene) return { error: 'no GameScene' };
  const active = scene.scene.isActive();
  const visible = scene.scene.isVisible();
  return {
    active, visible,
    round: scene.round,
    score: scene.score,
    lives: scene.lives,
    relics: scene.relics,
    teachingMode: scene.teachingMode,
    isBeginner: scene.isBeginner,
    tutorialActive: scene.tutorialActive,
    scoreBox: (() => {
      const o = scene.children.getByName('scoreBox');
      return o ? { exists: true, visible: o.visible, alpha: o.alpha, x: o.x, y: o.y, depth: o.depth } : { exists: false };
    })(),
    relicBox: (() => {
      const o = scene.children.getByName('relicBox');
      return o ? { exists: true, visible: o.visible, alpha: o.alpha, x: o.x, y: o.y, depth: o.depth } : { exists: false };
    })(),
    scoreValue: (() => {
      const o = scene.children.getByName('scoreValue');
      return o ? { exists: true, text: o.text, visible: o.visible, x: o.x, y: o.y, depth: o.depth, color: o.style.color } : { exists: false };
    })(),
    relicLabel: (() => {
      const o = scene.children.getByName('relicLabel');
      return o ? { exists: true, text: o.text, visible: o.visible, x: o.x, y: o.y, depth: o.depth } : { exists: false };
    })(),
  };
});
console.log('Game state:', JSON.stringify(state, null, 2));

await page.screenshot({ path: 'screenshot_game.png' });
console.log('Screenshot saved');

await browser.close();
