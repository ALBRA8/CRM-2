#!/usr/bin/env node
/**
 * Arranque multiplataforma del servidor standalone (reemplaza
 * `NODE_ENV=production bun ...`, incompatible con Windows — auditoría).
 */
import { spawn } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = join(root, '.env')
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile)
  } catch {}
}

// Asegurar DATABASE_URL con ruta absoluta para evitar problemas con chdir de Next standalone
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:') && !process.env.DATABASE_URL.includes(':')) {
  // relative file:
}

const server = join(root, '.next', 'standalone', 'server.js')

const child = spawn(process.execPath, [server], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production' },
})
child.on('exit', (code) => process.exit(code ?? 0))
