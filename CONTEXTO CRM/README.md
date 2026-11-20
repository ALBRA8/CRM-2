# CONTEXTO CRM

Memoria documental del repositorio **ALBRA8/CRM-ALBRA**. Esta carpeta pertenece al proyecto CRM; no es un repositorio independiente ni sustituye la documentación técnica.

## Índice
- [Estado actual](ESTADO_ACTUAL.md)
- [Arquitectura](ARQUITECTURA.md)
- [Arquitectura multicuenta de canales y guía obligatoria para agentes](ARQUITECTURA_MULTICUENTA_CANALES.md)
- [Decisiones](DECISIONES.md)
- [Plan maestro SaaS](PLAN_MAESTRO_SAAS.md)
- [Roadmap resumido](ROADMAP.md)
- [Historial](HISTORIAL_CAMBIOS.md)
- [Auditorías](AUDITORIAS.md)
- [Auditoría futura de redundancias y simplificación (posterior a las 48 tareas)](AUDITORIA_REDUNDANCIAS_Y_SIMPLIFICACION_FASE_POSTERIOR.md)
- [Informe de auditoría de redundancias y simplificación (ejecutado)](INFORME_AUDITORIA_REDUNDANCIAS_Y_SIMPLIFICACION.md)
- [Pendientes](PENDIENTES.md)
- [Runbook operativo de canales](RUNBOOK_CANALES.md)
- [Ingeniería inversa y lecciones operativas de WhatsON (Webinar oficial)](INGENIERIA_INVERSA_WHATSON_WEBINAR.md)

## Reglas
1. Diferenciar hechos verificados en código, declaraciones del README, decisiones, propuestas y pendientes.
2. No presentar planes como funcionalidades implementadas.
3. Registrar fecha, rama, commit y evidencia de cada auditoría.
4. No guardar secretos, tokens, contraseñas, datos de clientes ni archivos .env.
5. El código de la rama correspondiente es la fuente de verdad del comportamiento.
6. Antes de tocar multicuenta, webhooks, inbox o envíos, leer [ARQUITECTURA_MULTICUENTA_CANALES.md](ARQUITECTURA_MULTICUENTA_CANALES.md), especialmente **Instrucciones operativas para agentes**. Sus reglas de tenant isolation, conexión exacta, compatibilidad legacy y no activación de envíos reales son obligatorias.
