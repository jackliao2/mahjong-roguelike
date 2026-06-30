import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173/play.html';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(2000);

// 跳过 DeckSelectScene，直接启动 GameScene（beginner 难度）
await page.evaluate(() => {
  const scenes = window.game?.scene?.scenes;
  const deckScene = scenes?.find(s => s?.scene?.key === 'DeckSelectScene');
  if (deckScene) {
    deckScene.scene.start('GameScene', { action: 'new_run', deckId: 'classic', difficulty: 'beginner' });
  }
});
await sleep(2500);

// 检查 challengeGoal 是否存在
const state = await page.evaluate(() => {
  const scenes = window.game?.scene?.scenes;
  const scene = scenes?.find(s => s?.scene?.key === 'GameScene');
  if (!scene) return { error: 'no GameScene' };
  return {
    challengeGoal: scene.challengeGoal,
    challengeCompleted: scene.challengeCompleted,
    round: scene.state?.runState?.round,
    maxRounds: scene.state?.runState?.maxRounds,
    hasChallengeText: !!scene.challengeText,
    challengeTextContent: scene.challengeText?.text,
    phase: scene.state?.phase,
  };
});
console.log('Challenge state:', JSON.stringify(state, null, 2));

await page.screenshot({ path: 'screenshots/challenge-bar.png' });
console.log('Screenshot saved: screenshots/challenge-bar.png');

await browser.close();
