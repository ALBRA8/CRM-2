# Kit S4 — Cache durable de replay (jti) + rate limit persistente

**Tarea del plan**: S4 (WP + ULTRA). **Fuente del patrón**: CRM (`src/lib/rate-limit.ts` dbRateLimit atómico; SSO con jti de un solo uso en `src/lib/ecosystem-sso.ts`, que en el CRM es en-memoria porque un solo proceso lo sirve — en WP/ULTRA el riesgo de replay tras reinicio exige durabilidad).

## Qué resuelve

Replay de un jti tras reinicio del servicio y ráfagas que el rate limit en memoria no ve. Con la cache durable:

- el jti canjeado queda en SQLite: reinicio NO lo desbloquea;
- el contador de rate limit comparte exactitud entre procesos que comparten la BD;
- purga perezosa por TTL (6 h por defecto) sin cron.

## Dónde va

- Copia `durable-replay-cache.mjs` al módulo de seguridad del repo destino (p. ej. `src/security/durable-replay-cache.mjs`).
- Dependencia: `better-sqlite3` (ya presente en ambos motores por sus colas; si no, añadirla al PR).
- La BD vive junto a la del servicio (p. ej. `./data/security-cache.db`), en volumen persistente.

## Cableado mínimo

```js
// SSO: en el canje del token de sesión SSO (donde hoy hay Set en memoria):
const cache = createDurableReplayCache({ dbPath: './data/security-cache.db' })
if (!cache.claimJti(payload.jti, 90_000)) return res.status(409).json({ error: 'Token ya usado' })

// Rate limit de endpoints sensibles (login, reset-password):
const rl = cache.rateLimit(`login:${ip}`, 5, 15 * 60_000)
if (!rl.ok) { res.set('Retry-After', String(rl.retryAfter)); return res.status(429).json({ error: 'Demasiados intentos' }) }
```

## Validación (en el repo destino)

1. Suite del kit portada (`tests/kits/s4-*.test.ts`): claim único, durabilidad reabriendo la BD, límite exacto.
2. Prueba de reinicio real: canjear jti → reiniciar el servicio → reintentar el mismo token → 409.

## Reversión

El módulo es aditivo: revertir el PR lo elimina sin tocar datos de negocio (la BD de la cache se puede borrar; los jti vencidos no se reutilizan).
