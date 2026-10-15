import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Rapier ships its WASM inlined as base64 (~4 MB); it loads as its own chunk.
  build: { chunkSizeWarningLimit: 4500 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
})
