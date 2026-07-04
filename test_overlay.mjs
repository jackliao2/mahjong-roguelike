import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5175/play.html';

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

  // Check ALL DOM elements and their positions, especially anything covering the top of the canvas
  const domInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };
    const canvasRect = canvas.getBoundingClientRect();

    // Find ALL elements that overlap with the canvas top area (y 0-100 in viewport)
    const overlapping = [];
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el === canvas) continue;
      const rect = el.getBoundingClientRect();
      // Check if element overlaps with canvas top bar area
      if (rect.bottom > canvasRect.top && rect.top < canvasRect.top + 80) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) continue;
        overlapping.push({
          tag: el.tagName,
          id: el.id,
          className: el.className.toString().substring(0, 50),
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          zIndex: style.zIndex,
          position: style.position,
          opacity: style.opacity,
          pointerEvents: style.pointerEvents,
        });
      }
    }

    // Also check the body/html for any background or overlay
    const bodyStyle = window.getComputedStyle(document.body);

    return {
      canvasRect: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
      canvasStyle: {
        position: window.getComputedStyle(canvas).position,
        zIndex: window.getComputedStyle(canvas).zIndex,
      },
      overlappingElements: overlapping,
      bodyPadding: bodyStyle.padding,
      bodyMargin: bodyStyle.margin,
      viewportSize: { w: window.innerWidth, h: window.innerHeight },
    };
  });
  console.log('DOM info:', JSON.stringify(domInfo, null, 2));

  // Start game and take a screenshot showing the actual top bar
  await page.evaluate(() => {
    localStorage.setItem('mjrg_tutorial_seen', '1');
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.key === 'DeckSelectScene');
    if (scene) {
      scene.scene.start('GameScene', { action: 'new_run', difficulty: 'beginner' });
    }
  });
  await sleep(5000);

  // Read pixel colors using WebGL readPixels
  const pixelColors = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!gl) return { error: 'no webgl context' };

    const gameW = 1024, gameH = 720;
    const scaleX = canvas.width / gameW;
    const scaleY = canvas.height / gameH;

    // We need to render a frame first, then read pixels
    // Actually WebGL requires preserving the drawing buffer
    // Let's try a screenshot approach instead
    return {
      canvasW: canvas.width,
      canvasH: canvas.height,
      scaleX, scaleY,
      preserveDrawingBuffer: canvas.getContextAttributes?.()?.preserveDrawingBuffer,
    };
  });
  console.log('Canvas info:', JSON.stringify(pixelColors, null, 2));

  // Take a high-quality screenshot and save just the top portion
  const canvasRect = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });

  // Crop the top bar area (game y=0 to y=60)
  const scale = canvasRect.height / 720;
  await page.screenshot({
    path: 'topbar_region.png',
    clip: {
      x: canvasRect.left,
      y: canvasRect.top,
      width: canvasRect.width,
      height: 60 * scale,
    },
  });
  console.log('Saved topbar_region.png (game y=0 to y=60)');

  // Full screenshot
  await page.screenshot({ path: 'full_game.png', fullPage: false });
  console.log('Saved full_game.png');

  // Read the PNG file and extract pixel data manually
  const fs = await import('fs');
  const pngBuffer = fs.readFileSync('topbar_region.png');

  // Simple PNG header check - find the IHDR chunk to get dimensions
  const width = pngBuffer.readUInt32BE(16);
  const height = pngBuffer.readUInt32BE(20);
  console.log(`PNG dimensions: ${width}x${height}`);

  // Sample some pixels from the middle of the top bar
  // The top bar should be dark (0x0a0604), score box dark (0x1a1008)
  // score text gold (#e5b567 = 229, 181, 103)
  // lives text red (#c73e3a = 199, 62, 58)

  // We need to decode the PNG to get raw pixels. Let's use a simpler approach:
  // take tiny screenshots of specific regions
  const scoreRegion = {
    x: canvasRect.left + 420 * scale - 30,
    y: canvasRect.top + 30 * scale - 15,
    width: 60,
    height: 30,
  };
  await page.screenshot({ path: 'score_region.png', clip: scoreRegion });
  console.log('Saved score_region.png');

  const livesRegion = {
    x: canvasRect.left + 20 * scale - 10,
    y: canvasRect.top + 40 * scale - 15,
    width: 50,
    height: 30,
  };
  await page.screenshot({ path: 'lives_region.png', clip: livesRegion });
  console.log('Saved lives_region.png');

} catch (err) {
  console.error('Test failed:', err.message);
} finally {
  await browser.close();
}
