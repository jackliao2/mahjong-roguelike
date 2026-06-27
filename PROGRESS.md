# PROGRESS - Mahjong Roguelike

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

### In Progress
- [ ] M1 verification: test in browser, fix any rendering issues
- [ ] npm install completing

### Blocked
- (none currently)

### Next 3 Tasks
1. Verify M1 in browser: render 13 tiles, draw/discard, win detection
2. Start M2: implement 5 core yaku scoring in-game UI, round structure, win/lose screens
3. Start M3: reward selection screen, relic system, custom tile effects

### Milestone Status
- **M1 (Skeleton)**: ~90% complete — needs browser verification
- **M2 (Scoring)**: ~40% complete — yaku logic done, needs in-game scoring UI
- **M3 (Roguelike Layer)**: 0% — reward/relic systems defined but not built
- **M4 (Meta-progression)**: 0%
- **M5 (Polish & Launch)**: 5% — landing page done, needs deploy

### Technical Decisions
- Phaser 3 over Godot: web-first, better SEO landing page integration
- Procedural pixel-art tiles via Phaser Graphics API: no external asset dependencies for M1
- Multi-page Vite build: separate HTML entry points for SEO pages vs game
- localStorage for persistence: no backend needed at MVP
