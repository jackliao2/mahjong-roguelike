import re

with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'(if \(this\.tutorialActive\) return;)\n\n    // Start timer'
replacement = '''\\1

    if (this.teachingMode) return;

    // Start timer'''

new_content = re.sub(pattern, replacement, content)

if new_content == content:
    print('Pattern not found')
else:
    with open(r'c:\Users\jackl\Desktop\trae_junproject\src\scenes\GameScene.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('File updated successfully')
