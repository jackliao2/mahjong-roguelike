import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5175/play.html';

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

async function getGameState(page) {
  return await page.evaluate(() => {
    try {
      const scenes = window.game?.scene?.scenes;
      if (!scenes) return { error: 'no scenes' };
      const scene = scenes.find(s => s && s.scene && s.scene.isActive() && s.scene.key === 'GameScene');
      if (!scene) return { error: 'no GameScene' };
      if (!scene.state) return { error: 'no scene.state' };
      return {
        phase: scene.state.phase,
        round: scene.state.runState.round,
        maxRounds: scene.state.runState.maxRounds,
        score: scene.state.runState.score,
        targetScore: scene.state.runState.targetScore,
        isRiichi: scene.state.runState.isRiichi,
        wallLeft: scene.state.wall?.remaining ?? -1,
        handTiles: scene.state.hand.tiles.length + (scene.state.hand.drawnTile ? 1 : 0),
        recommendedText: scene.recommendedActionText?.text || '',
      };
    } catch (err) {
      return { error: err.message };
    }
  });
}

async function getActiveScene(page) {
  return await page.evaluate(() => {
    const scenes = window.game?.scene?.scenes;
    if (!scenes) return 'no-scenes';
    const active = scenes.filter(s => s && s.scene && s.scene.isActive()).map(s => s.scene.key);
    return active.join(',');
  });
}

async function playOneRound(page, ci) {
  let turns = 0;
  const MAX_TURNS = 150;
  while (turns < MAX_TURNS) {
    const state = await getGameState(page);
    if (state.error) { console.log('  state error:', state.error); break; }
    if (state.phase === 'won' || state.phase === 'survived' || state.phase === 'lost') {
      return { phase: state.phase, turns, score: state.score, round: state.round };
    }
    if (state.phase === 'idle') {
      if (state.recommendedText.includes('RIICHI')) {
        await page.keyboard.press('KeyR');
      } else {
        await page.keyboard.press('KeyD');
      }
      await sleep(150);
    } else if (state.phase === 'drew') {
      if (state.recommendedText.includes('WIN')) {
        await page.keyboard.press('KeyW');
      } else {
        const dx = 914; // matches 56x72 tiles + 4px gap layout
        await clickCanvas(page, dx, 620, ci);
      }
      await sleep(150);
    }
    turns++;
  }
  return { phase: 'timeout', turns };
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,800'],
});

const GAMES = 5;
const results = [];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', err => console.log('[PAGEERROR]', err.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('[CONSOLE.error]', msg.text()); });
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (req.url().includes('umami.is') || req.url().includes('google-analytics') || req.url().includes('googletagmanager')) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  for (let game = 0; game < GAMES; game++) {
    console.log(`\n========== GAME ${game + 1}/${GAMES} ==========`);
    await page.evaluate(() => {
      localStorage.setItem('mjrg_onboarded', '1');
      localStorage.removeItem('mjrg_beginner_done');
      localStorage.removeItem('mjrg_run');
      localStorage.removeItem('mjrg_meta');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(2500);

    let ci = await getCanvasInfo(page);
    // Select beginner
    await clickCanvas(page, 442, 156, ci);
    await sleep(500);
    // Start run
    await clickCanvas(page, 624, 610, ci);
    await sleep(2500);

    const gameResult = { rounds: [], finalScore: 0 };
    for (let r = 0; r < 3; r++) {
      ci = await getCanvasInfo(page);
      const res = await playOneRound(page, ci);
      console.log(`  Round ${r + 1}: ${res.phase} in ${res.turns} turns`);
      gameResult.rounds.push(res);
      if (res.phase !== 'won' && res.phase !== 'survived') break;

      // Go to reward screen
      await page.keyboard.press('KeyN');
      await sleep(1200);

      // Check active scene; if RewardScene, skip reward
      let active = await getActiveScene(page);
      if (active.includes('RewardScene')) {
        await clickCanvas(page, 412, 640, ci);
        await sleep(1200);
      }

      active = await getActiveScene(page);
      if (active.includes('DeckSelectScene') || active.includes('GameOver')) {
        console.log('  Run ended early');
        break;
      }
    }
    const finalState = await getGameState(page);
    gameResult.finalScore = finalState.score ?? 0;
    results.push(gameResult);
  }

  console.log('\n========== SUMMARY ==========');
  results.forEach((r, i) => {
    const totalTurns = r.rounds.reduce((a, b) => a + b.turns, 0);
    const phases = r.rounds.map(x => x.phase).join(', ');
    console.log(`Game ${i + 1}: total ${totalTurns} turns [${phases}] score=${r.finalScore}`);
  });

} catch (e) {
  console.error('ERROR:', e.message);
  console.error(e.stack);
} finally {
  await browser.close();
}
