import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: mode === 'native' ? {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8010/api'),
    'import.meta.env.VITE_SECURITY_MONITOR_URL': JSON.stringify(process.env.VITE_SECURITY_MONITOR_URL || 'http://127.0.0.1:8010/api/security-video/feed?cam=0'),
  } : undefined,
  server: {
    port: 5177,
    proxy: {
      '/api': {
        target: process.env.CICSIC_PROXY_TARGET || 'http://127.0.0.1:8010',
        changeOrigin: true,
        ws: true,
      },
    },
  },
}));
