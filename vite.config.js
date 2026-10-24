import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { cloudflare } from '@cloudflare/vite-plugin';

function buildId() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    if (sha) return sha;
  } catch {
    /* a checkout without git still needs a label */
  }
  return new Date().toISOString();
}

// Cloudflare Workers is the deploy target (wrangler.jsonc). The Cloudflare
// plugin runs the real Worker — including /api/* PDF export — inside
// `vite dev`, so dev and production share one code path.
export default defineConfig({
  base: '/',
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
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
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
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
