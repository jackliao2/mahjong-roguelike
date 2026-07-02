const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'scenes', 'GameScene.ts');
let content = fs.readFileSync(filePath, 'utf8');

