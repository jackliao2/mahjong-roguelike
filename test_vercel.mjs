import puppeteer from 'puppeteer-core';

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

  // Bypass service worker
  const client = await page.target().createCDPSession();
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // Check if SW is registered
  const swInfo = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map(r => ({ scope: r.scope, active: r.active?.scriptURL }));
  });
  console.log('Service Workers:', JSON.stringify(swInfo));

  // Unregister all SWs
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // Set tutorial seen and start game
  await page.evaluate(() => {
    localStorage.setItem('mjrg_tutorial_seen', '1');
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.key === 'DeckSelectScene');
    if (scene) {
      scene.scene.start('GameScene', { action: 'new_run', difficulty: 'beginner' });
    }
  });
  await sleep(3000);

  // Check game state
  const state = await page.evaluate(() => {
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.isActive() && s.scene.key === 'GameScene');
    if (!scene) return { error: 'no GameScene', active: scenes?.map(s => s?.scene?.key) };

    const els = {};
    for (const name of ['topBarBg', 'scoreBox', 'scoreValue', 'relicBox', 'relicLabel', 'livesLabel', 'roundLabel']) {
      const o = scene.children.getByName(name);
      els[name] = o ? { type: o.type, visible: o.visible, alpha: o.alpha, x: o.x, y: o.y, depth: o.depth, text: o.text } : null;
    }
    return { teachingMode: scene.teachingMode, tutorialActive: scene.tutorialActive, els };
  });
  console.log('Vercel state:', JSON.stringify(state, null, 2));

  await page.screenshot({ path: 'vercel_game.png', fullPage: false });
  console.log('Saved vercel_game.png');

} catch (err) {
  console.error('Test failed:', err.message);
} finally {
  await browser.close();
}
