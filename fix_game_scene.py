import re

with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Original file length: {len(content)}")

# 1. Add teachingMode and currentTrainingLevel fields after tutorialElements
pattern1 = r'(private tutorialElements: Phaser\.GameObjects\.GameObject\[\] = \[\];)\n\n  // Progress map'
replacement1 = r'''\\1

  // Teaching mode
  private teachingMode: boolean = false;
  private currentTrainingLevel: number = 0;

  // Progress map'''

content = re.sub(pattern1, replacement1, content)
print(f"After step 1: {len(content)}")

# 2. Modify create() to handle teaching mode
pattern2 = r'(this\.isBeginner = data\?\.difficulty === \'beginner\';)\n    (this\.isEndless = data\?\.endless === true;)\n    (this\.maxRounds = this\.isEndless)'
replacement2 = r'''\\1\n    \\2\n    this.tutorialActive = data?.tutorial === true;\n    this.teachingMode = data?.teaching === true;\n    this.tutorialStep = 0;\n\n    if (this.teachingMode) {\n      this.maxRounds = GameConfig.beginner.trainingLevels.length;\n      this.lives = 999;\n    } else {\n      \\3'''

content = re.sub(pattern2, replacement2, content)
print(f"After step 2: {len(content)}")

# 3. Fix the duplicate maxRounds/lives block
pattern3 = r'(}\n\n    this\.maxRounds = this\.isEndless\n      \? 999\n      : \(this\.isBeginner \? GameConfig\.beginner\.maxRounds : GameConfig\.rounds\.maxRounds\);\n    this\.lives = this\.isBeginner \? GameConfig\.beginner\.lives : GameConfig\.rounds\.lives;\n\n    // Fresh run)'
replacement3 = r'''\\1'''

content = re.sub(pattern3, replacement3, content)
print(f"After step 3: {len(content)}")

# 4. Modify startRound() to call showTeachingIntro for teaching mode
pattern4 = r'(private startRound\(\): void \{.*?this\.updateProgressMap\(\);)\n\n    // Round intro banner\n    this\.showRoundIntro\(\(\) => \{'
replacement4 = r'''\\1\n\n    if (this.teachingMode) {\n      this.currentTrainingLevel = this.round - 1;\n      this.showTeachingIntro(() => {\n        this.loadQuestion();\n      });\n    } else {\n      // Round intro banner\n      this.showRoundIntro(() => {'''

content = re.sub(pattern4, replacement4, content, flags=re.DOTALL)
print(f"After step 4: {len(content)}")

# 5. Add closing brace after showRoundIntro callback
pattern5 = r'(this\.showRoundIntro\(\(\) => \{\n        this\.loadQuestion\(\);\n      \});\n    }\n  }\n\n  private showRoundIntro'
replacement5 = r'''this.showRoundIntro(() => {\n        this.loadQuestion();\n      });\n    }\n  }\n\n  private showTeachingIntro(onComplete: () => void): void {\n    const levels = GameConfig.beginner.trainingLevels;\n    if (this.currentTrainingLevel < 0 || this.currentTrainingLevel >= levels.length) {\n      onComplete();\n      return;\n    }\n    const level = levels[this.currentTrainingLevel];\n    const accentColor = 0x4a9e4a;\n\n    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.8).setDepth(500);\n    const panel = this.add.rectangle(512, 360, 620, 300, 0x1a0f08)\n      .setStrokeStyle(3, accentColor).setDepth(501);\n    const accent = this.add.rectangle(512, 360 - 150 + 4, 610, 4, accentColor).setDepth(501);\n\n    const titleText = this.add.text(512, 280, level.title, {\n      fontSize: '26px', color: '#4a9e4a', fontFamily: 'monospace', fontStyle: 'bold',\n    }).setOrigin(0.5).setDepth(502);\n\n    const subtitleText = this.add.text(512, 320, level.subtitle, {\n      fontSize: '16px', color: '#c9b89a', fontFamily: 'monospace',\n    }).setOrigin(0.5).setDepth(502);\n\n    const descText = this.add.text(512, 375, level.description, {\n      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',\n      align: 'center', wordWrap: { width: 560 }, lineSpacing: 8,\n    }).setOrigin(0.5).setDepth(502);\n\n    const btnW = 180;\n    const btnH = 44;\n    const btnBg = this.add.rectangle(512, 450, btnW, btnH, 0x4a9e4a)\n      .setStrokeStyle(3, 0x2b1810).setDepth(501);\n    const btnText = this.add.text(512, 450, 'START LESSON', {\n      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',\n    }).setOrigin(0.5).setDepth(502);\n    const btnHit = this.add.rectangle(512, 450, btnW, btnH, 0xffffff, 0)\n      .setInteractive({ useHandCursor: true }).setDepth(503);\n    btnHit.on('pointerover', () => btnBg.setFillStyle(0x5abf5a));\n    btnHit.on('pointerout', () => btnBg.setFillStyle(0x4a9e4a));\n    btnHit.on('pointerdown', () => {\n      this.soundManager.playClick();\n      elements.forEach(el => el.destroy());\n      onComplete();\n    });\n\n    const elements = [overlay, panel, accent, titleText, subtitleText, descText, btnBg, btnText, btnHit];\n    elements.forEach(el => el.setAlpha(0));\n    this.tweens.add({\n      targets: elements,\n      alpha: 1,\n      duration: 300,\n    });\n  }\n\n  private showRoundIntro'''

content = re.sub(pattern5, replacement5, content)
print(f"After step 5: {len(content)}")

# 6. Modify loadQuestion() for teaching mode
pattern6 = r'(private loadQuestion\(\): void \{)\n\s*(if \(this\.tutorialActive)'
replacement6 = r'''\\1\n    if (this.teachingMode) {\n      const levels = GameConfig.beginner.trainingLevels;\n      const level = levels[this.currentTrainingLevel];\n      this.currentQuestion = generateQuestionForRound(this.round, this.maxRounds);\n      if (level) {\n        this.currentQuestion.prompt = level.subtitle;\n      }\n    } else if \\2'''

content = re.sub(pattern6, replacement6, content)
print(f"After step 6: {len(content)}")

# 7. Disable timer in teaching mode
pattern7 = r'(if \(this\.tutorialActive\) return;)\n\n    // Start timer'
replacement7 = r'''\\1\n\n    if (this.teachingMode) return;\n\n    // Start timer'''

content = re.sub(pattern7, replacement7, content)
print(f"After step 7: {len(content)}")

# 8. Add teaching mode handling in handleAnswer()
pattern8 = r'(// Tutorial mode: no scoring, no lives lost\n    if \(this\.tutorialActive\) \{.*?return;\n    \})\n\n    if \(isCorrect\)'
replacement8 = r'''\\1\n\n    if (this.teachingMode) {\n      if (isCorrect) {\n        this.soundManager.playWin();\n        this.showTeachingCorrectFeedback(q, optionIndex);\n      } else {\n        this.soundManager.playClick();\n        this.showTeachingRetryFeedback(q, optionIndex);\n      }\n      return;\n    }\n\n    if (isCorrect)'''

content = re.sub(pattern8, replacement8, content, flags=re.DOTALL)
print(f"After step 8: {len(content)}")

# 9. Add teaching feedback methods before showTutorialCorrectFeedback
pattern9 = r'(private showTutorialCorrectFeedback\(q: QuizQuestion, correctIndex: number\): void \{)'
replacement9 = r'''private showTeachingCorrectFeedback(q: QuizQuestion, correctIndex: number): void {\n    const depth = 1100;\n    const levels = GameConfig.beginner.trainingLevels;\n\n    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.75).setDepth(depth);\n    const panelW = 620;\n    const panelH = 380;\n    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)\n      .setStrokeStyle(3, 0x4a9e4a).setDepth(depth);\n    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 4, 0x4a9e4a).setDepth(depth);\n\n    const title = this.add.text(512, 270, 'CORRECT!', {\n      fontSize: '32px', color: '#4a9e4a', fontFamily: 'monospace', fontStyle: 'bold',\n    }).setOrigin(0.5).setDepth(depth + 1);\n\n    const expText = this.add.text(512, 340, q.explanation, {\n      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',\n      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,\n    }).setOrigin(0.5).setDepth(depth + 1);\n\n    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, expText];\n\n    const isLastLevel = this.currentTrainingLevel >= levels.length - 1;\n    const btnLabel = isLastLevel ? 'COMPLETE!' : 'NEXT LESSON';\n    const btnW = 200;\n    const btnH = 48;\n    const btnY = 360 + panelH / 2 - 40;\n    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0x4a9e4a)\n      .setStrokeStyle(3, 0x2b1810).setDepth(depth);\n    const btnText = this.add.text(512, btnY, btnLabel, {\n      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',\n    }).setOrigin(0.5).setDepth(depth + 1);\n    const btnHit = this.add.rectangle(512, btnY, btnW, btnH, 0xffffff, 0)\n      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);\n    btnHit.on('pointerover', () => btnBg.setFillStyle(0x5abf5a));\n    btnHit.on('pointerout', () => btnBg.setFillStyle(0x4a9e4a));\n    btnHit.on('pointerdown', () => {\n      this.soundManager.playClick();\n      elements.forEach(el => el.destroy());\n      if (isLastLevel) {\n        this.showTeachingComplete();\n      } else {\n        this.proceedToNextRound();\n      }\n    });\n    elements.push(btnBg, btnText, btnHit);\n\n    this.feedbackContainer.add(elements);\n    elements.forEach(el => { (el as any).setAlpha?.(0); });\n    this.tweens.add({\n      targets: elements,\n      alpha: 1,\n      duration: 300,\n    });\n  }\n\n  private showTeachingRetryFeedback(q: QuizQuestion, chosenIndex: number): void {\n    const depth = 1100;\n    const levels = GameConfig.beginner.trainingLevels;\n    const level = levels[this.currentTrainingLevel];\n\n    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.7).setDepth(depth);\n    const panelW = 600;\n    const panelH = 320;\n    const panel = this.add.rectangle(512, 360, panelW, panelH, 0x1a0f08)\n      .setStrokeStyle(3, 0xc73e3a).setDepth(depth);\n    const topAccent = this.add.rectangle(512, 360 - panelH / 2 + 4, panelW - 10, 4, 0xc73e3a).setDepth(depth);\n\n    const title = this.add.text(512, 290, 'NOT QUITE!', {\n      fontSize: '28px', color: '#c73e3a', fontFamily: 'monospace', fontStyle: 'bold',\n    }).setOrigin(0.5).setDepth(depth + 1);\n\n    const hintText = this.add.text(512, 340, 'Let\\'s review the concept:', {\n      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',\n    }).setOrigin(0.5).setDepth(depth + 1);\n\n    const descText = this.add.text(512, 385, level ? level.description : '', {\n      fontSize: '13px', color: '#c9b89a', fontFamily: 'monospace',\n      align: 'center', wordWrap: { width: panelW - 60 }, lineSpacing: 6,\n    }).setOrigin(0.5).setDepth(depth + 1);\n\n    const subText = this.add.text(512, 420, 'Try again!', {\n      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',\n    }).setOrigin(0.5).setDepth(depth + 1);\n\n    const elements: Phaser.GameObjects.GameObject[] = [overlay, panel, topAccent, title, hintText, descText, subText];\n\n    const btnW = 160;\n    const btnH = 44;\n    const btnY = 360 + panelH / 2 - 35;\n    const btnBg = this.add.rectangle(512, btnY, btnW, btnH, 0xc73e3a)\n      .setStrokeStyle(3, 0x2b1810).setDepth(depth);\n    const btnText = this.add.text(512, btnY, 'TRY AGAIN', {\n      fontSize: '15px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',\n    }).setOrigin(0.5).setDepth(depth + 1);\n    const btnHit = this.add.rectangle(512, btnY, btnW, btnH, 0xffffff, 0)\n      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);\n    btnHit.on('pointerover', () => btnBg.setFillStyle(0xe04e4a));\n    btnHit.on('pointerout', () => btnBg.setFillStyle(0xc73e3a));\n    btnHit.on('pointerdown', () => {\n      this.soundManager.playClick();\n      elements.forEach(el => el.destroy());\n      this.questionContainer.removeAll(true);\n      this.answered = false;\n      this.renderQuestion();\n    });\n    elements.push(btnBg, btnText, btnHit);\n\n    this.feedbackContainer.add(elements);\n    elements.forEach(el => { (el as any).setAlpha?.(0); });\n    this.tweens.add({\n      targets: elements,\n      alpha: 1,\n      duration: 300,\n    });\n  }\n\n  private showTeachingComplete(): void {\n    const depth = 1300;\n    const overlay = this.add.rectangle(512, 360, 1024, 720, 0x000000, 0.9).setDepth(depth);\n\n    const title = this.add.text(512, 260, 'CONGRATULATIONS!', {\n      fontSize: '36px', color: '#e5b567', fontFamily: 'monospace', fontStyle: 'bold',\n    }).setOrigin(0.5).setDepth(depth + 1);\n\n    const subtitle = this.add.text(512, 320, 'You completed all teaching lessons!', {\n      fontSize: '18px', color: '#c9b89a', fontFamily: 'monospace',\n    }).setOrigin(0.5).setDepth(depth + 1);\n\n    const desc = this.add.text(512, 380, 'You learned:\\n· Winning hands (4 sets + 1 pair)\\n· Waiting tiles and tenpai\\n· Yaku patterns like Tanyao and Riichi\\n· Optimal discarding strategy\\n· Safe discards', {\n      fontSize: '14px', color: '#f5e6d3', fontFamily: 'monospace',\n      align: 'center', lineSpacing: 8,\n    }).setOrigin(0.5).setDepth(depth + 1);\n\n    const btnW = 200;\n    const btnH = 50;\n    const btnBg = this.add.rectangle(512, 470, btnW, btnH, 0xc73e3a)\n      .setStrokeStyle(3, 0x2b1810).setDepth(depth);\n    const btnText = this.add.text(512, 470, 'PLAY NOW', {\n      fontSize: '16px', color: '#f5e6d3', fontFamily: 'monospace', fontStyle: 'bold',\n    }).setOrigin(0.5).setDepth(depth + 1);\n    const btnHit = this.add.rectangle(512, 470, btnW, btnH, 0xffffff, 0)\n      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);\n    btnHit.on('pointerover', () => btnBg.setFillStyle(0xe04e4a));\n    btnHit.on('pointerout', () => btnBg.setFillStyle(0xc73e3a));\n    btnHit.on('pointerdown', () => {\n      this.soundManager.playClick();\n      window.location.href = '/play';\n    });\n\n    const elements = [overlay, title, subtitle, desc, btnBg, btnText, btnHit];\n    elements.forEach(el => { (el as any).setAlpha?.(0); });\n    this.tweens.add({\n      targets: elements,\n      alpha: 1,\n      duration: 400,\n    });\n  }\n\n\\1'''

content = re.sub(pattern9, replacement9, content)
print(f"After step 9: {len(content)}")

with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("File updated successfully!")
