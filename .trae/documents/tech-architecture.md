## 1. Architecture Design

```mermaid
flowchart TD
    subgraph "Frontend (Browser)"
        "Vite Dev Server" --> "Phaser 3 Game Engine"
        "Phaser 3 Game Engine" --> "Game Scenes"
        "Game Scenes" --> "Mahjong Logic"
        "Game Scenes" --> "Roguelike Logic"
        "Game Scenes" --> "UI/Rendering"
    end
    subgraph "Data Layer"
        "localStorage" --> "Run State"
        "localStorage" --> "Meta Progression"
        "localStorage" --> "Settings"
    end
    subgraph "Static Pages"
        "Landing Page (SEO)" 
        "How to Play"
        "Yaku List"
    end
    "Phaser 3 Game Engine" --> "Data Layer"
```

## 2. Technology Description
- **Engine**: Phaser 3.80+ (web-first, excellent tile/sprite support, mature scene management)
- **Frontend**: Vite 5 + TypeScript 5
- **Package Manager**: npm (Windows compatibility)
- **Backend**: None at MVP — all state in localStorage
- **Hosting**: Vercel (static deploy, automatic builds)
- **Analytics**: Umami (privacy-friendly, self-hosted or cloud)
- **Pixel Art**: Custom Phaser textures generated via Canvas API (no external asset downloads needed for M1)

## 3. Route Definitions
| Route | Purpose |
|-------|---------|
| / | Landing page (SEO-optimized, hero + play CTA) |
| /play | Main game (Phaser canvas mounted) |
| /how-to-play | Full mahjong rules guide |
| /yaku-list | Yaku encyclopedia with anchors |

## 4. Project Structure
```
/
├── index.html              # Landing page (SEO)
├── play.html               # Game page (Phaser mount)
├── how-to-play.html        # Rules guide
├── yaku-list.html          # Yaku encyclopedia
├── src/
│   ├── main.ts             # Phaser game bootstrap
│   ├── scenes/
│   │   ├── BootScene.ts        # Load/generate assets
│   │   ├── GameScene.ts        # Main gameplay
│   │   ├── RewardScene.ts      # Reward selection overlay
│   │   └── GameOverScene.ts    # Death/loss screen
│   ├── game/
│   │   ├── tiles.ts        # Tile definitions, types
│   │   ├── wall.ts         # Tile wall logic
│   │   ├── hand.ts         # Hand management
│   │   ├── winDetector.ts  # Winning hand detection
│   │   ├── yaku.ts         # Yaku definitions & scoring
│   │   └── scoring.ts      # Score calculation
│   ├── roguelike/
│   │   ├── run.ts          # Run state management
│   │   ├── relics.ts       # Relic definitions
│   │   ├── customTiles.ts  # Special tile effects
│   │   └── rewards.ts      # Reward generation
│   ├── render/
│   │   ├── tileRenderer.ts # Pixel-art tile rendering
│   │   └── ui.ts           # UI elements (score, buttons)
│   ├── data/
│   │   └── storage.ts      # localStorage wrapper
│   └── types/
│       └── index.ts        # Shared TypeScript types
├── public/
│   ├── robots.txt
│   ├── sitemap.xml
│   └── og-image.png
├── PROGRESS.md
├── DESIGN.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 5. Data Model

### 5.1 Core Types
```typescript
// Tile: suit (man/pin/sou/honor) + rank (1-9 for suited, 1-7 for honors)
interface Tile { suit: Suit; rank: number; id: string; }
type Suit = 'man' | 'pin' | 'sou' | 'wind' | 'dragon';

// Hand: 13 tiles + 1 drawn tile (if any)
interface Hand { tiles: Tile[]; drawnTile: Tile | null; }

// Yaku: winning pattern with han value
interface Yaku { id: string; name: string; romaji: string; han: number; condition: (hand: Hand) => boolean; }

// Run: roguelike run state
interface RunState { round: number; score: number; targetScore: number; relics: Relic[]; customTiles: CustomTile[]; }

// Relic: passive buff
interface Relic { id: string; name: string; description: string; effect: (state: RunState) => RunState; }
```

### 5.2 localStorage Schema
- `mjrg_run`: current run state (JSON)
- `mjrg_meta`: meta-progression (unlocks, currency, achievements)
- `mjrg_settings`: user preferences (sound, etc.)

## 6. Key Algorithms

### 6.1 Winning Hand Detection
- Check if 14 tiles = 4 sets (sequence/triplet) + 1 pair
- Brute-force partition: try each pair candidate, check if remaining 12 form 4 sets
- Set = sequence (3 consecutive same suit) or triplet (3 identical) 

### 6.2 Scoring Formula
- Score = basePoints × (1 + sum(relic multipliers))
- basePoints = sum of matched yaku han values × fu (basic 30 fu)
- Each custom tile can add flat bonuses or multipliers

## 7. SEO Strategy
- Target keywords: "mahjong quiz", "riichi mahjong quiz", "learn mahjong", "mahjong practice", "riichi mahjong browser game"
- /how-to-play targets "how to play mahjong", "mahjong rules"
- /yaku-list targets "mahjong yaku", "riichi yaku list"
- Sitemap, robots.txt, OG image from day 1
- Semantic HTML on landing pages (Phaser game is canvas-based, not SEO-relevant)
