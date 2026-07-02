import re

with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'(private loadQuestion\(\): void \{)\n\s*(if \(this\.tutorialActive)'
replacement = '''\\1
    if (this.teachingMode) {
      const levels = GameConfig.beginner.trainingLevels;
      const level = levels[this.currentTrainingLevel];
      this.currentQuestion = generateQuestionForRound(this.round, this.maxRounds);
      if (level) {
        this.currentQuestion.prompt = level.subtitle;
      }
    } else if \\2'''

new_content = re.sub(pattern, replacement, content)

if new_content == content:
    print('Pattern not found')
else:
    with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('File updated successfully')
