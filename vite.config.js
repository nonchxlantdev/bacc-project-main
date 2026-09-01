import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pdfExportApiPlugin } from './vite.pdf-api.js';

const base = process.env.GITHUB_PAGES === 'true' ? '/bacc-project-main/' : '/';

function spaFallback404Plugin() {
  return {
    name: 'spa-github-pages-404',
    closeBundle() {
      if (process.env.GITHUB_PAGES !== 'true') return;
      const index = path.resolve('dist/index.html');
      const dest = path.resolve('dist/404.html');
      if (existsSync(index)) copyFileSync(index, dest);
    },
  };
}

export default defineConfig({
  base,
  define: {
    'import.meta.env.VITE_SHOWCASE': JSON.stringify(
      process.env.GITHUB_PAGES === 'true' || process.env.VITE_SHOWCASE === 'true' ? 'true' : '',
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    pdfExportApiPlugin(),
    spaFallback404Plugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pgia-logo.png', 'bacc-logo.jpeg'],
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
            src: 'pgia-logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pgia-logo.png',
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
