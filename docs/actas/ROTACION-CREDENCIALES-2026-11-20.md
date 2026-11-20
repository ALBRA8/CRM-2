# ACTA DE ROTACIÓN DE CREDENCIALES — 2026-11-20

**Tarea:** S1 (plan definitivo CRM-ALBRA v2.0, §7.1 F1-T01 — OBLIGATORIA)
**Estado:** PARTE EJECUTADA EN REPO · PARTE PROPIETARIO PENDIENTE (acción de cuenta, no automatizable desde el sandbox)
**Precede a:** S2 — purga del historial git (no se purga un historial con credenciales vivas)

---

## 1. Inventario de credenciales aparecidas en chats (a rotar)

| # | Credencial | Dónde apareció | Vigencia al cierre de esta acta | Acción del propietario |
|---|---|---|---|---|
| 1 | **PAT de GitHub clásico** (`ghp_w2twN…bnhik`, alcance `repo`) | Reenviado en el chat de la sesión 2026-11-20 (además de sesiones previas) | **VIVA — sigue operando los pushes a CRM-2** | **REVOCAR YA**: GitHub → Settings → Developer settings → Personal access tokens (classic) → Generate new token (scope mínimo: `repo` del CRM; `workflow` solo si Actions lo exige) |
| 2 | **PAT de GitHub anterior** (`ghp_M9w5…`, sesión 2026-11-17, OWNER_TODO §1) | Chat de sesión anterior | Asumida viva mientras no se confirme revocación | Verificar en la misma pantalla de tokens y revocar si sigue listada |
| 3 | **API keys históricas WP/ULTRA** | Chats de sesiones de reparación (2026-11) | Verificadas MUERTAS en sesión previa (baseline `dummy-verificado`) | Rotación preventiva recomendada en el proveedor si alguna reingresó a uso |
| 4 | **Secretos de servicio del CRM** (`APP_SECRET`, `APP_ENCRYPTION_KEY`, `INTERNAL_API_SECRET`, …) | Jamás versionados ni expuestos en chat; `.env` solo local | Vivos y sanos | Rotarlos SOLO si algún `.env` real salió del servidor (no hay evidencia) |

> Regla aplicada (P0.4 del repo): toda credencial que entró a un chat se considera comprometida aunque el chat sea privado. Borrar el mensaje NO invalida el token.

## 2. Procedimiento exacto de rotación del PAT (propietario, ~10 min)

1. Abrir `https://github.com/settings/tokens` con la cuenta **ALBRA8**.
2. Localizar el token cuyo nombre/últimos dígitos correspondan a `…bnhik` y al token de la sesión 2026-11-17 → **Delete/Revoke** ambos.
3. **Generate new token (classic)** con alcance MÍNIMO: `repo` (y `workflow` únicamente si se editan workflows desde API). Caducidad corta (30–90 días) y nota descriptiva (`sesion-sandbox-crm`).
4. Copiar el token NUEVO **sin pegarlo en el chat**: entregarlo al entorno de trabajo por `.env` local o variable de sesión del sandbox, nunca en texto de mensaje.
5. Actualizar el remote del sandbox: `git remote set-url crm2 https://ALBRA8:<NUEVO_TOKEN>@github.com/ALBRA8/CRM-2.git` y probar `git push --dry-run`.
6. **Secretos de Actions (decisión A1, misma visita a GitHub):**
   - `CRM-2` / CRM-ALBRA → Settings → Secrets and variables → Actions:
     - `PII_PEPPER` (requisito de S5, ya activado en el workflow).
     - PAT de CI/PR si algún workflow lo usa para comentar o etiquetar.
7. Verificación de cierre: `npm run security:scan` en verde (sin hallazgos nuevos) y un push de prueba con el token nuevo.

## 3. Parte ejecutada en el repositorio (esta acta)

- [x] Inventario de credenciales expuestas en chats, con estado y destino (sección 1).
- [x] Procedimiento de rotación paso a paso (sección 2).
- [x] `OWNER_TODO.md` §1 actualizado con la fecha de re-exposición del PAT (2026-11-20) y el vínculo a esta acta.
- [x] `npm run security:scan` en verde sobre el árbol actual (sin secretos nuevos; la baseline mantiene sus **78** entradas `ROTACION-PENDIENTE` de historial, que se limpian con S2 **tras** esta rotación).
- [ ] **(PROPIETARIO)** Revocación efectiva de los dos PAT + nuevo token de alcance mínimo + `PII_PEPPER` en Actions (A1).

## 4. Criterios de aceptación de S1 (del plan)

| Criterio | Estado |
|---|---|
| PAT viejo revocado | ⏳ PENDIENTE propietario (procedimiento listo, sección 2) |
| Nuevo PAT en uso con alcance mínimo | ⏳ PENDIENTE propietario |
| Registro de rotación con fecha | ✅ ESTA ACTA (2026-11-20) + OWNER_TODO §1 |
| `security:scan` en verde | ✅ Verificado en esta rama (árbol actual) |

## 5. Efecto sobre S2 (purga de historial)

La purga con `git filter-repo` (S2, decisión A2) solo debe ejecutarse **después** de la revocación efectiva de esta acta: purgar un historial con el PAT aún vivo re-expondría el token en el force-push y dejaría la ventana de exposición abierta. El orden correcto queda registrado aquí y en OWNER_TODO §1.
