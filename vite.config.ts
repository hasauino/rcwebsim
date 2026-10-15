import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; CI sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    vue(),
    // Installable and playable offline: the service worker precaches the app,
    // the Rapier WASM chunk and every model, texture and environment map.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'RC Flight Sim',
        short_name: 'RC Sim',
        description: 'Fly a radio-controlled PA-18 Super Cub from the pilot station.',
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
        // The Rapier chunk inlines its WASM (~4 MB).
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
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
