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
      },
    },
  },
  server: {
    open: '/play.html',
  },
});
