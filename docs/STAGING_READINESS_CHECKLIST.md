# Checklist de preparación para staging — CRM ALBRA8

**Repositorio:** `ALBRA8/CRM-ALBRA`  
**PR:** #3  
**Rama:** `fix/migration-safety-audit`  
**Base de datos del proyecto:** SQLite (decisión de alcance; PostgreSQL queda excluido).  
**Regla:** no marcar una casilla sin evidencia asociada al HEAD exacto que se pretende validar.

## Seguridad operativa

- [ ] Confirmar que `CHANNEL_OUTBOUND_DISPATCH_ENABLED` está apagado.
- [ ] Confirmar que `CHANNEL_AUTOREPLY_ENABLED` está apagado.
- [ ] Confirmar que `WORKFLOW_OUTBOX_DISPATCH_ENABLED` está apagado.
- [ ] Confirmar que `WHATSPOWER_ENABLED` está apagado.
- [ ] Confirmar que los secretos de worker no están configurados en entornos no autorizados.
- [ ] Confirmar que no hay destinatarios ni credenciales de producción en pruebas.

## CI y calidad

- [ ] Secret scan aprobado sobre HEAD exacto.
- [ ] Prisma validate/generate aprobado.
- [ ] Migración limpia SQLite aprobada.
- [ ] Migración de datos representativos SQLite aprobada, si hay cambios de esquema/datos.
- [ ] TypeScript aprobado.
- [ ] ESLint aprobado.
- [ ] Tests unitarios e integración aprobados.
- [ ] Tests de concurrencia y recuperación aprobados.
- [ ] Build de producción aprobado.

## Datos y recuperación

- [ ] Diagnóstico de backfill ejecutado en dry-run.
- [ ] Duplicados y conflictos revisados.
- [ ] Backfill idempotente demostrado con dos ejecuciones.
- [ ] Rollback probado en copia aislada de SQLite.
- [ ] Backup remoto de SQLite creado.
- [ ] Restauración en una instancia independiente verificada.
- [ ] Integridad relacional y credenciales cifradas verificadas.
- [ ] RPO/RTO medidos y documentados.

## OAuth y canales

- [ ] Refresh de TikTok probado con workers independientes usando el almacenamiento SQLite soportado por el proyecto.
- [ ] Rotación de access/refresh token y fencing comprobados.
- [ ] Estados uncertain/invalid_grant y reconexión probados.
- [ ] Callback OAuth valida tenant y persiste ambas representaciones.
- [ ] WhatsApp, Telegram, Instagram y Messenger tienen pruebas de contrato y deduplicación.
- [ ] TikTok Business Messaging tiene fixture autorizada y mapeo real de conversation_id.
- [ ] SMTP manual integrado a outbox idempotente o mantenido explícitamente deshabilitado.
- [ ] Gmail integrado al dispatcher canónico o mantenido explícitamente deshabilitado.
- [ ] Ninguna ruta legacy realiza llamadas externas sin el control correspondiente.
- [ ] Sandboxes de proveedores validados cuando estén disponibles.

## Multi-tenant y ejecución distribuida

- [ ] Matriz de acceso cruzado por API route completada.
- [ ] Consultas Prisma y relaciones revisadas por organizationId.
- [ ] Webhooks con IDs ausentes/repetidos no producen efectos duplicados.
- [ ] Scheduler usa lease/fencing en todas las escrituras de estado, conforme a las garantías reales de SQLite.
- [ ] Dos o más workers no procesan el mismo run/outbound simultáneamente bajo la configuración soportada.
- [ ] Crashes, expiración de lease, ACK tardío y estado unknown probados.
- [ ] Reconciliación no reintenta envíos ambiguos automáticamente.
- [ ] Alertas y procedimientos de pausa/recuperación comprobados.

## Aprobación

- [ ] Evidencia enlazada a commits y CI del mismo HEAD.
- [ ] Revisión humana de los cambios y del informe.
- [ ] PR permanece draft hasta que todos los criterios críticos estén aprobados.
- [ ] Autorización explícita separada para staging.
- [ ] Autorización explícita separada para merge/deploy/activación de workers/envíos reales.

## Estado

Este checklist define criterios de aceptación; sus casillas deben actualizarse únicamente con evidencia del HEAD evaluado. No constituye por sí solo un diagnóstico del estado actual. PostgreSQL no forma parte del alcance ni es requisito para staging. SMTP y Gmail manuales deben permanecer explícitamente deshabilitados hasta integrarse al pipeline idempotente canónico.
