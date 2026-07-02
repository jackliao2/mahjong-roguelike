import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play.html'),
        howToPlay: resolve(__dirname, 'how-to-play.html'),
        yakuList: resolve(__dirname, 'yaku-list.html'),
        blog: resolve(__dirname, 'blog.html'),
        gamesLikeBalatro: resolve(__dirname, 'games-like-balatro.html'),
        riichiVsChinese: resolve(__dirname, 'riichi-vs-chinese-mahjong.html'),
        mahjongBrain: resolve(__dirname, 'mahjong-brain-benefits.html'),
        riichiStrategy: resolve(__dirname, 'riichi-mahjong-strategy.html'),
        waitingTiles: resolve(__dirname, 'waiting-tiles-explained.html'),
        beginnerMistakes: resolve(__dirname, 'beginner-mistakes-riichi-mahjong.html'),
        tileEfficiency: resolve(__dirname, 'tile-efficiency-mahjong.html'),
        bestOnlineMahjong: resolve(__dirname, 'best-online-mahjong-games-2026.html'),
        howToWinQuiz: resolve(__dirname, 'how-to-win-mahjong-quiz.html'),
        handReading: resolve(__dirname, 'mahjong-hand-reading-guide.html'),
        license: resolve(__dirname, 'license.html'),
        contact: resolve(__dirname, 'contact.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
        cookies: resolve(__dirname, 'cookies.html'),
      },
    },
  },
  server: {
    open: '/play.html',
  },
});
