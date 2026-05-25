import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },

    plugins: [
      react(),

      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Claviculário Serbom',
          short_name: 'Serbom Keys',
          description: 'Controle inteligente de chaves',
          theme_color: '#2563eb',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: '/serbom-logo.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/serbom-logo.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
      }),
    ],

    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});