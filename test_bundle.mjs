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
  const client = await page.target().createCDPSession();
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  // Capture all JS bundle requests
  const jsBundles = [];
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('/assets/play-') && url.endsWith('.js')) {
      jsBundles.push(url);
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(4000);

  console.log('JS bundles loaded:', jsBundles);

  // Unregister SW fully
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
    if (window.caches) {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
  });

  // Hard reload to get fresh JS
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(4000);

  // Fetch the JS bundle content and check for depth 10000
  const bundleUrl = jsBundles[jsBundles.length - 1];
  if (bundleUrl) {
    console.log('Checking bundle:', bundleUrl);
    const content = await page.evaluate(async (url) => {
      const resp = await fetch(url);
      const text = await resp.text();
      return {
        length: text.length,
        hasDepth10000: text.includes('10000'),
        hasDepth500: text.includes('500'),
        hasSetDepth10000: text.includes('setDepth(10000)'),
        hasScoreBox: text.includes('scoreBox'),
        hasRelicBox: text.includes('relicBox'),
        hasNunito: text.includes('Nunito'),
        // Find context around 'scoreBox' to see what depth is used
        scoreBoxContext: text.substring(text.indexOf('scoreBox') - 100, text.indexOf('scoreBox') + 200),
      };
    }, bundleUrl);
    console.log('Bundle content check:', JSON.stringify(content, null, 2));
  }

  // Now start the game and check
  await page.evaluate(() => {
    localStorage.setItem('mjrg_tutorial_seen', '1');
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.key === 'DeckSelectScene');
    if (scene) {
      scene.scene.start('GameScene', { action: 'new_run', difficulty: 'beginner' });
    }
  });
  await sleep(5000);

  // Verify the actual depth values in the running game
  const depths = await page.evaluate(() => {
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.isActive() && s.scene.key === 'GameScene');
    if (!scene) return { error: 'no GameScene' };
    return {
      topBarBg: scene.children.getByName('topBarBg')?.depth,
      scoreBox: scene.children.getByName('scoreBox')?.depth,
      scoreValue: scene.children.getByName('scoreValue')?.depth,
      livesLabel: scene.children.getByName('livesLabel')?.depth,
      relicBox: scene.children.getByName('relicBox')?.depth,
      relicLabel: scene.children.getByName('relicLabel')?.depth,
      livesText: scene.children.getByName('livesLabel')?.text,
      scoreText: scene.children.getByName('scoreValue')?.text,
      relicText: scene.children.getByName('relicLabel')?.text,
    };
  });
  console.log('Actual depths in running game:', JSON.stringify(depths, null, 2));

  // Take screenshot
  await page.screenshot({ path: 'final_check.png', fullPage: false });
  console.log('Saved final_check.png');

} catch (err) {
  console.error('Test failed:', err.message);
} finally {
  await browser.close();
}
