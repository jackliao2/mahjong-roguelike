import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1024, height: 720 });

// Disable service worker
await page.setBypassCSP(true);
const client = await page.target().createCDPSession();
await client.send('Network.setBypassServiceWorker', { bypass: true });

// Go to play.html
await page.goto('https://mahjong-roguelike.vercel.app/play.html', { waitUntil: 'networkidle0', timeout: 30000 });

// Wait for Phaser to load
await new Promise(r => setTimeout(r, 3000));

// Click BEGINNER card (first card)
const cards = await page.$$('div[id] canvas, canvas');
console.log('Found canvases:', cards.length);

// Click on the game canvas to select Beginner
const canvas = await page.$('canvas');
if (canvas) {
  const box = await canvas.boundingBox();
  console.log('Canvas at:', box);

  // Click START QUIZ button area (bottom right)
  // Based on DeckSelectScene: startX=760, y=640
  await page.mouse.click(box.x + 760, box.y + 640);
  console.log('Clicked START QUIZ');

  await new Promise(r => setTimeout(r, 3000));

  // Take screenshot
  await page.screenshot({ path: 'screenshot_game.png' });
  console.log('Screenshot saved');

  // Check if score is visible
  const pageContent = await page.content();
  const hasScore = pageContent.includes('SCORE') || pageContent.includes('score');
  console.log('Has SCORE in HTML:', hasScore);
}

await browser.close();
