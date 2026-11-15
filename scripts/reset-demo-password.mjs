/**
 * Restablece la contraseña del usuario demo@crmalbra.com a un valor conocido
 * para que el dueño pueda entrar a ver el CRM. Usa el mismo scrypt de src/lib/auth.ts.
 * La contraseña NUNCA se versiona: se toma de DEMO_PASSWORD (fail-fast si falta).
 */
import { randomBytes, scryptSync } from 'crypto'
import { PrismaClient } from '@prisma/client'

const PASSWORD = process.env.DEMO_PASSWORD
if (!PASSWORD || PASSWORD.length < 8) {
  console.error('DEMO_PASSWORD no definida (mínimo 8 caracteres). Ej: DEMO_PASSWORD=... node scripts/reset-demo-password.mjs')
  process.exit(1)
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}

const prisma = new PrismaClient()
const user = await prisma.user.update({
  where: { email: 'demo@crmalbra.com' },
  data: { passwordHash: hashPassword(PASSWORD), isActive: true },
  select: { email: true, role: true, isActive: true },
})
console.log('OK', JSON.stringify(user))
await prisma.$disconnect()
