# OWNER_TODO — Acciones que SOLO el dueño puede ejecutar

**Actualizado:** 2026-11-20 · **Ramas:** `repair/produccion-real` + plan definitivo (S1/S2 en curso)

## 0. Nuevas tareas de esta sesión (plan definitivo 2026-11-20)
- [ ] **URGENTE — Revocar el PAT de GitHub `…bnhik`** (re-expuesto en el chat de la sesión 2026-11-20) **y el PAT de la sesión 2026-11-17 (`ghp_M9w5…`) si sigue vivo. Procedimiento completo en `docs/actas/ROTACION-CREDENCIALES-2026-11-20.md`** (acta S1). Generar el nuevo token con alcance mínimo y entregarlo al sandbox por variable de entorno, NUNCA por el chat.
- [ ] **A1 — Secretos de Actions**: `PII_PEPPER` (requisito de S5) y PAT de CI en Settings → Secrets and variables → Actions del repositorio.
- [ ] **A2 — Ventana de purga** (S2): autorizar `git filter-repo` + force-push DESPUÉS de revocar los PAT (orden registrado en el acta S1 §5).
- [ ] **Docker compose build + up en el PC** (sin docker en el entorno de trabajo): CRM + daemon; verificar migrate deploy y arranque del standalone.
- [ ] **Instalar el unit systemd del daemon** (RUNBOOK del repo ULTRA §3.1 aplica al daemon del CRM en :3002): `Restart=always`, `RestartSec=10`.
- [ ] **Confirmar el HOST del daemon en producción**: si el CRM corre en la misma máquina, NO definir HOST (default 127.0.0.1); solo con contenedores separados definir el HOST del red interior.
- [ ] **Contratar líneas SIM secundarias para calentamiento** de números Baileys (jamás el número principal).

---

## 1. Credenciales y seguridad (prioridad máxima)
- [ ] **Rotar el PAT de GitHub usado en la sesión 2026-11-20** (`…bnhik`, re-enviado al chat) **y el de 2026-11-17** (`ghp_M9w5…`). Acta de rotación con inventario completo y procedimiento paso a paso: `docs/actas/ROTACION-CREDENCIALES-2026-11-20.md`. El sandbox sigue operando con el token viejo hasta que el dueño lo revoque y entregue el nuevo por canal seguro.
- [ ] **Purgar el historial git con `git filter-repo`** (secretos históricos: 78 entradas del baseline con estado `ROTACION-PENDIENTE` + artefactos E2E antiguos). Requiere force-push y coordinación de clones: decisión del dueño (A2). **Solo tras revocar los PAT** (acta S1 §5). El escáner (`npm run security:scan:history`) queda en verde para hallazgos NUEVOS; el historial NO se purgó (regla de la misión: reportar sin purgar).
- [ ] Rotar cualquier credencial real que haya aparecido en chats de sesiones anteriores (API keys de WP/ULTRA históricas ya verificadas muertas; rotación preventiva recomendada).

## 2. Canal oficial de WhatsApp (FASE 1)
- [ ] Crear la **cuenta Meta Business** + verificar el negocio.
- [ ] Registrar el **número oficial** en Meta Cloud API (el número personal actual NO puede usarse como remitente oficial).
- [ ] Crear la app Meta (tipo Business) y obtener `phone_number_id`, WABA id y token de sistema con permisos `whatsapp_business_messaging`.
- [ ] Cargar y obtener **aprobación de las plantillas** (fase 1 ya modela el registro `TemplateRegistry` con estados; sin plantillas aprobadas no hay envíos fuera de ventana 24 h).
- [ ] Configurar el webhook de Meta apuntando al CRM/WP con el appSecret real.

## 3. Piloto y datos reales
- [ ] Definir y autorizar por escrito la **prueba real mínima** (destinatario, plantilla, ventana) — el bloqueo `authorized:false` de `PILOTO_SUPERVISADO_C2B` existe a propósito; desbloquearlo es decisión del dueño.
- [ ] Proveer el CSV inicial de contactos **con columna de origen del consentimiento** (exigida por el importador).
- [ ] Escanear el QR real para vincular la sesión Baileys de la organización (acción física; solo plan básico).

## 4. Despliegue (PC del dueño)
- [ ] Ejecutar el **build y arranque con Docker (`docker compose up --build`)** en el PC: el entorno de trabajo remoto no tiene Docker instalado, así que esta prueba de la FASE 3 NO se ejecutó (los Dockerfile/compose existen en los 3 repos).
- [ ] `npx prisma migrate deploy` contra la BD real (respaldo previo; migraciones aditivas con rollback documentado en `docs/MIGRACIONES.md`).
- [ ] Definir `.env` reales por servicio con secretos nuevos (`openssl rand -hex 32`), jamás los de prueba de este repo.
- [ ] Configurar respaldo nocturno (`scripts/backup-nightly.sh`) y probar `backup-restore-drill.sh` una vez.
- [ ] Revisar `docs/RUNBOOK.md` (WP/ULTRA) y poner el número de emergencia del operador.

## 5. Legal (Ley 1581)
- [ ] Publicar **Términos y Condiciones** y **Política de Privacidad** (el CRM ya sirve diálogos legales en el landing; el texto definitivo requiere revisión del dueño).
- [ ] Designar responsable de tratamiento de datos ante suplantaciones/quejas (canal de bajas ya implementado y auditado).

## 6. Merge de las ramas `repair/produccion-real`
- [ ] Revisar los diff de las 3 ramas y abrir/aceptar los PR hacia `main` (no se hizo merge ni force-push: regla de la misión).
- [ ] Tras el merge, crear tag de versión y desplegar en staging antes de producción.

## 7. Notas de la sesión sandbox 2026-11-15
- [ ] Migrar o eliminar los scripts E2E antiguos (`scripts/e2e-wp-main.mjs`, `e2e-wp-bridge.mjs`, `e2e-wp-ultra.mjs`): contienen rutas de otra máquina y secretos literales ya usados solo en pruebas; el flujo E2E oficial es `scripts/e2e-3-servicios.mjs` (fail-fast, sin secretos versionados).
