import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pdfExportApiPlugin } from './vite.pdf-api.js';

// Vercel is the only supported deploy target for this app (it serves the
// /api/* functions PDF export depends on, which a GitHub Pages deploy
// cannot run) — no GITHUB_PAGES base-path branching or Pages 404 fallback.
export default defineConfig({
  base: '/',
  define: {
    // Showcase sample data is retired — never auto-load fake submissions/incidents.
    'import.meta.env.VITE_SHOWCASE': JSON.stringify(''),
  },
  plugins: [
    react(),
    tailwindcss(),
    pdfExportApiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      // pgia-logo.png/bacc-logo.jpeg stay precached — still used as the
      // favicon and in-app brand assets. icon-192/512 are dedicated,
      // properly-square install icons (see public/icon-*.png) — the old
      // manifest pointed both sizes at pgia-logo.png, a 3999x1676 wide
      // transparent wordmark, which the OS stretched/cropped into a
      // distorted home-screen icon.
      includeAssets: ['pgia-logo.png', 'bacc-logo.jpeg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'BACC Airport Portal',
        short_name: 'BACC Portal',
        description: 'Philip S.W. Goldson International Airport operations portal',
        theme_color: '#0B1E3D',
        background_color: '#F3F6FA',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpeg,jpg,json,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
