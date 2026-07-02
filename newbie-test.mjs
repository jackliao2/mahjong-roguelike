import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173/play.html';

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
        isBoss: scene.currentQuestion?.isBoss,
        relics: scene.relics,
        currentPath: scene.currentPath,
        isEndless: scene.isEndless,
        timeLeft: scene.timeLeft,
        timerActive: scene.timerActive,
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

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const client = await page.target().createCDPSession();
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  page.on('pageerror', err => console.log('[PAGEERROR]', err.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  await page.evaluate(() => {
    localStorage.removeItem('mjrg_onboarded');
    localStorage.removeItem('mjrg_beginner_done');
    localStorage.removeItem('mjrg_normal_done');
    localStorage.removeItem('mjrg_run');
    localStorage.removeItem('mjrg_meta');
    localStorage.removeItem('mjrg_tutorial_seen');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // Start beginner run directly via JS
  await page.evaluate(() => {
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.key === 'DeckSelectScene');
    if (scene) {
      scene.scene.start('GameScene', { action: 'new_run', difficulty: 'beginner' });
    }
  });
  await sleep(2000);

  let state = await getQuizState(page);
  console.log('Start state:', { round: state.round, maxRounds: state.maxRounds, lives: state.lives, timerActive: state.timerActive });

  const maxRounds = state.maxRounds;

  for (let round = 1; round <= maxRounds; round++) {
    // Wait for question
    let waited = 0;
    while (waited < 10000) {
      state = await getQuizState(page);
      if (state.hasQuestion && !state.answered && state.round === round) break;
      await sleep(200);
      waited += 200;
    }

    if (!state.hasQuestion) {
      console.log(`Round ${round}: no question (state: ${state.error || JSON.stringify(state)})`);
      break;
    }

    console.log(`Q${round}: boss=${state.isBoss}, lives=${state.lives}, timer=${state.timerActive ? state.timeLeft.toFixed(1)+'s' : 'off'}, relics=${state.relics?.length || 0}, path=${state.currentPath}`);

    await answerCorrect(page);
    await sleep(200);
    state = await getQuizState(page);
    console.log(`  → correct! score=${state.score}, combo=${state.combo}, bestCombo=${state.bestCombo}`);

    if (round < maxRounds) {
      await nextRound(page);
      await sleep(300);
    }
  }

  await sleep(1000);
  state = await getQuizState(page);
  console.log('\nFinal:', {
    round: state.round,
    score: state.score,
    lives: state.lives,
    bestCombo: state.bestCombo,
    relics: state.relics,
    activeScenes: state.activeScenes,
  });

  const hasGameOver = state.activeScenes?.includes('GameOverScene');
  console.log(hasGameOver ? '\n✅ PASS' : '\n❌ FAIL');

} catch (err) {
  console.error('Test failed:', err.message);
  console.error(err.stack);
} finally {
  await browser.close();
}
