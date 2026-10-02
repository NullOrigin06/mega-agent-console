/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // React's runtime gets its own chunk first: otherwise the bundler hoists it (and
          // scheduler) into whichever vendor group claims it, and the entry ends up statically
          // importing vendor-three / vendor-charts just to get React.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react'
          }
          if (/[\\/]node_modules[\\/](three|@react-three|three-stdlib)/.test(id)) {
            return 'vendor-three'
          }
          if (/[\\/]node_modules[\\/](recharts|d3-)/.test(id)) {
            return 'vendor-charts'
          }
          if (/[\\/]node_modules[\\/]framer-motion[\\/]/.test(id)) {
            return 'vendor-motion'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
})

