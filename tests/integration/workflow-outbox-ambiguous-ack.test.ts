import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db'
import { enqueueWorkflowOutboundMessage, dispatchWorkflowOutboundMessage } from '@/lib/workflow-outbox'
import { FIX } from '../setup/seed-data'

const ACK_FAILURE_TRIGGER = 'test_fail_workflow_outbox_sent_ack'

describe('workflow WhatsApp ambiguous provider acknowledgement', () => {
  const outboundIds: string[] = []
  let automationId: string | undefined
  let runId: string | undefined
  let triggerInstalled = false
  const previousDaemonUrl = process.env.WHATSAPP_DAEMON_URL
  const previousInternalSecret = process.env.INTERNAL_API_SECRET

  afterEach(async () => {
    vi.restoreAllMocks()
    if (triggerInstalled) {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${ACK_FAILURE_TRIGGER}"`)
      triggerInstalled = false
    }
    if (previousDaemonUrl === undefined) delete process.env.WHATSAPP_DAEMON_URL
    else process.env.WHATSAPP_DAEMON_URL = previousDaemonUrl
    if (previousInternalSecret === undefined) delete process.env.INTERNAL_API_SECRET
    else process.env.INTERNAL_API_SECRET = previousInternalSecret
    if (outboundIds.length) await db.workflowOutboundMessage.deleteMany({ where: { id: { in: outboundIds } } })
    if (runId) await db.automationRun.deleteMany({ where: { id: runId } })
    if (automationId) await db.automation.deleteMany({ where: { id: automationId } })
    outboundIds.length = 0
    automationId = undefined
    runId = undefined
  })

  it('quarantines an accepted send when persisting the provider ACK fails, and never sends it again', async () => {
    process.env.WHATSAPP_DAEMON_URL = 'http://daemon.test'
    process.env.INTERNAL_API_SECRET = 'test-internal-secret-0123456789' // scan-secrets:allow — valor ficticio exclusivo de esta prueba

    const automation = await db.automation.create({
      data: { organizationId: FIX.orgA.id, name: 'Ambiguous WhatsApp ACK', triggerType: 'manual', isActive: true, actions: '[]' },
    })
    automationId = automation.id
    const run = await db.automationRun.create({
      data: { organizationId: FIX.orgA.id, automationId: automation.id, status: 'running' },
    })
    runId = run.id

    const intent = await enqueueWorkflowOutboundMessage({
      organizationId: FIX.orgA.id,
      automationId: automation.id,
      automationRunId: run.id,
      stepIndex: 0,
      channel: 'whatsapp',
      payload: { to: '573001234567', text: 'mensaje de prueba sin envío real' },
    })
    outboundIds.push(intent.id)

    // Use a SQLite trigger instead of spying on Prisma's dynamic delegate.
    // This fails the real UPDATE statement that tries to persist status=sent.
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "${ACK_FAILURE_TRIGGER}"
      BEFORE UPDATE OF "status" ON "WorkflowOutboundMessage"
      WHEN NEW."status" = 'sent'
      BEGIN
        SELECT RAISE(ABORT, 'simulated ACK persistence failure');
      END;
    `)
    triggerInstalled = true

    // The daemon is fully mocked: no network request or real WhatsApp send.
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: true, messageId: 'provider-accepted-123' }),
      { status: 200 },
    ))

    expect(await dispatchWorkflowOutboundMessage(intent.id)).toEqual({ status: 'unknown' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const quarantined = await db.workflowOutboundMessage.findUnique({ where: { id: intent.id } })
    expect(quarantined).toMatchObject({
      status: 'unknown',
      providerMessageId: null,
      claimToken: null,
      attemptCount: 1,
    })

    expect(await dispatchWorkflowOutboundMessage(intent.id)).toEqual({ status: 'not_claimed' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
