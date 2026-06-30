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

async function getRecommendedDiscardPos(page) {
  return await page.evaluate(() => {
    try {
      const scenes = window.game?.scene?.scenes;
      const scene = scenes.find(s => s && s.scene && s.scene.isActive() && s.scene.key === 'GameScene');
      if (!scene || !scene.recommendedDiscardId) return null;
      const rec = scene.tileSprites.find(spr => {
        return spr.tile && spr.tile.id === scene.recommendedDiscardId;
      });
      if (!rec) return null;
      return { x: rec.x, y: rec.y };
    } catch (err) {
      return null;
    }
  });
}

async function getGameState(page) {
  return await page.evaluate(() => {
    try {
      const scenes = window.game?.scene?.scenes;
      if (!scenes) return { error: 'no scenes' };
      const scene = scenes.find(s => s && s.scene && s.scene.isActive() && s.scene.key === 'GameScene');
      if (!scene) return { error: 'no GameScene', activeScenes: scenes.filter(s => s && s.scene).map(s => s.scene.key) };
      if (!scene.state) return { error: 'no scene.state' };
      if (!scene.state.hand) return { error: 'no scene.state.hand' };
      if (!scene.state.hand.tiles) return { error: 'no scene.state.hand.tiles', handKeys: Object.keys(scene.state.hand) };

      const allTiles = scene.state.hand.tiles.map((t, i) => ({
        id: t.id, suit: t.suit, rank: t.rank, index: i
      }));
      if (scene.state.hand.drawnTile) {
        allTiles.push({ id: scene.state.hand.drawnTile.id, suit: scene.state.hand.drawnTile.suit, rank: scene.state.hand.drawnTile.rank, index: 'drawn' });
      }
      return {
        phase: scene.state.phase,
        isBeginner: scene.isBeginner,
        showHints: scene.showHints,
        round: scene.state.runState.round,
        maxRounds: scene.state.runState.maxRounds,
        score: scene.state.runState.score,
        targetScore: scene.state.runState.targetScore,
        isRiichi: scene.state.runState.isRiichi,
        wallLeft: scene.state.wall?.remaining ?? -1,
        handTiles: allTiles,
        buttons: Object.fromEntries(Object.entries(scene.actionButtons).map(([k, b]) => [k, { visible: b.visible, x: b.x, y: b.y }])),
        messageText: scene.messageText?.text || '',
        yakuInfoText: scene.yakuInfoText?.text || '',
        handStructureText: scene.handStructureText?.text || '',
        recommendedText: scene.recommendedActionText?.text || '',
        hintLegendVisible: scene.hintLegend?.visible || false,
      };
    } catch (err) {
      return { error: err.message, stack: err.stack };
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
  page.on('pageerror', err => console.log('[PAGEERROR]', err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[CONSOLE.error]', msg.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle2' });
  await sleep(3000);

  // Clear progress to simulate absolute beginner
  await page.evaluate(() => {
    localStorage.removeItem('mjrg_onboarded');
    localStorage.removeItem('mjrg_beginner_done');
    localStorage.removeItem('mjrg_run');
    localStorage.removeItem('mjrg_meta');
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  let ci = await getCanvasInfo(page);
  console.log('=== 1. DECK SELECT SCENE ===');
  await page.screenshot({ path: 'screenshots/newbie-01-deck-select.png' });
  console.log('Screenshot saved: newbie-01-deck-select.png');

  // Click BEGINNER
  await clickCanvas(page, 442, 156, ci);
  await sleep(800);
  await page.screenshot({ path: 'screenshots/newbie-02-beginner-selected.png' });

  // START RUN
  await clickCanvas(page, 624, 640, ci);
  await sleep(2500);

  console.log('\n=== 2. ONBOARDING OVERLAY ===');
  await page.screenshot({ path: 'screenshots/newbie-03-onboarding.png' });
  console.log('Screenshot saved: newbie-03-onboarding.png');

  // Click "Got it!" button on the onboarding overlay
    // Panel center y=360, height=440, button y = 360 + 220 - 44 = 536
    await clickCanvas(page, 512, 536, ci);
    await sleep(1200);

  console.log('\n=== 3. TUTORIAL WELCOME ===');
  await page.screenshot({ path: 'screenshots/newbie-04-tutorial-1.png' });
  console.log('Screenshot saved: newbie-04-tutorial-1.png');

  // Interactive tutorial: click START on welcome banner
  // bannerY=595, bannerH=110, btnY = 595 + 55 - 6 = 644
  await clickCanvas(page, 512, 644, ci);
  await sleep(900);

  // Tutorial DRAW step
  console.log('\n=== 3b. TUTORIAL DRAW ===');
  await page.screenshot({ path: 'screenshots/newbie-05-tutorial-draw.png' });
  console.log('Screenshot saved: newbie-05-tutorial-draw.png');
  await clickCanvas(page, 512, 475, ci); // DRAW TILE button
  await sleep(900);

  // Tutorial DISCARD step
  console.log('\n=== 3c. TUTORIAL DISCARD ===');
  await page.screenshot({ path: 'screenshots/newbie-05-tutorial-discard.png' });
  console.log('Screenshot saved: newbie-05-tutorial-discard.png');
  const recPos = await getRecommendedDiscardPos(page);
  ci = await getCanvasInfo(page);
  if (recPos) {
    await clickCanvas(page, recPos.x, recPos.y, ci);
  } else {
    await clickCanvas(page, 914, 620, ci);
  }
  await sleep(900);

  // Tutorial RIICHI step
  console.log('\n=== 3d. TUTORIAL RIICHI ===');
  await page.screenshot({ path: 'screenshots/newbie-05-tutorial-riichi.png' });
  console.log('Screenshot saved: newbie-05-tutorial-riichi.png');
  await clickCanvas(page, 330, 475, ci); // RIICHI button
  await sleep(900);

  // Tutorial WIN step: auto-draw already happened, just click WIN
  console.log('\n=== 3e. TUTORIAL WIN ===');
  await page.screenshot({ path: 'screenshots/newbie-05-tutorial-win.png' });
  console.log('Screenshot saved: newbie-05-tutorial-win.png');
  await clickCanvas(page, 512, 475, ci); // WIN! button
  await sleep(900);

  // Tutorial DONE step
  console.log('\n=== 3f. TUTORIAL DONE ===');
  await page.screenshot({ path: 'screenshots/newbie-05-tutorial-end.png' });
  console.log('Screenshot saved: newbie-05-tutorial-end.png');
  await clickCanvas(page, 512, 644, ci); // LET'S GO!
  await sleep(900);

  // Now the actual game idle
  await sleep(1500);
  let state = await getGameState(page);
  if (state.error) {
    console.log('State not ready yet, waiting more...', state);
    await sleep(2000);
    state = await getGameState(page);
  }
  console.log('\n=== 4. FIRST HAND (idle) ===');
  console.log('Phase:', state.phase);
  console.log('isBeginner:', state.isBeginner);
  console.log('Round:', state.round + '/' + state.maxRounds);
  console.log('Score/Target:', state.score + '/' + state.targetScore);
  console.log('Wall tiles left:', state.wallLeft);
  console.log('Hand tiles:', state.handTiles.length);
  console.log('Hand:', state.handTiles.map(t => `${t.suit}-${t.rank}`).join(', '));
  console.log('Message:', state.messageText);
  console.log('Yaku Info:', state.yakuInfoText);
  console.log('Hand Structure:', state.handStructureText);
  console.log('Recommended:', state.recommendedText);
  console.log('Hint Legend visible:', state.hintLegendVisible);
  console.log('Visible buttons:', Object.entries(state.buttons).filter(([_, b]) => b.visible).map(([k]) => k).join(', '));

  await page.screenshot({ path: 'screenshots/newbie-06-first-hand.png' });
  console.log('Screenshot saved: newbie-06-first-hand.png');

  // Check discard hints - click each tile and see if glow/hints appear
  console.log('\n=== 5. TESTING DISCARD HINTS ===');
  ci = await getCanvasInfo(page);

  // Simulate hovering over first tile (matches 56x72 tiles + 4px gap)
  const tilePositions = [150, 210, 270, 330];
  for (let i = 0; i < tilePositions.length; i++) {
    const tx = tilePositions[i];
    await page.mouse.move(ci.left + (tx / 1024) * ci.width, ci.top + (620 / 720) * ci.height);
    await sleep(300);
  }
  await page.screenshot({ path: 'screenshots/newbie-07-tile-hover.png' });
  console.log('Screenshot saved: newbie-07-tile-hover.png');

  // Draw phase
  console.log('\n=== 6. DRAW A TILE ===');
  await page.keyboard.press('KeyD');
  await sleep(1500);
  state = await getGameState(page);
  console.log('Phase:', state.phase);
  console.log('Hand tiles now:', state.handTiles.length);
  console.log('Recommended:', state.recommendedText);
  console.log('Visible buttons:', Object.entries(state.buttons).filter(([_, b]) => b.visible).map(([k]) => k).join(', '));
  // Validate that hand structure no longer reports false TENPAI
  if (state.handStructureText.includes('READY')) {
    console.log('NOTE: Hand structure reports READY; check findWaitingTiles agrees.');
  }
  await page.screenshot({ path: 'screenshots/newbie-08-drew.png' });
  console.log('Screenshot saved: newbie-08-drew.png');

  // Discard the drawn tile (rightmost, separated from the main hand)
  ci = await getCanvasInfo(page);
  const drawnX = 914; // matches 56x72 tiles + 4px gap layout
  await clickCanvas(page, drawnX, 620, ci);
  await sleep(1500);
  state = await getGameState(page);
  console.log('\n=== 7. AFTER DISCARD ===');
  console.log('Phase:', state.phase);
  console.log('Hand tiles now:', state.handTiles.length);
  console.log('Undo visible:', state.buttons.undo?.visible);
  console.log('Recommended:', state.recommendedText);
  console.log('Hand Structure:', state.handStructureText);
  await page.screenshot({ path: 'screenshots/newbie-09-after-discard.png' });
  console.log('Screenshot saved: newbie-09-after-discard.png');

  // Try to play until win/lose, following the glowing discard recommendation
  console.log('\n=== 8. SIMULATE MULTIPLE ROUNDS ===');
  let turns = 0;
  let wins = 0;
  const MAX_TURNS = 300;
  while (turns < MAX_TURNS) {
    state = await getGameState(page);
    if (!state || state.error) { console.log('GameScene lost'); break; }
    if (state.phase === 'won' || state.phase === 'survived' || state.phase === 'lost') {
      console.log('Game ended with phase:', state.phase, 'after', turns, 'turns');
      if (state.phase === 'won') wins++;
      break;
    }
    if (state.phase === 'idle') {
      // Auto-declare riichi when the recommendation tells us to
      if (state.recommendedText.includes('RIICHI')) {
        console.log(`  turn ${turns}: declaring RIICHI`);
        await page.keyboard.press('KeyR');
      } else {
        await page.keyboard.press('KeyD');
      }
      await sleep(300);
    } else if (state.phase === 'drew') {
      ci = await getCanvasInfo(page);
      if (state.recommendedText.includes('WIN')) {
        await page.keyboard.press('KeyW');
      } else {
        const recPos = await getRecommendedDiscardPos(page);
        if (recPos) {
          console.log(`  turn ${turns}: discarding recommended tile at ${Math.round(recPos.x)},${Math.round(recPos.y)}`);
          await clickCanvas(page, recPos.x, recPos.y, ci);
        } else {
          // Fallback: discard the drawn tile
          const dx = 914; // matches 56x72 tiles + 4px gap layout
          console.log(`  turn ${turns}: no recommended tile, fallback drawn tile at ${dx},620`);
          await clickCanvas(page, dx, 620, ci);
        }
      }
      await sleep(300);
    }
    turns++;
  }
  await page.screenshot({ path: `screenshots/newbie-10-end-${state.phase || 'timeout'}.png` });
  console.log('Final screenshot saved');

  state = await getGameState(page);
  console.log('\nFinal state:', {
    phase: state.phase,
    round: (state.round ?? '?') + '/' + state.maxRounds,
    score: state.score,
    targetScore: state.targetScore,
  });

} catch (e) {
  console.error('ERROR:', e.message);
  console.error(e.stack);
} finally {
  await browser.close();
}
