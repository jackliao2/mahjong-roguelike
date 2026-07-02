## 1. Product Overview

A browser-based Mahjong Quiz in 16-bit pixel-art style that teaches Riichi mahjong rules organically through multiple-choice quiz progression. Targeting Western players who are curious about mahjong but find it intimidating, or mahjong addicts who need a digital fix. Players "accidentally learn" mahjong by answering 4-option questions on tenpai, yaku, waiting tiles, and discards.

## 2. Core Features

### 2.1 Target Users
| User Type | Motivation | Skill Level |
|-----------|-----------|-------------|
| Curious beginner | Wants to learn mahjong without intimidation | Zero mahjong knowledge |
| Mahjong addict | Needs a quick digital fix | Knows riichi rules |

### 2.2 Feature Modules
1. **Game (main play screen)**: Tile hand rendering, draw/discard, scoring, round progression
2. **Landing page**: SEO-optimized hero, how-to-play CTA, yaku showcase
3. **How to Play page**: Full mahjong rules in beginner-friendly English
4. **Yaku List page**: Every yaku with visual examples, anchor-linked for SEO
5. **Reward selection screen**: 3 random cards between rounds (tiles, yaku cards, relics)
6. **Meta-progression**: Unlock system, persistent currency, achievements

### 2.3 Page Details
| Page Name | Module Name | Feature Description |
|-----------|-------------|---------------------|
| Landing (/) | Hero section | Animated tile showcase, play CTA, SEO copy |
| Landing (/) | Yaku preview | Carousel of 3 starter yaku with visuals |
| Game (/play) | Hand area | 13-tile hand, draw/discard, tile tooltips |
| Game (/play) | Score panel | Current score, target, round counter |
| Game (/play) | Reward screen | 3-card pick between rounds |
| How to Play (/how-to-play) | Rules guide | Full mahjong rules, tile guide, yaku basics |
| Yaku List (/yaku-list) | Yaku encyclopedia | All yaku with patterns, han values, examples |

## 3. Core Process

Player starts a run → plays mahjong hands (draw/discard) → wins by forming 4 sets + 1 pair → score = yaku × multipliers → between rounds pick 1 of 3 rewards → difficulty scales → final boss → death = meta-progression unlock.

```mermaid
flowchart TD
    "Start Run" --> "Round 1: Draw 13 tiles"
    "Round 1: Draw 13 tiles" --> "Draw & Discard"
    "Draw & Discard" --> "Win hand? (4 sets + 1 pair)"
    "Win hand? (4 sets + 1 pair)" -->|"Yes"| "Score = Yaku × Multipliers"
    "Win hand? (4 sets + 1 pair)" -->|"No"| "Draw & Discard"
    "Score = Yaku × Multipliers" --> "Target met?"
    "Target met?" -->|"No"| "Game Over"
    "Target met?" -->|"Yes"| "Reward: Pick 1 of 3"
    "Reward: Pick 1 of 3" --> "Next Round (harder)"
    "Next Round (harder)" --> "Round 1: Draw 13 tiles"
    "Game Over" --> "Meta-progression unlocks"
    "Meta-progression unlocks" --> "Start Run"
```

## 4. User Interface Design

### 4.1 Design Style
- **Aesthetic**: 16-bit pixel art, warm izakaya palette (warm wood, amber, deep red accents)
- **Primary colors**: #2B1810 (dark wood), #D4A574 (warm amber), #C73E3A (vermillion), #F5E6D3 (cream)
- **Tile size**: 32x48 px minimum, rendered with crisp pixel scaling
- **Typography**: Pixel font for headers (e.g., "Press Start 2P"), clean sans for body
- **Layout**: Horizontal hand at bottom, score/info at top, center play area
- **Animations**: Tile flip on draw, sparkle on win, card flip on reward

### 4.2 Page Design Overview
| Page Name | Module Name | UI Elements |
|-----------|-------------|-------------|
| Landing | Hero | Pixel tile animation, bold title, play button, warm gradient bg |
| Game | Hand area | Bottom-center, 13 tiles, hover tooltip, click to discard |
| Game | Score panel | Top-left, round/score/target, pixel number font |
| Game | Reward screen | Center overlay, 3 cards with hover lift effect |
| Yaku List | Yaku cards | Grid of yaku cards, each with pattern visual + han value |

### 4.3 Responsiveness
- Desktop-first (mouse-driven tile interaction)
- Mobile-adaptive: larger tiles, touch-friendly discard
- Minimum playable width: 768px; mobile scales down to 375px

## 5. Learning Design Principles
- Rounds 1-3 winnable with only Riichi, Tanyao, Pinfu
- Each new yaku unlock = tooltip + animated example
- Tiles show traditional symbol + Western hint (number + suit name)
- All yaku names: English with romaji subtitle (e.g., "All Simples (Tanyao)")
- Hover any tile → show what it is + potential yaku contributions
- No Chinese/Japanese text in core UI

## 6. Monetization (Planned, Not Built)
- Free web version with reserved banner ad slot
- Premium $4.99: all characters, custom tile skins, daily challenge
- Future Steam port $9.99
