# INFORME DE FASE 2 — Construcción del PLAN DEFINITIVO CRM-ALBRA v2.0 (sesión 2026-11-20, tarde)

**Alcance**: 15 tareas construidas y commiteadas (F4, F5, U1, U2, U3, U4, I3, O3, S6, O2, E4, D4, E3, I2 + I1 parcial)
**Estado final de la suite**: **955/955 pruebas en 107 archivos** · `tsc --noEmit` 0 errores · eslint limpio · `next build` OK · check de cifras documentales en verde e integrado a CI

---

## 1. Estado de partida

La sesión 1 había dejado 9 tareas terminadas (M1, S5, E1, E2, F2, M7, F3, M8, E7) con 850 pruebas.
El camino al piloto exigía la ola de producto (F4, F5, U1–U5) y la de operación/documentación
(I3, O3, S6, O2) más el cierre de las tres tareas abiertas (E4, D4, E3).

## 2. Qué se construyó, en orden de ejecución

### Producto (7 tareas)

| Tarea | Enfoque técnico |
| --- | --- |
| **F4 · Agenda semana/día** | Modelo puro `src/lib/agenda-vistas.ts` (semana lunes→domingo, agrupación por día, huecos libres con canceladas que no bloquean, unión de solapes, ventana operativa, mínimo 30 min). UI con selector Mes/Semana/Día: la semana muestra 7 columnas con citas y chips de hueco («Libre 09:00–10:30»); el día es una línea de tiempo 07:00–21:00 con bloques de duración visible y panel de huecos. Crear una cita en un hueco son 2 clics (el diálogo abre con fecha y hora preseleccionadas). +18 pruebas. |
| **F5 · Salud + wizard** | El doctor existente (`/api/doctor`, aislado por org P0.1/P0.2) ganó el check `test-send` (primer envío que salió de la cola, sent o unknown). Nueva vista `/health` con banner de veredicto, checks con OK/Atención/Error y acción sugerida por ítem (enlaces a Ajustes→Canales/LLM, Bandeja, Automatizaciones; notas al operador sin nombrar archivos ni comandos). Wizard de puesta en marcha de 4 pasos que SOLO se marca contra datos reales del doctor — una instalación completa nunca lo ve; en el dashboard aparece solo para admins y solo si falta algo. Reparación de runs huérfanos con confirmación en dos pasos. +16 pruebas. |
| **U1 · Navegación 5+1** | Modelo puro `src/lib/nav.ts`: Hoy · Clientes · Bandeja · Comercial · Ajustes (+ Admin), con RBAC por sección y secciones vacías eliminadas. La bandeja canónica `/inbox` es la única del menú; la QR clásica sale del menú pero sigue routable (`/whatsapp`) y accesible desde Ajustes → Canales — compatibilidad con enlaces guardados y la PWA sin redirecciones. La decisión A10 se trató como aprobada por la instrucción global, con reversión documentada (git revert; solo layout y rutas). +14 pruebas con invariantes (una sola bandeja, nada inaccesible). |
| **U2 · Dashboard de atención** | Modelo puro `src/lib/atencion.ts` + bloque `attention` en `/api/dashboard` con fallo blando. Cinco motivos sobre datos REALES: mensajes sin contestar (último mensaje del contacto en la bandeja unificada), citas de hoy, cotizaciones borrador, cotizaciones enviadas 3+ días sin respuesta y seguimientos vencidos. Cada motivo: severidad, descripción y navegación a 1 clic. Sin motivos vacíos; configurable por id y umbral. +9 pruebas. |
| **U3 · Errores accionables** | Catálogo `src/lib/errores.ts` con 21 entradas (título, solución, pasos, soporte) incluyendo los códigos Meta reales del canal (131047 ventana 24 h, 131049 política, 131030 número, 133016 plantilla) y clasificador por patrones de los mensajes técnicos que ya circulan. INVARIANTE testeado: ningún texto nombra archivos, comandos, rutas ni jerga HTTP; el error técnico original jamás se muestra. Componente unificado `ErrorAlert` + `notifyError` cableados en los puntos calientes (envío en bandeja, agenda completa, las 9 operaciones de Números WA). +13 pruebas. |
| **U4 · Ajustes por dominio** | Modelo puro `src/lib/settings-dominios.ts`: 16 tabs agrupados en 4 dominios (Negocio, Canales, Inteligencia, Seguridad y equipo) con navegación de 2 niveles. Cero tabs huérfanos y ids intactos: los deep-links `?tab=conexiones/llm/google/instagram/facebook/telegram` y el retorno del OAuth de Meta aterrizan en su dominio. `envios` (M8) sigue admin-only con fail-closed. +10 pruebas. |
| **I2 · Fixtures de contratos** | Suite `tests/contract/` con el VECTOR compartido de HMAC v2 (copiable a WP/ULTRA: mismo timestamp+body+secreto → mismo hex), payload inbound con org en la identidad, SSO espejado (TTL 90 s estricto, jti de un solo uso con purga perezosa, eco exacto de organización, tamper de rol rechazado, fail-closed) y eventId de stage-change sin colisión cross-org. +20 pruebas. |

### Operación y documentación (6 tareas)

| Tarea | Enfoque técnico |
| --- | --- |
| **I3 · Contratos del ecosistema** | `docs/CONTRATOS-ECOSISTEMA.md`: las 125 rutas de la API documentadas por tabla GENERADA contra el código (métodos, protección real, archivo `route.ts`), agrupadas en 11 familias; contratos internos S2S (outbox, daemon, credenciales), cross-repo (HMAC v2, SSO, `ALLOW_REAL_DISPATCH`) e invariantes de seguridad. El webhook de AGENTE-LEADS se marca honestamente como pendiente (I4). Enlazado desde el README. |
| **O3 · Instalador idempotente** | `scripts/instalar-crm.sh`: prerequisitos → RESPALDO OBLIGATORIO de `.env` y `*.db` (rotación 10) → jamás sobrescribe `.env` → `npm ci` → `prisma migrate deploy` (jamás `db push`) → build → validación `/api/health` → log completo. **Idempotencia verificada en dos pasadas reales sobre copia del repo: hashes de `.env` y BD idénticos, exit 0, respaldos y log creados.** `DEPLOY.md` §8b. |
| **S6 · Saneamiento e2e** | Los 24 scripts e2e históricos (rutas de otra máquina, OAuth puntuales, baterías viejas) se ARCHIVARON con `git mv` a `docs/historia/scripts/` con índice y modo de restauración — nada borrado. Flujo oficial único: `npm run e2e:3`. La allowlist de secretos va por huella (no por ruta): `security:scan` exit 0 tras el traslado. NO se regeneró la baseline histórica para preservar los registros ROTACION-PENDIENTE que S1/S2 necesitan. OWNER_TODO marcado resuelto. |
| **O2 · Runbook único** | `docs/RUNBOOK-CRM.md`: mapa de procesos (app/daemon/worker con A7 marcado como pendiente), arranque frío con y sin Docker, diagnóstico con la Salud, outbox y monitor, backups con drill trimestral y el test E7, actualización con el instalador O3, tabla de emergencias (síntoma → primera acción → escala), WP/ULTRA como dependencia externa y checklist alineado al wizard de F5. |
| **E4 · Cifras conciliadas** | `scripts/verify-doc-figures.mjs` recuenta del código real (rutas, archivos de prueba, modelos, migraciones, componentes) y valida el bloque canónico de `PRODUCTION_READINESS.md` — caso negativo probado: una cifra falsa sale exit 1 con la diferencia exacta. Cifras viejas corregidas (107 rutas → 125; suites históricas ancladas a su fecha sin reescribirse). |
| **D4 · Matriz + CI** | `docs/MATRIZ-TRAZABILIDAD.md`: 25 afirmaciones estructurales, cada una con su evidencia real (archivo de test, script o paso de CI). Paso nuevo en `ci.yml` que ejecuta el verificador tras la suite y antes del build. El verificador se hizo robusto (falla ruidoso si falta el bloque; conteo tolerante en entornos parciales) y su comportamiento está testeado. `tsconfig` excluye `docs/historia`. |

### Cierre y extras

- **E3**: eliminadas 9 dependencias sin ninguna referencia (next-auth, next-intl, @hapi/boom, @mdxeditor/editor, @dnd-kit/core/sortable/utilities, @tanstack/react-query, @tanstack/react-table) y el supervisor sin referencias (172 líneas). Hallazgo del giro: `dotenv` era transitivo de next-auth pero el setup de tests lo importaba directamente → añadido como devDependency explícita. El `@hapi/boom` restante es transitivo de Baileys.
- **I1 (parcial)**: `.github/workflows/e2e-3-servicios.yml` con cron diario y disparo manual; clona WP/ULTRA en MODO LECTURA (push disabled) con `E2E_REPOS_TOKEN`, secretos efímeros y `ALLOW_REAL_DISPATCH=false` siempre; sin el token el job SE OMITE con aviso (no rompe el CI). La corrida real requiere la decisión A7 del propietario.

## 3. Métricas de calidad

| Métrica | Inicio de sesión | Fin de sesión |
| --- | --- | --- |
| Pruebas | 850/850 (99 archivos) | **955/955 (107 archivos)** |
| `tsc --noEmit` | 0 errores | 0 errores |
| eslint | limpio | limpio |
| `next build` | OK | OK |
| Check de cifras en CI | no existía | verde y cableado |
| Dependencias muertas | 9 + supervisor | 0 |

## 4. Decisiones por defecto tomadas (reversibles, documentadas)

1. **U1/A10**: la QR clásica sale del menú pero la ruta se conserva — revertir = `git revert` del commit.
2. **S6/A4**: ARCHIVO (no borrado) de los scripts históricos — restaurable con `git mv`.
3. **Baseline de secretos**: no regenerada para no perder los registros ROTACION-PENDIENTE del historial (S1/S2).
4. **F5**: el paso 4 del wizard valida con un `unknown` también (probó el camino de envío); el doctor ganó un check de solo lectura.
5. **F4**: semana lunes→domingo y ventana operativa 08:00–20:00 con mínimo de 30 min para huecos.

## 5. Lo que queda

- **Del lado construible**: solo las mejoras OPCIONALES U5 (pulido visual: tipografía ≥13px, dark mode, estados vacíos) y O4 (unidades systemd con Restart=on-failure). U6 (semillas sectoriales) sigue pospuesta a decisión.
- **Requieren autorización específica**: S1 (revocar el token expuesto YA), S2 (purga de historial), F1 (merge PR #6), D1 (ramas de integración), O1 (compose en su máquina), D2 (consolidar ramas).
- **Dependencia externa (13)**: S3, S4, S7, M2, M3, M4, M6, I4, I5, I6, E5, E6, F6 — se operan en repos/máquinas externas.
- **Desbloqueos del propietario**: A1 (secretos de Actions), A3 (PRs #5/#6), A7 (PAT de lectura para el E2E programado + worker en despliegue), A8 (compose + drill con acta), credenciales SMTP (opcional).

---

**Conclusión**: las 22 tareas terminadas cubren TODO el lado construible del plan (producto,
operación, documentación y verificación). El CRM queda listo para el piloto en cuanto el
propietario ejecute sus desbloqueos; las dos mejoras opcionales restantes pueden construirse
bajo pedido.
