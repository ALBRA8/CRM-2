# Kit M4 — Pacing durable para `/step` manual

**Tarea del plan**: M4 (ULTRA). **Cambio del plan**: «pasar durablePacing al server» — este kit es exactamente ese gate, persistido.

## Qué resuelve

Los despachos manuales por `/step` ignoran el ritmo de la campaña (cada operador dispara a su velocidad). Con el kit el ritmo es propiedad de la CAMPAÑA en SQLite: mismo gate para automático y manual, con lease exclusivo por campaña y cap diario.

## Dónde va

- Copia `durable-pacing.mjs` al módulo de campañas del repo destino (dependencia `better-sqlite3`).
- En el handler de `/step` de campaña:

```js
const gate = pacing.acquire(campaignId, { minIntervalMs: campaign.minIntervalMs, dailyCap: campaign.dailyCap, holder: `step-${req.ip}` })
if (!gate.allowed) {
  return res.status(429).json({
    error: 'Pacing de la campaña en curso',
    reason: gate.reason,            // 'interval' | 'lease_busy' | 'daily_cap_reached'
    retryAfterMs: gate.retryAfterMs,
    dailyRemaining: gate.dailyRemaining,
  })
}
try {
  await sendNextMessage(campaignId)     // el envío real existente
  pacing.recordSend(campaignId)         // activa el intervalo para el próximo step
} finally {
  pacing.release(campaignId)            // fin del step; el contador diario queda
}
```

## Validación (en el repo destino)

1. Suite del kit (`tests/kits/m4-*.test.ts`): intervalo, lease exclusivo, cap diario, durabilidad al reabrir la BD.
2. Staging: dos `/step` consecutivos < `minIntervalMs` → el segundo responde 429 con `retryAfterMs`.

## Reversión

Aditivo: revertir el PR elimina el gate; el despacho vuelve a ser sin ritmo (estado previo al plan).
