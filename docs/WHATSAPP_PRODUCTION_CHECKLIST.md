# Checklist de producción de WhatsApp (CRM ALBRA)

Este checklist cubre los dos transportes WhatsApp del CRM ALBRA. **Elije UN transporte por número de negocio para producción**; no habilites auto-respuesta de Cloud API y el daemon Baileys para el mismo tráfico entrante sin una política de enrutamiento explícita que evite respuestas duplicadas.

> Port del endurecimiento de `fix/whatsapp-production-media` (integrado 2026-11-20 en la línea maestra): guardas de media en el daemon, firma binaria de imágenes y ASR por organización. Las brechas de fiabilidad que la rama original dejaba abiertas (outbox durable, idempotencia de webhook) ya están cerradas por la arquitectura `ChannelOutboundMessage` de la maestra — ver la sección final.

## Transporte y secretos

### WhatsApp Web / daemon Baileys
- Ejecuta `npm run wa:daemon` como servicio supervisado (`deploy/systemd/crm-wa-daemon.service`), nunca como proceso de terminal interactivo.
- Define un `INTERNAL_API_SECRET` único de al menos 32 caracteres, DISTINTO de `APP_SECRET` y `APP_ENCRYPTION_KEY`, en el servidor Next Y en el daemon.
- Define `NEXT_APP_URL` con el origen privado del CRM alcanzable desde el daemon.
- Persiste `src/whatsapp-daemon/.wa-auth` en un volumen privado. Jamás commitees credenciales de sesión ni expongas el puerto del daemon (escucha en 127.0.0.1:3002 por defecto).
- Vincula cada sesión desde la UI autenticada del CRM: una sesión pertenece a EXACTAMENTE una organización.
- Mantén el daemon detrás de red privada o reverse proxy con TLS y control de acceso estricto.

### WhatsApp Cloud API
- Configura `WHATSAPP_VERIFY_TOKEN` como valor aleatorio separado (no es el Meta App Secret).
- Configura Meta App Secret, Phone Number ID y token de Cloud API en los ajustes cifrados de la organización (AES-256-GCM con clave externa).
- Publica `/api/whatsapp/webhook` por HTTPS y suscribe la app de Meta a `messages`.
- Toda petición POST debe llevar `X-Hub-Signature-256` válida; las firmas inválidas se rechazan.
- El dedupe de eventos de webhook es DURABLE (`ChannelWebhookEvent` con clave por conexión+eventKey): reenvíos duplicados de Meta no generan respuestas duplicadas.

## Imágenes y visión
- En **Ajustes → IA del CRM**, configura un proveedor compatible multimodal (`chat/completions` OpenAI con `image_url` data URLs). Si el modelo de conversación es solo texto, la capa de visión degrada al adaptador nativo del entorno.
- Las imágenes entrantes del daemon se descargan con allowlist JPEG/PNG/WebP/GIF y techo de **8 MiB**; el endpoint interno valida MIME declarado, codificación base64 canónica, **firma binaria (magic bytes)**, integridad interna con techo de **40 megapíxeles** (sharp) antes de gastar tokens de visión.
- Los captions viajan como contexto del análisis. Si la descarga, validación o visión falla, el mensaje queda retenido para revisión humana y el agente NO inventa descripción (fail-open a humano, mismo patrón que la voz).

## Voz (ASR)
- Las notas de voz se descargan con techo de **25 MiB** y se envían a `/api/whatsapp/transcribe` con el header `X-WhatsApp-Org-Id` de la sesión.
- El CRM intenta primero un endpoint ASR compatible con OpenAI cuando `ASR_API_KEY` está configurada (`ASR_BASE_URL` por defecto `https://api.openai.com/v1`; modelo `whisper-1`, sobreescribible con `ASR_MODEL`); si no, usa el LLM configurado por la organización; si tampoco, degrada al adaptador ASR nativo. Una clave ASR dedicada se recomienda cuando el LLM principal no expone transcripción de voz.
- Si el ASR no está disponible o no devuelve transcripción usable, el mensaje queda visible para revisión humana y no se genera respuesta automática con texto inventado.
- **Respuestas habladas salientes / TTS no están implementadas**; el agente responde con texto.

## Aceptación requerida en staging
- Mensaje de texto: un mensaje entrante, un registro entrante almacenado, a lo sumo una respuesta automática.
- Imagen con caption: caption + descripción visual correctos en el contexto; sin afirmaciones falsas sobre contenido ilegible.
- Imagen corrupta, no soportada, sobredimensionada o de alta resolución: rechazada de forma segura y enrutada a revisión humana.
- Nota de voz: transcripción visible y el agente responde a partir de ella; transcripción fallida visible y sin respuesta automática.
- Entrega duplicada: reenvía el mismo evento Baileys y el mismo webhook Cloud; verifica que no haya respuesta IA ni notificación duplicada.
- Reconexión tras pérdida de red: el estado se recupera y el daemon no abre sockets duplicados.
- Petición cross-organización: el secreto/sesión de una organización no puede leer ni mutar conversaciones de otra.
- Confirma que los logs redactan tokens, contenido de mensajes y bytes de imagen/audio; rota cualquier secreto que haya llegado a chat o logs.

## Fiabilidad (cerrada en la maestra)
- **Outbox durable de respuestas**: `ChannelOutboundMessage` (clave `(conversationId, clientRequestId)`, estados queued/sending/sent/failed/unknown) + worker pull (`scripts/outbox-worker.mjs`) + reconciliación de inciertos por operador (Ajustes → Envíos). Un envío cuyo ACK se pierde queda en cuarentena `unknown` y NUNCA se reenvía a ciegas.
- **Idempotencia de webhook Cloud**: ledger durable por conexión+eventKey; un evento procesado es inmutable.
- CI en verde es necesario pero NO suficiente: emparejamiento QR, credenciales Meta, comportamiento real de proveedores ASR/visión, entrega saliente y reconexión deben validarse contra staging antes de declarar la integración lista para producción.
