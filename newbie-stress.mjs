import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5176/play.html';
const RUNS = 5;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
        lives: scene.lives,
        combo: scene.combo,
        bestCombo: scene.bestCombo,
        answered: scene.answered,
        hasQuestion: !!scene.currentQuestion,
        correctIndices: scene.currentQuestion?.correctIndices || [],
        relics: scene.relics,
        activeScenes: scenes.filter(s => s && s.scene).map(s => s.scene.key),
      };
    } catch (err) {
      return { error: err.message };
    }
  });
}

async function answerCorrect(page) {
  return await page.evaluate(() => {
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.isActive() && s.scene.key === 'GameScene');
    if (!scene || !scene.currentQuestion || scene.answered) return false;
    const idx = scene.currentQuestion.correctIndices[0];
    scene.handleAnswer(idx);
    return true;
  });
}

async function nextRound(page) {
  return await page.evaluate(() => {
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.isActive() && s.scene.key === 'GameScene');
    if (!scene) return false;
    scene.stopTimer();
    scene.proceedToNextRound();
    return true;
  });
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,800'],
});

let passCount = 0;

try {
  for (let run = 1; run <= RUNS; run++) {
    console.log(`\n===== RUN ${run}/${RUNS} =====`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const client = await page.target().createCDPSession();
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    await page.evaluate(() => {
      localStorage.removeItem('mjrg_beginner_done');
      localStorage.removeItem('mjrg_normal_done');
      localStorage.removeItem('mjrg_run');
      localStorage.removeItem('mjrg_meta');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // Start beginner run
    await page.evaluate(() => {
      const scenes = window.game?.scene?.scenes;
      const scene = scenes?.find(s => s && s.scene && s.scene.key === 'DeckSelectScene');
      if (scene) scene.scene.start('GameScene', { action: 'new_run', difficulty: 'beginner' });
    });
    await sleep(2000);

    let state = await getQuizState(page);
    const maxRounds = state.maxRounds;
    let wins = 0;

    for (let round = 1; round <= maxRounds; round++) {
      let waited = 0;
      while (waited < 10000) {
        state = await getQuizState(page);
        if (state.hasQuestion && !state.answered && state.round === round) break;
        await sleep(200);
        waited += 200;
      }
      if (!state.hasQuestion || state.round !== round) {
        console.log(`  Q${round}: SKIP (no question)`);
        continue;
      }
      await answerCorrect(page);
      await sleep(150);
      if (round < maxRounds) {
        await nextRound(page);
        await sleep(200);
      }
      wins++;
    }

    await sleep(1000);
    state = await getQuizState(page);
    const hasGameOver = state.activeScenes?.includes('GameOverScene');
    console.log(`  Wins: ${wins}/${maxRounds}, Score: ${state.score}, Best combo: ${state.bestCombo}, GameOver: ${hasGameOver}`);
    if (wins >= maxRounds - 2 && hasGameOver) {
      console.log('  ✅ PASS');
      passCount++;
    } else {
      console.log('  ❌ FAIL');
    }

    await page.close();
  }

  console.log(`\n===== RESULT: ${passCount}/${RUNS} PASSED =====`);
} catch (err) {
  console.error('Stress test failed:', err.message);
  console.error(err.stack);
} finally {
  await browser.close();
}
