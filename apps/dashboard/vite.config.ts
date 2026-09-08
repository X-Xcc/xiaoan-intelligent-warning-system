import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    proxy: {
      '/api': {
        target: process.env.CICSIC_PROXY_TARGET || 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
    },
  },
});
