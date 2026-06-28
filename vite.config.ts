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
        gamesLikeBalatro: resolve(__dirname, 'games-like-balatro.html'),
        riichiVsChinese: resolve(__dirname, 'riichi-vs-chinese-mahjong.html'),
        mahjongBrain: resolve(__dirname, 'mahjong-brain-benefits.html'),
        riichiStrategy: resolve(__dirname, 'riichi-mahjong-strategy.html'),
        license: resolve(__dirname, 'license.html'),
        contact: resolve(__dirname, 'contact.html'),
      },
    },
  },
  server: {
    open: '/play.html',
  },
});
