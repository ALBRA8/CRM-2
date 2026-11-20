# SOLICITUDES DE AUTORIZACIÓN — 6 tareas restantes del PLAN DEFINITIVO CRM-ALBRA v2.0

**Fecha:** 2026-11-20 · **Estado de la construcción:** 25/32 tareas construibles TERMINADAS (ver `CONTROL-AVANCE.md` §1-4). Las 6 restantes son las marcadas en el plan como acciones con efecto real (cuenta, historial, despliegue, fusiones) y requieren autorización específica del propietario **por separado**, según la constitución del proyecto.

**Cómo autorizar:** responder por tarea — «APROBADA S1», «APROBADA S2», etc. — o en bloque. Cada paquete es ejecutable tal cual; nada se ejecuta sin la respuesta explícita.

---

## S1 · Rotar el PAT de GitHub y toda credencial aparecida en chats (F1-T01) — 0,5 d

**Acción del propietario (yo la orquesto con instrucciones paso a paso):**

1. **URGENTE hoy:** revocar el PAT `ghp_w2tw…` expuesto en este chat. GitHub → Settings → Developer settings → Personal access tokens → Delete. Mientras siga vivo, cualquiera con acceso al chat puede empujar a ALBRA8/*.
2. Generar PAT nuevo de **alcance mínimo**: `repo` sobre CRM-ALBRA (y `repo` de lectura sobre los otros dos si se quiere el E2E 3 servicios en CI — lo necesita el workflow `e2e-3-servicios.yml` ya construido).
3. Actualizar el remote del sandbox (yo lo cambio con el nuevo PAT cuando llegue) y los secrets de Actions que lo usen.
4. Inventariar y rotar toda credencial que haya aparecido en conversaciones: contraseñas MySQL/SMTP del servidor, API keys del LLM, claves de Meta (WhatsApp Business), token del daemon.

**Prerequisito de:** S2 (no se purga un historial con credenciales vivas: primero se rotan).
**Aceptación:** PAT viejo muerto; `security:scan` en verde; acceso a repos con el PAT nuevo verificado; registro de rotación con fecha.
**Riesgo:** interrupción temporal de integraciones que usaban el PAT viejo — mitigado documentando cada uso antes de revocar.

---

## S2 · Purgar el historial git del CRM (F1-T02, solo CRM-ALBRA) — 0,5 d · ⚠️ DESTRUCTIVA

**Qué hace:** reescribir el historial para eliminar secretos históricos y artefactos de E2E con credenciales literales hoy recuperables por cualquiera que clone el repositorio.

**Plan de ejecución (ventana acordada, ~30 min):**

1. **Backup completo previo:** `git bundle create crm-albra-backup-<fecha>.bundle --all` guardado fuera del repo (reversión garantizada).
2. `git filter-repo` con la lista de secretos de `scripts/security/secret-baseline.json` (entradas `ROTACION-PENDIENTE`) + rutas de artefactos de E2E.
3. Force-push a `main` y `repair/produccion-real` en el repositorio canónico.
4. Reclonar los entornos de trabajo (los clones viejos dejan de empujar) y recrear/rebasar los PR abiertos (#4/#5/#6) sobre el historial nuevo.
5. Acta con SHAs antes/después; `security:scan:history` en verde; CI verde en las ramas afectadas.

**Acepta solo si:** S1 está hecha (credenciales rotadas), ventana de 30 min sin empujes, y el propietario acepta que **cambian TODOS los SHA** y los clones desincronizados dejan de funcionar.
**Reversión:** restaurar desde el bundle y no forzar nada.
**Nota:** la purga en WHATSPOWER/ULTRA queda como operación externa futura (fuera del alcance autorizado).

---

## F1 · Integrar el PR #6 (tareas + quick-actions) (F2-T03) — 0,5 d

**Qué trae el PR (head `dfd926a`, CI success 2026-11-19):** módulo de tareas y recordatorios (11 archivos, +576/−6, migración `11_tareas` **aditiva**, API org-scoped, `tests/integration/tasks.test.ts` de 109 líneas) y quick-actions de la ficha 360.

**Plan de ejecución:**

1. Verificar que la migración quedó renumerada al formato semántico (`z_tareas`, hecho en E2 — re-verificar sobre el head actual del PR).
2. Re-CI sobre la base de integración y **merge a `repair/produccion-real`**.
3. Añadir `cierre/**` a los triggers de `.github/workflows/ci.yml`.
4. Verificación: suite completa + tests de tareas incluidos; migración aplicada en instalación limpia; tarjeta de tareas visible en el dashboard (la U2 ya la espera: `overdueTasks` está en 0 hasta este merge, sin falsos positivos).

**Aceptación:** módulo de tareas en la base con CI verde; dashboard muestra tareas vencidas reales.
**Reversión:** `git revert -m 1`; la migración es aditiva (la tabla puede dejarse sin uso o eliminarse con migración inversa si se pide).

---

## D1 · Resolver las ramas de integración pendientes (F2-T04) — 1 d

**Plan de ejecución (misma ventana de PRs que F1):**

1. Retarget del **PR #4** (test de ACK ambiguo, head `611e418`, 2 archivos +153) de `main` → base de integración `repair/produccion-real` (o rebase si se prefiere), e integrar.
2. Portar los **tests multiproceso del scheduler con lease** de `fix/migration-safety-audit` a la base en un PR pequeño (son tests, no código productivo).
3. Suite ampliada en verde tras el merge.

**Aceptación:** garantías de no-pérdida/no-duplicación del scheduler protegidas por tests permanentes en la base; PR #4 integrado o cerrado con decisión escrita.
**Reversión:** `git revert` de los PR de tests; no afecta datos ni contratos.

---

## O1 · Ejecutar Docker compose del CRM y verificar healthchecks (F6-T01) — 0,5 d

**Acción en la máquina del propietario** (Docker no existe en el sandbox; limitación declarada):

1. Tras fusionar F1/D1: `docker compose build && docker compose up`.
2. Verificar healthchecks ya presentes: app `/api/health` (30 s) y daemon `/status`.
3. Registrarme los logs + healthchecks en verde; corregir lo que el build real revele (Dockerfile / `docker-compose.yml` / `scripts/docker-entrypoint.sh`).
4. E2E básico contra el stack levantado; acta firmada por el propietario.

**Reversión:** el método actual (scripts) sigue operativo; los ajustes al build son `git revert`.

---

## D2 · Consolidación de ramas remotas del CRM (F7-T05) — 0,5 d · ⚠️ BORRADO CON ETIQUETA

**Qué hace:** dejar un repositorio legible. Las ramas ya contenidas en la base (p. ej. `impl/wave2-wa-connections`, verificada con 0 commits únicos) se **etiquetan** (`archive/<fecha>-<rama>`) y se eliminan; se conservan vivas solo la base de integración, `main` y los PR abiertos.

**Plan:** inventario con ahead/behind por rama → etiqueta por cada archivada → delete en remoto → verificación de que cada rama es recuperable desde su etiqueta → listado final (máximo ~6 ramas activas) documentado en el runbook.

**Mitigación:** etiqueta PREVIA a cada borrado (GitHub conserva restores 90 días; la etiqueta es permanente en el propio repo).
**Reversión:** `git branch <rama> <etiqueta>`.

---

## Orden recomendado de ejecución

```
S1 (hoy: revocar PAT expuesto)  ──►  S2 (ventana acordada)  ──►  F1 + D1 (misma ventana de PRs)  ──►  O1 (máquina propietario)  ──►  D2 (limpieza final)
```

**Con estas 6, el plan queda 32/32 ejecutable completado.** Las otras 10 de la matriz son: 13 dependencias externas (ecosistema WP/ULTRA), 2 descartadas (M5, D3) y U6 pospuesta (1 d opcional). O4 (systemd) queda congelada hasta que el propietario decida el stack de despliegue (O1).
