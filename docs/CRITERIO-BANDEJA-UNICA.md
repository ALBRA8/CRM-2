# Criterio de unificación de la doble bandeja (M7 / F3-T03)

**Fecha**: 2026-11-20 · **Estado**: vigente por defecto, pendiente de firma A10 del propietario · **Reversible**: sí, sin migraciones ni borrados.

## Problema que resuelve

En la base conviven **dos generaciones de modelo** para canales:

| Generación | Modelo | Keys en la bandeja | Origen |
| --- | --- | --- | --- |
| Legacy (daemon) | `WhatsAppConversation` / `WhatsAppMessage` | `wa:<convId>` | Sesión QR Baileys |
| Legacy (timeline) | `TimelineEvent` agrupado por cliente | `tg:` / `ig:` / `fb:<clientId>` | Integraciones TG/IG/FB |
| Canónica | `ChannelConnection` → `ChannelConversation` → `ChannelMessage` | `cc:<convId>` | Webhooks Cloud API / Instagram / Telegram / TikTok con conexión explícita |

`listInbox()` concatenaba las cinco fuentes sin deduplicar: **un mismo contacto podía aparecer dos veces** (una fila legacy y una canónica) y el operador podía perder respuestas que quedaron "en la otra bandeja".

## Criterio vigente: "CANÓNICO PRIMERO, LEGACY COMO RESPALDO"

Es la opción recomendada por el PLAN DEFINITIVO (F3-T03) y se adopta como
criterio por defecto mientras el propietario no firme la decisión A10.

1. **Las canónicas siempre pasan** (`cc:*`). Son el modelo a futuro: outbox durable con reintentos, estado de entrega (`queued → sent → delivered → read`), conexión explícita por organización y cuenta. Entre sí no se deduplican: si la organización tiene dos números conectados y el contacto escribió a ambos, son dos hilos reales y cada fila muestra su cuenta (`connectionName`).
2. **Una legacy se oculta si existe una canónica con la misma identidad** (canal + handle). El contacto aparece UNA sola vez, con canal y cuenta claros.
3. **Duplicadas dentro de la generación legacy** (defensa defensiva): gana la fila con `lastMessageAt` más reciente.
4. **Sin identidad útil** (handle vacío o no normalizable): la fila pasa tal cual — nunca se oculta información por una normalización dudosa (fail-open informativo).

### Identidad de contacto (`inboxIdentity`)

- **WhatsApp**: solo dígitos (`normalizeWaPhone`). El daemon guarda E.164 sin `+` (`573001110000`) y el webhook canónico guarda `normalizePhone` (puede llevar `+`): ambas formas colisionan en la misma identidad.
- **Telegram / Instagram / Facebook / TikTok**: handle tal cual, recortado. Conservador: ante la duda NO se unifica (un falso negativo solo muestra una fila extra como hoy; un falso positivo ocultaría un hilo real).

## Qué NO hace (garantías)

- **No borra datos ni modelos**: la dedup es exclusivamente de vista, aplicada como función pura `dedupeInboxConversations()` dentro de `listInbox()` (`src/lib/inbox.ts`).
- **No divide el historial**: el historial completo de ambas generaciones sigue visible en la ficha 360 del cliente y en el dashboard.
- **No toca envíos**: los envíos ya son exclusivamente canónicos vía outbox (`sendInboxMessage` rechaza el envío legacy desde antes de este cambio).

## Reversibilidad

- Girar el criterio a "daemon primero" = invertir las reglas 1 y 2 en `dedupeInboxConversations`.
- Restaurar el comportamiento anterior = no llamar a la función en `listInbox` (un `git revert` del PR es limpio: no hay migraciones).

## Pruebas

- `tests/unit/inbox.test.ts`: casos de contacto presente en AMBAS fuentes (canónica + daemon, canónica + timeline), dedup intra-legacy, fail-open sin handle, y preservación de canónicas de distintas cuentas.
- Revisión manual recomendada (plan): bandeja en móvil con un contacto que haya escrito por QR y Cloud API.
