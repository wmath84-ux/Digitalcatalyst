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
          selfDestroying: true,
          injectRegister: 'script',
          registerType: 'autoUpdate',
          includeAssets: ['ads.txt'],
          manifest: {
            name: 'Digital Catalyst',
            short_name: 'Digital Catalyst',
            description: 'Notes, courses, AI learning store, and student learning app.',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            orientation: 'landscape',
            theme_color: '#2563eb',
            background_color: '#ffffff',
            categories: ['education', 'productivity'],
            icons: [
              { src: '/icons/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
              { src: '/icons/icon-512x512.svg', sizes: '512x512', type: 'image/svg+xml' },
              { src: '/icons/maskable-icon-512x512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
            ]
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
            navigateFallbackDenylist: [/^\/api\//, /^\/admin(?:\/|$)/, /^\/__/],
            runtimeCaching: [
              {
                urlPattern: ({ request }) => ['script', 'style', 'image', 'font'].includes(request.destination),
                handler: 'CacheFirst',
                options: {
                  cacheName: 'digital-catalyst-static-assets',
                  expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 }
                }
              }
            ]
          },
          devOptions: { enabled: false }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          'react-router-dom': path.resolve(__dirname, 'utils/reactRouterDomShim.ts'),
        }
      }
    };
});
