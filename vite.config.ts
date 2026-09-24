/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          let chunk: string | undefined
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) {
            chunk = 'vendor-three'
          } else if (/[\\/]node_modules[\\/](@react-three|three-stdlib)[\\/]/.test(id)) {
            chunk = 'vendor-r3f'
          } else if (/[\\/]node_modules[\\/](recharts|d3-)/.test(id)) {
            chunk = 'vendor-charts'
          } else if (/[\\/]node_modules[\\/]framer-motion[\\/]/.test(id)) {
            chunk = 'vendor-motion'
          }
          if (chunk) {
            console.log(`CHUNK [${chunk}] <- ${id.slice(-40)}`)
          }
          return chunk
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

