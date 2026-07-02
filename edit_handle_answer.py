import re

with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'(// Tutorial mode: no scoring, no lives lost\n    if \(this\.tutorialActive\) \{.*?return;\n    \})\n\n    if \(isCorrect\)'
replacement = '''\\1

    if (this.teachingMode) {
      if (isCorrect) {
        this.soundManager.playWin();
        this.showTeachingCorrectFeedback(q, optionIndex);
      } else {
        this.soundManager.playClick();
        this.showTeachingRetryFeedback(q, optionIndex);
      }
      return;
    }

    if (isCorrect)'''

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

if new_content == content:
    print('Pattern not found')
else:
    with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('File updated successfully')
