import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
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
          name: 'ACESSA - Gestão de Chaves',
          short_name: 'ACESSA',
          description: 'Controle inteligente de chaves',
          theme_color: '#BA7517',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: '/acessa-icon.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/acessa-icon.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
      }),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});