import puppeteer from 'puppeteer-core';
import fs from 'fs';

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
const scaleX = box.width / 1024;
const scaleY = box.height / 720;

// Click START QUIZ
await page.mouse.click(box.x + 760 * scaleX, box.y + 640 * scaleY);
await sleep(5000);

// Take screenshot and check pixels in score area
await page.screenshot({ path: 'screenshot_game.png' });

// Read screenshot and check pixel colors at score location
// Canvas coords: scoreBox at (420, 30), scoreValue at (340, 38)
// Screen coords: box.x + 420*scaleX, box.y + 38*scaleY
const scoreX = Math.round(box.x + 340 * scaleX);
const scoreY = Math.round(box.y + 38 * scaleY);
console.log('Score pixel location:', scoreX, scoreY);

// Check if the JS bundle has the new code
const scripts = await page.evaluate(() => {
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  return scripts.map(s => s.src);
});
console.log('Scripts:', scripts);

// Check the actual JS content for scoreBox
const jsContent = await page.evaluate(async () => {
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  for (const s of scripts) {
    if (s.src.includes('play')) {
      const res = await fetch(s.src);
      const text = await res.text();
      return {
        url: s.src,
        hasScoreBox: text.includes('scoreBox'),
        hasRelicBox: text.includes('relicBox'),
        hasNunito: text.includes('Nunito'),
        length: text.length,
      };
    }
  }
  return null;
});
console.log('JS Bundle:', JSON.stringify(jsContent, null, 2));

await browser.close();
