# ACCIONES PENDIENTES DEL DUEÑO (OWNER_TODO)
## Ecosistema ALBRA: CRM-ALBRA × WHATSPOWER × WHATSPOWER-ULTRA

Este documento reúne las acciones que **no pueden automatizarse con código ni simularse con mocks**, y que requieren credenciales reales, pagos, verificaciones de terceros o decisiones legales/comerciales por parte del propietario del negocio antes del lanzamiento a producción real con clientes de pago.

---

### 1. Seguridad de Cuentas y Limpieza de Historial Git
- [ ] **Rotación Inmediata de GitHub Personal Access Tokens (PAT):**
  - Generar un nuevo token en GitHub Settings > Developer Settings > Personal Access Tokens.
  - Revocar cualquier token previo utilizado en las máquinas de desarrollo.
- [ ] **Purga de Historial Git:**
  - Correr `git-filter-repo` o `BFG Repo-Cleaner` sobre los repositorios si hubo tokens o números históricos en commits antiguos antes de la sanitización actual.
  - Asegurarse de coordinar con el equipo antes de forzar la actualización de ramas protegidas.

---

### 2. Infraestructura y Meta Business Official
- [ ] **Verificación de Meta Business Manager:**
  - Completar la verificación de empresa en [business.facebook.com](https://business.facebook.com).
  - Subir cámara de comercio (RUT / NIT) y certificado bancario de la empresa.
- [ ] **Número de WhatsApp Oficial (WABA):**
  - Adquirir y registrar la línea telefónica oficial para la cuenta de WhatsApp Business API.
  - Completar el registro de nombre para mostrar (Display Name) y aprobación de perfil comercial.
- [ ] **Plantillas de Mensajes (Meta Message Templates):**
  - Redactar y enviar a aprobación en el Business Manager las plantillas requeridas para iniciar conversaciones o enviar fuera de la ventana de 24 horas (utilidad, autenticación y marketing).
  - Configurar las variables dinámicas en `WHATSPOWER/src/safety/template-registry.ts` con los nombres aprobados por Meta.

---

### 3. Pasarelas de Pago y Facturación
- [ ] **Activación de Credenciales de Producción en Pasarela (Wompi / PayU / Stripe):**
  - Reemplazar las credenciales de prueba (`SANDBOX_SECRET`) por las llaves de producción en `.env` seguro.
  - Configurar las URLs de webhook en el panel de la pasarela:
    - Webhook CRM: `https://app.tu-dominio.com/api/billing/webhook`
    - Webhook WhatsPower: `https://wp.tu-dominio.com/api/payments/webhook`
  - Comprobar la firma HMAC con un pago real de prueba ($1.000 COP) y verificar la transición automática a `APPROVED`.

---

### 4. Cumplimiento Legal y Privacidad (Ley 1581 de 2012 / Habeas Data)
- [ ] **Publicación de Política de Privacidad y Tratamiento de Datos:**
  - Redactar y hospedar la Política de Privacidad oficial en `https://app.tu-dominio.com/privacidad`.
  - Asegurar que la URL sea pública y accesible para la verificación de la app de Meta.
- [ ] **Términos y Condiciones del Servicio:**
  - Publicar los Términos de Servicio en `https://app.tu-dominio.com/terminos`, incluyendo el descargo de responsabilidad sobre el uso de la API de WhatsApp, límites de anti-spam y revocación de servicio ante conductas abusivas.
- [ ] **Protocolo de Atención a Peticiones de Habeas Data:**
  - Designar al Oficial de Protección de Datos (DPO) que gestionará las solicitudes que ingresen a los endpoints `/api/compliance/contact-data` (exportación y borrado).

---

### 5. Despliegue en Servidor de Producción (VPS / Cloud)
- [ ] **Aprovisionamiento de Servidor:**
  - Servidor Linux (Ubuntu 24.04 LTS o Debian 12), mínimo 4 vCPU y 8 GB RAM.
  - Instalar Docker Engine y Docker Compose (versión 24+).
  - Instalar Nginx / Caddy como reverse proxy con terminación SSL (Let's Encrypt / Certbot).
- [ ] **Configuración de Variables de Entorno en Servidor:**
  - Crear los archivos `.env` de producción en cada contenedor asegurando:
    - `NODE_ENV=production`
    - `ALLOW_REAL_DISPATCH=true` (solo tras aprobar pruebas en staging)
    - Secretos criptográficos robustos de al menos 32 caracteres generados con `openssl rand -hex 32`.
- [ ] **Estrategia de Copias de Seguridad (Backups):**
  - Programar cron jobs para backup nightly de los archivos SQLite (`custom.db`, `agentic.db`, `broadcast.db`) usando `VACUUM INTO` hacia almacenamiento externo seguro (S3 / Cloud Storage).

---

### 6. Piloto Real Controlado
- [ ] **Prueba de Humo con Número de Prueba:**
  - Despachar un único mensaje de prueba real a un número de control interno del dueño.
  - Validar que el mensaje llega al dispositivo y que la respuesta entrante abre la ventana de 24 horas y actualiza el CRM.
- [ ] **Piloto Limitado con Primer Cliente de Pago:**
  - Configurar la organización del primer cliente en modo piloto con cuota restringida (ej. máx 50 envíos/día).
  - Supervisar en vivo métricas en `/api/health` y logs del worker persistente.
