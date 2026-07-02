import re

with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'(private showTutorialCorrectFeedback\(q: QuizQuestion, correctIndex: number\): void \{)'
replacement = '''private showTeachingCorrectFeedback(q: QuizQuestion, correctIndex: number): void {
    const depth = 1100;
    const levels = GameConfig.beginner.trainingLevels;
    const level = levels[this.currentTrainingLevel];

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.75).setDepth(depth);
    const panelW = 620;
    const panelH = 380;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0x4a9e4a).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 4, 0x4a9e4a).setDepth(depth);

    const title = this.add.text(512, 270, 'CORRECT!', {
      fontSize: '32px', color: '#4a9e4a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const expText = this.add.text(512, 340, q.explanation, {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, expText];

    const isLastLevel = this.currentTrainingLevel >= levels.length - 1;
    const btnLabel = isLastLevel ? 'COMPLETE!' : 'NEXT LESSON ▶';
    const btnW = 200;
    const btnH = 48;
    const btnY = 360 + panelH / 2 - 40;
    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0x4a9e4a)
      .setStrokeStyle(3, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(512, btnY, btnLabel, {
      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const btnHit = this.add.rectangle(512, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0x5abf5a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0x4a9e4a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
      if (isLastLevel) {
        this.showTeachingComplete();
      } else {
        this.proceedToNextRound();
      }
    });
    elements.push(btnBg, btnText, btnHit);

    this.feedbackContainer.add(elements);
    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 300,
    });
  }

  private showTeachingRetryFeedback(q: QuizQuestion, chosenIndex: number): void {
    const depth = 1100;
    const levels = GameConfig.beginner.trainingLevels;
    const level = levels[this.currentTrainingLevel];

    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.7).setDepth(depth);
    const panelW = 600;
    const panelH = 320;
    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)
      .setStrokeStyle(3, 0xc73e3a).setDepth(depth);
    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 4, 0xc73e3a).setDepth(depth);

    const title = this.add.text(512, 290, 'NOT QUITE!', {
      fontSize: '28px', color: '#c73e3a', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const hintText = this.add.text(512, 340, 'Let\'s review the concept:', {
      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const descText = this.add.text(512, 385, level ? level.description : '', {
      fontSize: '13px', color: '#c9b89a', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,
    }).setOrigin(0.5).setDepth(depth + 1);

    const subText = this.add.text(512, 420, 'Try again!', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(depth + 1);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, hintText, descText, subText];

    const btnW = 160;
    const btnH = 44;
    const btnY = 360 + panelH / 2 - 35;
    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(512, btnY, 'TRY AGAIN', {
      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const btnHit = this.add.rectangle(512, btnY, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0xe04e4a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0xc73e3a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      elements.forEach(el => el.destroy());
      this.questionContainer.removeAll(true);
      this.answered = false;
      this.renderQuestion();
    });
    elements.push(btnBg, btnText, btnHit);

    this.feedbackContainer.add(elements);
    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 300,
    });
  }

  private showTeachingComplete(): void {
    const depth = 1300;
    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.9).setDepth(depth);

    const title = this.add.text(512, 260, 'CONGRATULATIONS!', {
      fontSize: '36px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);

    const subtitle = this.add.text(512, 320, 'You completed all teaching lessons!', {
      fontSize: '18px', color: '#c9b89a', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(depth + 1);

    const desc = this.add.text(512, 380, 'You learned:\n· Winning hands (4 sets + 1 pair)\n· Waiting tiles and tenpai\n· Yaku patterns like Tanyao and Riichi\n· Optimal discarding strategy\n· Safe discards', {
      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',
      align: 'center', lineSpacing: 8,
    }).setOrigin(0.5).setDepth(depth + 1);

    const btnW = 200;
    const btnH = 50;
    const btnBg = this.add.rectangle(512, 470, btnW, btnH, 0xc73e3a)
      .setStrokeStyle(3, 0x2b1810).setDepth(depth);
    const btnText = this.add.text(512, 470, 'PLAY NOW ▶', {
      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 1);
    const btnHit = this.add.rectangle(512, 470, btnW, btnH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    btnHit.on('pointerover', () => btnBg.setFillStyle(0xe04e4a));
    btnHit.on('pointerout', () => btnBg.setFillStyle(0xc73e3a));
    btnHit.on('pointerdown', () => {
      this.soundManager.playClick();
      window.location.href = '/play';
    });

    const elements = [overlay, title, subtitle, desc, btnBg, btnText, btnHit];
    elements.forEach(el => { (el as any).setAlpha?.(0); });
    this.tweens.add({
      targets: elements,
      alpha: 1,
      duration: 400,
    });
  }

\\1'''

new_content = re.sub(pattern, replacement, content)

if new_content == content:
    print('Pattern not found')
else:
    with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('File updated successfully')
