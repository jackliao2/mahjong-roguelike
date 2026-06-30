import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5176/play.html';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,800'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.goto(URL, { waitUntil: 'networkidle2' });
  await sleep(3000);

  // Clear storage and reload
  await page.evaluate(() => {
    try { localStorage.clear(); } catch(e) {}
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(3000);

  // Get tutorial info from the game
  const info = await page.evaluate(() => {
    try {
      const scenes = window.game?.scene?.scenes;
      if (!scenes) return { error: 'no scenes' };
      
      const result = {
        activeScenes: scenes.filter(s => s && s.scene).map(s => s.scene.key),
        tutorialSteps: null,
        hasInteractiveTutorial: false,
        hasOldTutorial: false,
      };
      
      // Check GameScene prototype or any scene for tutorial methods
      for (const s of scenes) {
        if (s && s.scene && s.scene.key === 'GameScene') {
          const gs = s;
          result.hasInteractiveTutorial = typeof gs.showInteractiveTutorial === 'function';
          result.hasOldTutorial = typeof gs.showTutorialOverlay === 'function';
          result.tutorialStep = gs.tutorialStep;
          result.isBeginner = gs.isBeginner;
          
          // Try to get config
          if (gs.game?.config?.beginner?.tutorialSteps) {
            result.tutorialSteps = gs.game.config.beginner.tutorialSteps.length;
            result.stepIds = gs.game.config.beginner.tutorialSteps.map(s => s.id);
          }
          break;
        }
      }
      
      return result;
    } catch (e) {
      return { error: e.message, stack: e.stack };
    }
  });

  console.log('=== TUTORIAL VERIFICATION ===');
  console.log(JSON.stringify(info, null, 2));

  // Now navigate to beginner mode and check
  const canvas = await page.$('canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      // Click BEGINNER
      await page.mouse.click(box.x + (442 / 1024) * box.width, box.y + (156 / 720) * box.height);
      await sleep(800);
      // START RUN
      await page.mouse.click(box.x + (624 / 1024) * box.width, box.y + (640 / 720) * box.height);
      await sleep(3000);
      
      // Screenshot onboarding
      await page.screenshot({ path: 'screenshots/verify-onboarding.png' });
      console.log('\nScreenshot saved: screenshots/verify-onboarding.png');
      
      // Click Got it!
      await page.mouse.click(box.x + (512 / 1024) * box.width, box.y + (536 / 720) * box.height);
      await sleep(1500);
      
      // Screenshot tutorial welcome
      await page.screenshot({ path: 'screenshots/verify-tutorial-welcome.png' });
      console.log('Screenshot saved: screenshots/verify-tutorial-welcome.png');
      
      // Check tutorial state
      const state2 = await page.evaluate(() => {
        try {
          const scenes = window.game?.scene?.scenes;
          const gs = scenes.find(s => s && s.scene && s.scene.key === 'GameScene');
          if (!gs) return { error: 'no GameScene' };
          return {
            tutorialStep: gs.tutorialStep,
            tutorialOverlay: gs.tutorialOverlay ? 'exists' : 'null',
            tutorialStepsConfig: gs.game?.config?.beginner?.tutorialSteps?.length ?? 'unknown',
          };
        } catch(e) { return { error: e.message }; }
      });
      console.log('\nTutorial state after onboarding:', JSON.stringify(state2, null, 2));
    }
  }

} catch (e) {
  console.error('ERROR:', e.message);
  console.error(e.stack);
} finally {
  await browser.close();
}
