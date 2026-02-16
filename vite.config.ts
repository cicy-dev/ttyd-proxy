import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3001,
        host: '0.0.0.0',
        allowedHosts: ['g-13334.cicy.de5.net'],
        proxy: {
          '/api': 'http://127.0.0.1:13335',
          '/vnc': { target: 'http://127.0.0.1:13335', ws: true },
          '/ttyd/cicy_master_xk_bot': { target: 'http://127.0.0.1:16000', ws: true, rewrite: (p: string) => p.replace(/^\/ttyd\/cicy_master_xk_bot/, '') },
          '/ttyd/cicy_test_final_bot': { target: 'http://127.0.0.1:16001', ws: true, rewrite: (p: string) => p.replace(/^\/ttyd\/cicy_test_final_bot/, '') },
          '/ttyd/cicy_test_auto_bot': { target: 'http://127.0.0.1:16002', ws: true, rewrite: (p: string) => p.replace(/^\/ttyd\/cicy_test_auto_bot/, '') },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
