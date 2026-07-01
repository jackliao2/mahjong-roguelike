import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5176/play.html';

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
        prompt: scene.currentQuestion?.prompt || '',
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

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // Clear progress
  await page.evaluate(() => {
    localStorage.removeItem('mjrg_onboarded');
    localStorage.removeItem('mjrg_beginner_done');
    localStorage.removeItem('mjrg_run');
    localStorage.removeItem('mjrg_meta');
    localStorage.removeItem('mjrg_tutorial_seen');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);

  let ci = await getCanvasInfo(page);
  console.log('=== 1. DECK SELECT SCENE ===');
  await page.screenshot({ path: 'screenshots/newbie-01-deck-select.png' });

  // Click BEGINNER card (x=322, y=320)
  await clickCanvas(page, 322, 320, ci);
  await sleep(1000);
  await page.screenshot({ path: 'screenshots/newbie-02-beginner-selected.png' });

  // Click START QUIZ (x=760, y=640)
  await clickCanvas(page, 760, 640, ci);
  await sleep(3000);

  console.log('\n=== 2. QUIZ STARTED ===');
  let state = await getQuizState(page);
  console.log('State:', JSON.stringify(state, null, 2));
  await page.screenshot({ path: 'screenshots/newbie-03-quiz-start.png' });

  // Answer all questions (8 for beginner)
  const maxRounds = await getQuizState(page).then(s => s.maxRounds || 8);
  for (let round = 1; round <= maxRounds; round++) {
    console.log(`\n=== ROUND ${round}/${maxRounds} ===`);

    // Wait for round intro to fade and NEW question for this round to appear
    let waited = 0;
    while (waited < 10000) {
      state = await getQuizState(page);
      if (state.hasQuestion && !state.answered && state.round === round) break;
      await sleep(500);
      waited += 500;
    }
    if (!state.hasQuestion) {
      console.log('ERROR: No question appeared after waiting');
      break;
    }

    console.log('Prompt:', state.prompt);
    console.log('Correct indices:', state.correctIndices);
    await page.screenshot({ path: `screenshots/newbie-04-round-${round}-question.png` });

    // Click the first correct option
    // Options at y=480, x = 386 + i * 84 (for i=0..3)
    const correctIdx = state.correctIndices[0];
    const optionX = 386 + correctIdx * 84;
    ci = await getCanvasInfo(page);
    await clickCanvas(page, optionX, 480, ci);
    await sleep(1500);

    state = await getQuizState(page);
    console.log('After answer:', { answered: state.answered, score: state.score });
    await page.screenshot({ path: `screenshots/newbie-05-round-${round}-correct.png` });

    // Click NEXT ROUND button (x=512, y=480)
    // For last round, button says "COMPLETE!"
    const isLast = round === maxRounds;
    if (!isLast) {
      ci = await getCanvasInfo(page);
      await clickCanvas(page, 512, 480, ci);
      await sleep(2000);
    }
  }

  // Verify game over / win screen
  await sleep(2000);
  state = await getQuizState(page);
  console.log('\n=== 3. FINAL STATE ===');
  console.log('Active scenes:', state.activeScenes);
  const hasGameOver = state.activeScenes?.includes('GameOverScene');
  console.log('Has GameOverScene:', hasGameOver);
  await page.screenshot({ path: 'screenshots/newbie-06-game-over.png' });

  if (hasGameOver) {
    console.log('\n✅ SUCCESS: Quiz completed, game over screen shown');
  } else {
    console.log('\n❌ FAIL: Game over screen not shown');
  }

  await sleep(1000);
} catch (err) {
  console.error('Test failed:', err.message);
  console.error(err.stack);
} finally {
  await browser.close();
}
