import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Configuración exclusiva para el proceso hijo del test multiproceso.
// No ejecutar setup/env.ts: recrearía la SQLite compartida por el proceso padre.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/fixtures/scheduler-worker.spec.mts'],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 30_000,
  },
})
