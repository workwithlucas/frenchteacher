import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Professor de francês',
        short_name: 'Français',
        description: 'Conversação em francês por voz com professor de IA',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#f6f4ef',
        theme_color: '#1f3a5f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // As chamadas de API nunca passam pelo cache do service worker.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
