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

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(4000);

  // Unregister SW and clear caches
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

  // Set tutorial seen, start game
  await page.evaluate(() => {
    localStorage.setItem('mjrg_tutorial_seen', '1');
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.key === 'DeckSelectScene');
    if (scene) {
      scene.scene.start('GameScene', { action: 'new_run', difficulty: 'beginner' });
    }
  });

  // Wait for round intro to pass (3s) + question to render
  await sleep(5000);

  // Check state - make sure we're in the question phase (not intro)
  const state = await page.evaluate(() => {
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.isActive() && s.scene.key === 'GameScene');
    if (!scene) return { error: 'no GameScene' };

    // Check the topmost object at y=30 (top bar area)
    const allAtTop = [];
    scene.children.list.forEach(obj => {
      // Check if object overlaps top bar region (y 5-55)
      const objY = obj.y;
      const objH = obj.height || 0;
      if (objY >= 0 && objY <= 60) {
        allAtTop.push({
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
    allAtTop.sort((a, b) => b.depth - a.depth);

    // Also check containers - they might contain covering elements
    const containers = [];
    scene.children.list.forEach(obj => {
      if (obj.type === 'Container') {
        const children = obj.list || [];
        const coveringChildren = children.filter(c => c.y !== undefined && c.y >= 0 && c.y <= 720 && (c.depth || 0) >= 100);
        if (coveringChildren.length > 0) {
          containers.push({
            containerY: obj.y,
            containerDepth: obj.depth,
            containerVisible: obj.visible,
            childCount: children.length,
            sample: coveringChildren.slice(0, 5).map(c => ({
              type: c.type,
              x: c.x, y: c.y, depth: c.depth,
              visible: c.visible, alpha: c.alpha,
              width: c.width, height: c.height,
            })),
          });
        }
      }
    });

    return {
      round: scene.round,
      answered: scene.answered,
      hasQuestion: !!scene.currentQuestion,
      teachingMode: scene.teachingMode,
      topBarElements: {
        topBarBg_depth: scene.children.getByName('topBarBg')?.depth,
        scoreBox_depth: scene.children.getByName('scoreBox')?.depth,
        scoreValue_text: scene.children.getByName('scoreValue')?.text,
        scoreValue_depth: scene.children.getByName('scoreValue')?.depth,
        livesLabel_text: scene.children.getByName('livesLabel')?.text,
        relicLabel_text: scene.children.getByName('relicLabel')?.text,
      },
      objectsAtTopBar: allAtTop.slice(0, 15),
      coveringContainers: containers.slice(0, 5),
    };
  });
  console.log('State during question:', JSON.stringify(state, null, 2));

  // Take screenshot of the top portion (crop to top bar area)
  await page.screenshot({ path: 'game_full.png', fullPage: false });
  console.log('Saved game_full.png');

  // Also check: is there a DOM element overlaying the canvas?
  const domInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas?.getBoundingClientRect();
    // Check elements at top of canvas
    const elemAtTop = document.elementFromPoint(rect.left + 400, rect.top + 30);
    const elemAtScore = document.elementFromPoint(rect.left + 420, rect.top + 30);
    return {
      canvasRect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
      elementAtTopBar: elemAtTop?.tagName + '.' + elemAtTop?.className,
      elementAtScore: elemAtScore?.tagName + '.' + elemAtScore?.className,
    };
  });
  console.log('DOM info:', JSON.stringify(domInfo, null, 2));

} catch (err) {
  console.error('Test failed:', err.message);
} finally {
  await browser.close();
}
