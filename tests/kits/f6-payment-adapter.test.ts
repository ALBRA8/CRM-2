import { describe, expect, it } from 'vitest'
import { createPaymentAdapter, PaymentAdapterError, PROVIDERS } from '../../integration-kits/wp-ultra/f6-payment-gateway/payment-adapter.mjs'

/**
 * Kit F6 (WP) — adaptador de cobro fail-closed: el simulador es EXPLÍCITO,
 * el proveedor real sin credenciales falla con error claro (jamás degrada en
 * silencio a simulador que oculte un cobro no hecho).
 */
describe('kit F6 — payment-adapter', () => {
  it('sin política → simulador para cualquier org, marcado EXPLÍCITO', async () => {
    const adapter = createPaymentAdapter({})
    const charge = await adapter.createCharge({ orgId: 'org-a', amount: 49000, currency: 'COP' })
    expect(charge).toMatchObject({ provider: 'simulator', simulator: true, status: 'approved_simulated', amount: 49000, currency: 'COP' })
    expect(charge.reference).toMatch(/^SIM-/)
  })

  it('proveedor por org desde la política; org sin entrada → simulador', async () => {
    const adapter = createPaymentAdapter({ policyJson: JSON.stringify({ 'org-a': 'wompi' }) })
    expect(adapter.resolveProvider('org-a')).toBe('wompi')
    expect(adapter.resolveProvider('org-b')).toBe('simulator')
  })

  it('proveedor real sin credenciales → error EXPLÍCITO con las variables faltantes', async () => {
    const adapter = createPaymentAdapter({ policyJson: JSON.stringify({ 'org-a': 'wompi' }) })
    await expect(adapter.createCharge({ orgId: 'org-a', amount: 1000 })).rejects.toThrow(/faltan WOMPI_PUBLIC_KEY, WOMPI_PRIVATE_KEY/)
    const mp = createPaymentAdapter({ policyJson: JSON.stringify({ 'org-a': 'mercadopago' }) })
    await expect(mp.createCharge({ orgId: 'org-a', amount: 1000 })).rejects.toThrow(/faltan MP_ACCESS_TOKEN/)
  })

  it('guardas de entrada: monto inválido, moneda no soportada y org faltante', async () => {
    const adapter = createPaymentAdapter({})
    await expect(adapter.createCharge({ orgId: 'org-a', amount: -5 })).rejects.toThrow(/número positivo/)
    await expect(adapter.createCharge({ orgId: 'org-a', amount: 0 })).rejects.toThrow(/número positivo/)
    await expect(adapter.createCharge({ orgId: 'org-a', amount: 100, currency: 'BTC' })).rejects.toThrow(/moneda no soportada/)
    await expect(adapter.createCharge({ amount: 100 })).rejects.toThrow(/orgId requerido/)
    await expect(adapter.createCharge({ orgId: 'org-a', amount: 100, currency: 'COP' })).resolves.toBeTruthy()
  })

  it('proveedor desconocido en la política → error al resolver (fail-fast)', () => {
    const adapter = createPaymentAdapter({ policyJson: JSON.stringify({ 'org-a': 'paypal' }) })
    expect(() => adapter.resolveProvider('org-a')).toThrow(/proveedor desconocido "paypal"/)
    expect(PROVIDERS).toEqual(['simulator', 'wompi', 'mercadopago', 'stripe'])
  })

  it('policyJson inválido → error tipado', () => {
    expect(() => createPaymentAdapter({ policyJson: '{no-json' })).toThrow(PaymentAdapterError)
  })
})
