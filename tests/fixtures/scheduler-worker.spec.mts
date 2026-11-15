import { afterAll, it, expect } from 'vitest'
import { runDueJobs } from '@/lib/scheduler'
import { db } from '@/lib/db'

const organizationId = process.env.SCHEDULER_WORKER_ORG_ID

it('runs one scheduler tick in an independent process', async () => {
  if (!organizationId) throw new Error('SCHEDULER_WORKER_ORG_ID is required')
  const result = await runDueJobs({ orgId: organizationId })
  expect(result).toHaveProperty('processed')
})

afterAll(async () => {
  await db.$disconnect()
})
