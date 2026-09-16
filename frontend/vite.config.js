import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', deliberately not wired to any UI (#204): the plugin's
      // default registerType is 'autoUpdate', which calls skipWaiting()
      // immediately and can swap the running app out from under someone
      // mid-form-fill. 'prompt' without a prompt just means Workbox's own
      // default lifecycle applies instead - a new service worker installs
      // and precaches in the background, then waits; it only takes over
      // once every tab running the old version has closed. That's the
      // built-in safe behavior, not something built here - satisfies "cache
      // versioning is an acceptance criterion" without adding a visible
      // update banner, which the app's "no visual" sync requirement rules
      // out anyway.
      registerType: 'prompt',
      injectRegister: 'auto',
      workbox: {
        // Precaches the app shell only - JS/CSS/fonts/icons. API data is
        // deliberately NOT handled here; api/offline/cache.js and outbox.js
        // already own that via IndexedDB, with their own revalidation and
        // write-replay rules. Layering Workbox runtime caching over API
        // calls too would mean two independent caches disagreeing about
        // what's fresh.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico}'],
        // A deep-link reload (e.g. /login) while offline still needs the
        // SPA shell - the client-side router, not the network, resolves the
        // route from there.
        navigateFallback: '/index.html',
        // vercel.json marks /index.html no-cache at the HTTP layer so a
        // redeploy is picked up online - that header governs the browser's
        // HTTP cache, not the service worker, which intercepts fetch events
        // before HTTP caching applies. The two don't conflict: online, the
        // SW still serves its own precached shell instantly, and checks for
        // a new one in the background.
      },
      manifest: {
        name: 'FinSight',
        short_name: 'FinSight',
        description: 'Personal expense tracker',
        theme_color: '#040e11',
        background_color: '#040e11',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
