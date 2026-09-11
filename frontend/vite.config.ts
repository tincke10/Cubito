import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    port: 5180
  },
  preview: {
    host: true,
    port: 5180,
    strictPort: true
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
