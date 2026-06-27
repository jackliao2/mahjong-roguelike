# DESIGN - Mahjong Roguelike

## Core Design Philosophy

### "Accidental Learning"
The game teaches mahjong the way Balatro teaches poker hands: players learn by doing, not by reading tutorials. Yaku (winning patterns) are discovered organically through gameplay.

### Target Audience
1. **Curious beginners**: Western players interested in mahjong but intimidated by complex rules
2. **Mahjong addicts**: Experienced players who want a quick digital fix

## Key Design Decisions

### 1. Simplified Single-Player Mahjong
**Decision**: Single-player draw/discard against a tile wall, no AI opponents.
**Rationale**: Reduces complexity for MVP. Players focus on hand-building and yaku recognition. Multiplayer/AI can be added later.

### 2. Riichi Rules (Japanese Mahjong)
**Decision**: Use Riichi mahjong rules, not Chinese or American variants.
**Rationale**: Most internationally recognized variant (via anime/manga). Most beginner-friendly. Rich yaku system provides natural roguelike "build" variety.

### 3. Yaku = Poker Hands
**Decision**: Yaku (winning patterns) directly replace poker hand rankings from Balatro.
**Rationale**: Players already understand "build a hand → score points" from card games. Yaku provides the same satisfaction with mahjong-specific patterns.

### 4. 5 Rounds Per Run
**Decision**: 5 rounds per run (not 8 like Slay the Spire).
**Rationale**: Mahjong hands take longer than card game turns. 5 rounds = ~15-20 minute runs, perfect for browser sessions. Final round is the "boss" with higher target score.

### 5. Score Scaling: 1.5x Per Round
**Decision**: Target score scales by 1.5x each round, with 1.5x extra for the final boss round.
**Rationale**: Early rounds are winnable with simple yaku (Tanyao, Pinfu = ~1000pts). Later rounds require multi-yaku hands or relic boosts.

### 6. Procedural Pixel-Art Tiles
**Decision**: Generate tile textures procedurally via Phaser Graphics API instead of using external sprites.
**Rationale**: Zero asset dependencies for M1. Tiles can be replaced with proper pixel art later. Keeps the repo lightweight.

### 7. Dual Tile Labeling
**Decision**: Every tile shows both traditional symbols AND Western-friendly hints (number + suit name).
**Rationale**: Beginners need the Western hint to identify tiles. Traditional symbols preserve authenticity and help players transition to real mahjong.

### 8. Romaji Subtitles for Yaku
**Decision**: All yaku shown as "English Name (Romaji)" e.g., "All Simples (Tanyao)".
**Rationale**: English names aid comprehension. Romaji preserves cultural connection and helps players recognize terms in anime/mahjong communities.

## Visual Design

### Palette (Warm Izakaya)
- **Dark Wood** (#2B1810): Background, panels
- **Warm Amber** (#D4A574): Buttons, accents, tile highlights
- **Vermillion** (#C73E3A): Important actions, dragon tiles, danger
- **Cream** (#F5E6D3): Text, tile backgrounds, light elements

### Typography
- **Press Start 2P**: Headers, pixel-art game text
- **Inter**: Body text, descriptions, SEO pages

### Tile Suits (Color-Coded)
- **Man (Characters)**: Dark ink (#1A1A2E)
- **Pin (Circles)**: Blue (#2C5F8A)
- **Sou (Bamboo)**: Green (#2D6A4F)
- **Winds**: Brown (#5C4033)
- **Dragons**: Red (#C73E3A)

## Learning Curve Design

### Rounds 1-3: Gentle Introduction
- Target scores achievable with single basic yaku
- Tanyao (All Simples) is the easiest to understand: "no 1s, 9s, or honors"
- Pinfu teaches sequence recognition
- Riichi teaches the concept of "declaring readiness"

### Rounds 4-5: Challenge
- Higher targets require multiple yaku or relic-enhanced scoring
- Players discover complex yaku through reward unlocks
- Boss round debuff increases target by 1.5x

### Death = Learning
- Game over screen shows which yaku the player used
- Encourages experimentation with different hand patterns
- Meta-progression unlocks provide new strategic options
