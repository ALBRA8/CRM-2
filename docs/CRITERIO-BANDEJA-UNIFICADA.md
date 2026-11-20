# Criterio de unificación de la bandeja (F3-T03 / M7 — plan definitivo v2.0)

## Problema

Conviven dos generaciones de modelo de mensajería:

| Fuente | Modelo | Key en la bandeja |
| --- | --- | --- |
| Legacy (daemon Baileys) | `WhatsAppConversation/WhatsAppMessage` | `wa:<convId>` |
| Legacy (timeline) | `TimelineEvent type=tg/ig/fb` | `tg:/ig:/fb:<clientId>` |
| Canónica multi-canal | `ChannelConversation/ChannelMessage` | `cc:<convId>` |

Sin criterio, el mismo contacto aparecía DOS veces (una por fuente) y el
operador perdía respuestas que quedaban en "la otra" bandeja.

## Criterio aprobado (merge read-only, sin borrados)

1. **Identidad del contacto**: `(canal, handle normalizado)`. WhatsApp →
   teléfono en dígitos (`normalizeWaPhone`); Telegram/Instagram/Messenger →
   handle exacto (chatId / senderId / recipientId).
2. **Gana la conversación canónica** (`cc:`): es el modelo que soporta lease,
   outbox, idempotencia y multi-número. Si no hay canónica, gana la legacy con
   cliente enlazado (mejor ficha 360).
3. **Historial completo preservado**: la fuente perdedora NO se borra ni se
   migra; su historial sigue íntegro en la ficha 360 del cliente. El merge es
   una vista, no una migración (cero riesgo de pérdida).
4. **No leídos se suman** entre duplicados: la señal de atención nunca baja.
5. El dedup vive en `dedupeInboxConversations()` (función PURA, testeada en
   `tests/unit/inbox-dedupe.test.ts`) y se aplica en `listInbox()` para toda
   consulta de la bandeja (`/api/inbox`).
6. MATIZ MULTI-NÚMERO: dos cuentas conectadas DISTINTAS que conversan con el
   mismo contacto mantienen su hilo por separado (una fila por cuenta); el
   dedup solo fusiona cuando hay al menos una fila legacy en el grupo (el
   caso histórico de la doble bandeja).

## Filtros (F3-T04)

`GET /api/inbox` acepta `channel`, `connection` (ChannelConnection id), `search`
(nombre/teléfono/último mensaje, case-insensitive) y `limit` (1–200). Los
filtros se aplican DESPUÉS del dedup: filtrar sobre duplicados sería confuso.
La UI añade búsqueda con debounce (300 ms) y selector de cuenta conectada.

## Límite declarado

Las salvaguardas de campaña (ventana 24 h, plantillas, consentimiento)
permanecen como dependencia externa (M2/M3/I6).
