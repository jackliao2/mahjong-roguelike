import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5176/play.html';
const RUNS = 5;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getCanvasInfo(page) {
  return await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, cw: canvas.width, ch: canvas.height };
  });
}

async function clickCanvas(page, cx, cy, ci) {
  const sx = ci.left + (cx / ci.cw) * ci.width;
  const sy = ci.top + (cy / ci.ch) * ci.height;
  await page.mouse.click(sx, sy);
}

async function getQuizState(page) {
  return await page.evaluate(() => {
    try {
      const scenes = window.game?.scene?.scenes;
      if (!scenes) return { error: 'no scenes' };
      const scene = scenes.find(s => s && s.scene && s.scene.isActive() && s.scene.key === 'GameScene');
      if (!scene) return { error: 'no GameScene', activeScenes: scenes.filter(s => s && s.scene).map(s => s.scene.key) };
      return {
        round: scene.round,
        maxRounds: scene.maxRounds,
        score: scene.score,
        answered: scene.answered,
        hasQuestion: !!scene.currentQuestion,
        correctIndices: scene.currentQuestion?.correctIndices || [],
        activeScenes: scenes.filter(s => s && s.scene).map(s => s.scene.key),
      };
    } catch (err) {
      return { error: err.message };
    }
  });
}

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
  page.on('pageerror', err => console.log('[PAGEERROR]', err.message));

  for (let run = 1; run <= RUNS; run++) {
    console.log(`\n===== RUN ${run}/${RUNS} =====`);

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // Clear progress
    await page.evaluate(() => {
      localStorage.removeItem('mjrg_onboarded');
      localStorage.removeItem('mjrg_beginner_done');
      localStorage.removeItem('mjrg_run');
      localStorage.removeItem('mjrg_meta');
      localStorage.removeItem('mjrg_tutorial_seen');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2500);

    let ci = await getCanvasInfo(page);
    // Click BEGINNER (x=322, y=320)
    await clickCanvas(page, 322, 320, ci);
    await sleep(1000);
    // Click START QUIZ (x=760, y=640)
    await clickCanvas(page, 760, 640, ci);
    await sleep(3000);

    let wins = 0;
    for (let round = 1; round <= 3; round++) {
      // Wait for question
      let waited = 0;
      while (waited < 8000) {
        const state = await getQuizState(page);
        if (state.hasQuestion && !state.answered) break;
        await sleep(500);
        waited += 500;
      }

      const state = await getQuizState(page);
      if (!state.hasQuestion) { console.log(`  Round ${round}: no question`); break; }

      // Click correct answer
      const correctIdx = state.correctIndices[0];
      const optionX = 386 + correctIdx * 84;
      ci = await getCanvasInfo(page);
      await clickCanvas(page, optionX, 480, ci);
      await sleep(1500);

      // Click NEXT (not on last round)
      if (round < state.maxRounds) {
        ci = await getCanvasInfo(page);
        await clickCanvas(page, 512, 480, ci);
        await sleep(2000);
      }
      wins++;
    }

    await sleep(2000);
    const finalState = await getQuizState(page);
    const hasGameOver = finalState.activeScenes?.includes('GameOverScene');
    console.log(`  Wins: ${wins}/3, GameOver: ${hasGameOver}`);
    if (wins === 3 && hasGameOver) {
      console.log('  ✅ PASS');
    } else {
      console.log('  ❌ FAIL');
    }
  }
} catch (err) {
  console.error('Stress test failed:', err.message);
  console.error(err.stack);
} finally {
  await browser.close();
}
