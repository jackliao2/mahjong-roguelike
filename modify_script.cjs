const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Update handleAnswer call to pass correctIndex
content = content.replace(/this\.showCorrectFeedback\(q\);/g, 'this.showCorrectFeedback(q, optionIndex);');

// Add particle effect code
const particleCode = 
    // Particle effect: emit gold particles from correct answer tile position
    const gap = 20;
    const totalW = q.options.length * OPTION_TILE_W + (q.options.length - 1) * gap;
    const startX = 512 - totalW / 2 + OPTION_TILE_W / 2;
    const correctTileX = startX + correctIndex * (OPTION_TILE_W + gap);
    const correctTileY = 480;

    const particleGraphics = this.add.graphics().setDepth(depth);
    for (let i = 0; i < 30; i++) {
      const offsetX = (Math.random() - 0.5) * 100;
      const offsetY = (Math.random() - 0.5) * 80;
      const size = 4 + Math.random() * 4;
      const alpha = 0.6 + Math.random() * 0.4;
      particleGraphics.fillStyle(0xe5b567, alpha);
      particleGraphics.fillCircle(correctTileX + offsetX, correctTileY + offsetY, size);
    }

    this.tweens.add({
      targets: particleGraphics,
      y: correctTileY - 150,
      alpha: 0,
      duration: 1500,
      ease: 'Cubic.easeOut',
      onComplete: () => { particleGraphics.destroy(); },
    });
;

content = content.replace(
  '    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, expText];',
  '    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, expText];' + particleCode
);

// Add BOSS border effect
const bossBorderCode = 
    if (q.isBoss) {
      const handAreaWidth = q.hand.length * HAND_TILE_W + (q.hand.length - 1) * 4 + 40;
      const handAreaHeight = HAND_TILE_H + 60;
      const bossBorder = this.add.rectangle(512, 250, handAreaWidth, handAreaHeight)
        .setStrokeStyle(4, 0xc73e3a, 0.5).setOrigin(0.5);
      this.questionContainer.add(bossBorder);
      this.tweens.add({ targets: bossBorder, alpha: { from: 0.3, to: 0.8 }, duration: 1000, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: chapterLabel, alpha: { from: 0.7, to: 1 }, duration: 800, yoyo: true, repeat: -1 });
    }
;

content = content.replace(
  '    this.questionContainer.add(chapterLabel);',
  '    this.questionContainer.add(chapterLabel);' + bossBorderCode
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Modifications applied successfully');
