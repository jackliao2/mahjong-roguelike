import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173/play.html';

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
  await sleep(3000);

  // Clear localStorage and reload to ensure fresh state
  await page.evaluate(() => {
    localStorage.removeItem('mjrg_tutorial_seen');
    localStorage.removeItem('mjrg_beginner_done');
    localStorage.removeItem('mjrg_normal_done');
    localStorage.removeItem('mjrg_run');
    localStorage.removeItem('mjrg_meta');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // ===== 1. Render all tiles to a canvas screenshot =====
  const tileResult = await page.evaluate(() => {
    const scenes = window.game?.scene?.scenes;
    if (!scenes) return { error: 'no scenes' };
    const scene = scenes.find(s => s && s.scene && s.scene.isActive());
    if (!scene) return { error: 'no active scene' };

    const suits = [
      { suit: 'man', max: 9, label: 'MAN (萬)' },
      { suit: 'pin', max: 9, label: 'PIN (筒)' },
      { suit: 'sou', max: 9, label: 'SOU (索)' },
      { suit: 'wind', max: 4, label: 'WIND' },
      { suit: 'dragon', max: 3, label: 'DRAGON' },
    ];

    const tileW = 56, tileH = 72, gap = 6, labelH = 20;
    const cols = 9;
    const rows = suits.length;
    const canvas = document.createElement('canvas');
    canvas.width = cols * (tileW + gap) + gap;
    canvas.height = rows * (tileH + gap + labelH) + gap;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1008';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let rowIndex = 0;
    for (const { suit, max, label } of suits) {
      const yBase = gap + rowIndex * (tileH + gap + labelH);
      ctx.fillStyle = '#e5b567';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, gap, yBase + 14);

      for (let rank = 1; rank <= max; rank++) {
        const key = `tile-${suit}-${rank}`;
        const tex = scene.textures.get(key);
        if (tex && tex.source && tex.source[0]) {
          const src = tex.source[0].image;
          const x = gap + (rank - 1) * (tileW + gap);
          ctx.drawImage(src, x, yBase + labelH, tileW, tileH);
        }
      }
      rowIndex++;
    }
    return { canvas: canvas.toDataURL() };
  });

  if (tileResult.canvas) {
    const fs = await import('fs');
    const data = tileResult.canvas.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync('tiles_preview.png', Buffer.from(data, 'base64'));
    console.log('Saved tiles_preview.png');
  }

  // ===== 2. Start a game (Normal mode) and check top bar visibility =====
  // First complete beginner to unlock normal? No — just start beginner without tutorial
  await page.evaluate(() => {
    localStorage.setItem('mjrg_tutorial_seen', '1'); // skip tutorial
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.key === 'DeckSelectScene');
    if (scene) {
      scene.scene.start('GameScene', { action: 'new_run', difficulty: 'beginner' });
    }
  });
  await sleep(2000);

  // Check game state and top bar
  const gameState = await page.evaluate(() => {
    const scenes = window.game?.scene?.scenes;
    const scene = scenes?.find(s => s && s.scene && s.scene.isActive() && s.scene.key === 'GameScene');
    if (!scene) return { error: 'no GameScene' };

    const result = {
      teachingMode: scene.teachingMode,
      tutorialActive: scene.tutorialActive,
      isBeginner: scene.isBeginner,
      round: scene.round,
      score: scene.score,
      lives: scene.lives,
      relics: scene.relics,
      topBarElements: {},
    };

    const names = ['topBarBg', 'roundLabel', 'livesLabel', 'comboLabel', 'scoreBox', 'scoreValue', 'relicBox', 'relicLabel', 'timerLabel'];
    for (const name of names) {
      const obj = scene.children.getByName(name);
      if (obj) {
        result.topBarElements[name] = {
          type: obj.type,
          x: obj.x,
          y: obj.y,
          depth: obj.depth,
          visible: obj.visible,
          alpha: obj.alpha,
          text: obj.text,
          color: obj.style?.color,
        };
      } else {
        result.topBarElements[name] = null;
      }
    }
    return result;
  });
  console.log('Game state:', JSON.stringify(gameState, null, 2));

  await page.screenshot({ path: 'game_normal.png', fullPage: false });
  console.log('Saved game_normal.png');

} catch (err) {
  console.error('Test failed:', err.message);
} finally {
  await browser.close();
}
