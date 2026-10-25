import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages serves the site from the root of rcwebsim.umari.dev.
  // Set BASE_PATH to build for a subpath instead.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    vue(),
    // Installable and playable offline: the service worker precaches the app,
    // the Rapier WASM chunk, the textures, the environment map and the PA-18.
    // Other aircraft models and the hangar's props are cached the first time
    // they load, so the first visit doesn't download them twice.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'RC Flight Sim',
        short_name: 'RC Sim',
        description: 'Fly radio-controlled model aircraft from the pilot station.',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,hdr,gltf,glb,bin}'],
        globIgnores: ['models/!(pa18)/**', 'assets/hangar/**'],
        // The Rapier chunk inlines its WASM (~4 MB).
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/models\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'models', expiration: { maxEntries: 200 } },
          },
          {
            urlPattern: ({ url }) => /\/assets\/hangar\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'hangar', expiration: { maxEntries: 200 } },
          },
        ],
      },
    }),
  ],
  // Rapier ships its WASM inlined as base64 (~4 MB); it loads as its own chunk.
  build: { chunkSizeWarningLimit: 4500 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
})
