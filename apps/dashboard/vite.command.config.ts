import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config';

export default defineConfig(env => mergeConfig(baseConfig(env), {
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://127.0.0.1:8021/api') },
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
}));
