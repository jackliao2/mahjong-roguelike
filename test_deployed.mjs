import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

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

  // Capture JS bundle requests
  const jsBundles = [];
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('/assets/play-') && url.endsWith('.js')) {
      jsBundles.push(url);
    }
  });

  await page.goto('https://mahjong-roguelike.vercel.app/play.html', { waitUntil: 'domcontentloaded' });
  await sleep(5000);

  console.log('Bundles loaded by Vercel:', jsBundles);

  // Fetch each bundle and check contents
  for (const bundleUrl of jsBundles) {
    const result = await page.evaluate(async (url) => {
      const resp = await fetch(url, { cache: 'no-store' });
      const text = await resp.text();
      return {
        url,
        length: text.length,
        hasDepth10000: text.includes('10000'),
        hasSetDepth10000: text.includes('setDepth(10000)'),
        hasDepth10: text.includes('setDepth(10)'),
        hasDepth11: text.includes('setDepth(11)'),
        hasScoreBox: text.includes('scoreBox'),
        hasRelicBox: text.includes('relicBox'),
        hasNunito: text.includes('Nunito'),
        hasWanRed: text.includes('wanRed'),
        hasCanvasText: text.includes("createElement('canvas')") || text.includes('createElement("canvas")'),
        // Show context around scoreBox
        scoreBoxIdx: text.indexOf('scoreBox'),
        scoreBoxCtx: text.substring(Math.max(0, text.indexOf('scoreBox') - 80), text.indexOf('scoreBox') + 150),
      };
    }, bundleUrl);
    console.log('Bundle analysis:', JSON.stringify(result, null, 2));
  }

  // Also check the SW version
  const swContent = await page.evaluate(async () => {
    const resp = await fetch('/sw.js', { cache: 'no-store' });
    const text = await resp.text();
    return {
      cacheName: text.match(/CACHE_NAME = '([^']+)'/)?.[1],
    };
  });
  console.log('SW cache name on Vercel:', JSON.stringify(swContent, null, 2));

} catch (err) {
  console.error('Test failed:', err.message);
} finally {
  await browser.close();
}
