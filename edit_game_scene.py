import re

with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'(}\);\s*\n\s*\})\n\s*// ===== Question rendering ====='
replacement = '''});
  }

  private showTeachingIntro(onComplete: () => void): void {
    const levels = GameConfig.beginner.trainingLevels;
    if (this.currentTrainingLevel < 0 || this.currentTrainingLevel >= levels.length) {
      onComplete();
      return;
    }
    const level = levels[this.currentTrainingLevel];
    const accentColor = 0x4a9e4a;

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.8).setDepth(500);
    const panel = this.add.rectangle(512, 360, 620, 300, 0x1a0f08)
      .setStrokeStyle(3, accentColor).setDepth(501);
    const accent = this.add.rectangle(512, 360 - 150 + 4, 610, 4, accentColor).setDepth(501);

    const titleText = this.add.text(512, 280, level.title, {
      fontSize: '26px', color: '#4a9e4a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);

    const subtitleText = this.add.text(512, 320, level.subtitle, {
      fontSize: '16px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(502);

    const descText = this.add.text(512, 375, level.description, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: 560 }, lineSpacing: 8,
    }).setOrigin(0.5).setDepth(502);

    const btnW = 180;
    const btnH = 44;
    const btnBg = this.add.rectangle(512, 450, btnW, btnH, 0x4a9e4a)
      .setStrokeStyle(3, 0x2b1810).setDepth(501);
    const btnText = this.add.text(512, 450, 'START LESSON', {
      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(502);
    const btnHit = this.add.rectangle(512, 450, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(503);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0x5abf5a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0x4a9e4a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
      onComplete();
    });

    const elements = [overlay, panel, accent, titleText, subtitleText, descText, btnBg, btnText, btnHit];
    elements.forEach(el => el.setAlpha(0));
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 300,
    });
  }

// ===== Question rendering ====='''

new_content = re.sub(pattern, replacement, content)

if new_content == content:
    print('Pattern not found')
else:
    with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('File updated successfully')
