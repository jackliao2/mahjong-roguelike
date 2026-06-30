# PROGRESS - Mahjong Roguelike

## Session: 2026-06-29

### Completed
- [x] Newbie learnability audit via Puppeteer newbie-test.mjs
- [x] Fixed DeckSelectScene default difficulty to `beginner` so first-time players never start in locked normal mode
- [x] Fixed handStructure shanten formula that falsely reported TENPAI; now uses conservative `4 - effectiveBlocks`
- [x] Simplified hand-structure vocabulary for novices ("shapes", "loose tiles", "READY")
- [x] Increased beginner-assist font sizes and improved hint legend wording
- [x] Improved recommended-action banner: clearer RIICHI/discard/win/next messages with full tile names
- [x] Added live "READY HAND — waiting for: ..." hint in the center yaku info area when tenpai
- [x] Updated Yaku Ref panel descriptions to avoid jargon ("runs" instead of "sequences")
- [x] Updated tutorial and onboarding copy to match new terminology and emphasize hints/banners
- [x] Verified changes with rebuilt newbie-test.mjs screenshots

## Session: 2026-06-27

### Completed
- [x] Project setup: Vite + TypeScript + Phaser 3
- [x] Core type definitions (Tile, Hand, Yaku, RunState, etc.)
- [x] Tile system: 136-tile mahjong set (man, pin, sou, wind, dragon)
- [x] Tile display info: English names + romaji + western hints for beginners
- [x] Tile wall: shuffle, draw, remaining count
- [x] Hand management: sort, add, discard, pair/triplet/sequence detection
- [x] Win detector: 4 sets + 1 pair detection, 7 pairs (Chiitoitsu), 13 orphans (Kokushi)
- [x] Tenpai detection: find all waiting tiles
- [x] Yaku system: 12 yaku implemented (Riichi, Tanyao, Pinfu, Yakuhai, Iipeikou, Sanshoku, Ittsu, Toitoi, Chiitoitsu, Honroutou, Sanankou, Kokushi)
- [x] Scoring: han-based calculation with mangan caps, relic multipliers
- [x] Run state: rounds, score targets, scaling difficulty
- [x] Pixel-art tile renderer: procedural texture generation (no external assets)
- [x] localStorage persistence: run state, meta-progression, settings
- [x] BootScene: generates all tile textures
- [x] GameScene: hand rendering, draw/discard, win detection, riichi, scoring
- [x] SEO landing page (index.html) with animated pixel tiles
- [x] How to Play page (/how-to-play.html)
- [x] Yaku List page (/yaku-list.html) with 15 yaku, anchor-linked
- [x] Game page (/play.html) with Phaser mount
- [x] SEO files: robots.txt, sitemap.xml
- [x] .gitignore configured
- [x] M2: Win/lose flow, yaku scoring UI, tenpai hints
- [x] M3: Reward selection screen (3 random cards: relic/customTile/yakuBoost)
- [x] M3: 10 relics implemented (Amber Lantern, Bamboo Flute, Ink Brush, Lucky Coin, etc.)
- [x] M3: 5 custom tiles (Red 5s, Golden Dragon, Lucky East)
- [x] M3: GameOverScene with full run stats + meta stats
- [x] M3: Run persistence (localStorage save/resume)
- [x] M3: Yaku boost rewards (+1 han to unlocked yaku)
- [x] M4: Meta-progression system (6 achievements, 5 starting decks)
- [x] SEO landing page (index.html) with animated pixel tiles
- [x] How to Play page (/how-to-play.html)
- [x] Yaku List page (/yaku-list.html) with 15 yaku, anchor-linked
- [x] Game page (/play.html) with Phaser mount
- [x] SEO files: robots.txt, sitemap.xml
- [x] .gitignore configured

### In Progress
- [ ] M5: Sound effects, mobile responsive, deploy prep

### Blocked
- GitHub push (needs repo creation on github.com/jackliao2)

### Next 3 Tasks
1. M5: Add sound effects (free assets from OpenGameArt)
2. M5: Mobile responsive testing
3. M5: Deploy to Vercel + submit to itch.io

### Milestone Status
- **M1 (Skeleton)**: 100% complete
- **M2 (Scoring)**: 100% complete
- **M3 (Roguelike Layer)**: 100% complete
- **M4 (Meta-progression)**: 100% complete (achievements + deck unlocks defined)
- **M5 (Polish & Launch)**: 30% — landing page done, game playable, needs sound/deploy

### Technical Decisions
- Phaser 3 over Godot: web-first, better SEO landing page integration
- Procedural pixel-art tiles via Phaser Graphics API: no external asset dependencies for M1
- Multi-page Vite build: separate HTML entry points for SEO pages vs game
- localStorage for persistence: no backend needed at MVP
