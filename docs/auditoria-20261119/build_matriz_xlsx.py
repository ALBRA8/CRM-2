#!/usr/bin/env python3
"""
Matriz de trazabilidad CRM-ALBRA — Plan Definitivo v2.0 vs estado real del código.
Genera el libro Excel con 4 hojas: Matriz (48 tareas), Resumen, Sesión 2026-11-19,
Decisiones del propietario. Estilo según design system de la skill xlsx.
"""
import sys, os

XLSX_SKILL_DIR = "/home/z/my-project/skills/xlsx"
for sub in [XLSX_SKILL_DIR, os.path.join(XLSX_SKILL_DIR, "templates")]:
    if sub not in sys.path:
        sys.path.insert(0, sub)

from base import *  # noqa: F401,F403 — design tokens y helpers
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

OUT = "/home/z/my-project/download/MATRIZ-TRAZABILIDAD-CRM-ALBRA-2026-11-19.xlsx"

# ---------------------------------------------------------------- datos
# (ID, Fase, Tarea, Decisión, Estado real en el CRM clonado (evidencia), Estado flujo, Dependencias)
T = [
    # CONSERVAR (23)
    ("S1", "F1", "Rotar PAT de GitHub y credenciales aparecidas en chats", "CONSERVAR",
     "Baseline de secretos con entradas ROTACION-PENDIENTE; OWNER_TODO §1. Acción de cuenta del propietario, fuera del repo",
     "Requiere autorización", "A1"),
    ("S5", "F1", "Pepper obligatorio del escáner PII en CI", "CONSERVAR",
     "CORREGIDO HOY: check-pii.mjs --require-pepper (exit 1 sin pepper/erróneo) + ci.yml en fail-fast; 3 casos probados. Commit 2c2c5f4",
     "Terminada y verificada (local)", "A1 (secret PII_PEPPER en Actions)"),
    ("S6", "F1", "Saneamiento de scripts e2e-* históricos", "CONSERVAR",
     "26 scripts e2e-* top-level verificados; conviven con el flujo oficial e2e-3-servicios.mjs (npm run e2e:3)",
     "Pendiente", "A4 (archivo previo)"),
    ("M1", "F3", "Worker de outbox de canales en el despliegue", "CONSERVAR",
     "IMPLEMENTADO HOY: worker pull de ambas outboxes + servicio compose + entrypoint + Dockerfile + .env.example + runbook §1.1; 13 tests + smoke real. Commit 0f87e01",
     "Terminada y verificada (local)", "A7/A8 (despliegue real)"),
    ("M7", "F3", "Criterio de unificación de la doble bandeja", "CONSERVAR",
     "inbox.ts prioriza daemon sobre timeline para el mismo teléfono; /whatsapp y /inbox coexisten (verificado hoy)",
     "Pendiente", "A10 (criterio de producto)"),
    ("I3", "F7", "Documento único de contratos del ecosistema", "CONSERVAR",
     "docs/API_CONTRACT.md y docs/INTEGRATION_CONTRACT.md dispersos; sin documento canónico",
     "Pendiente", "—"),
    ("E1", "F2", "Diagnóstico del CI rojo del PR #5", "CONSERVAR",
     "RESUELTO HOY: causa raíz única — dotenv era transitivo de @mdxeditor/editor (eliminada por el PR) y tests/setup/env.ts lo importa; 97/97 FAIL al cargar. Fix devDependency explícita → 784/784 local. Commit 0d7fc30 en rama del PR",
     "Terminada y verificada (local)", "A3 (push y re-CI)"),
    ("E2", "F2", "Numeración consistente de migraciones", "CONSERVAR",
     "RENOMBRADO HOY: 10_quoteitem_org_backfill → z_quoteitem_org_backfill y 11_tareas → z_tareas en ramas locales; orden determinista verificado con migrate deploy en SQLite temporal (18/18)",
     "Terminada y verificada (local)", "A3/A5 (push/fusión)"),
    ("E3", "F2", "Limpieza de código y dependencias muertas", "CONSERVAR",
     "whatsapp-daemon-supervisor.ts sin referencias en código (verificado hoy); 8 deps sin uso; el grueso del trabajo vive en el PR #5 (−3416 líneas)",
     "En análisis", "Integración PR #5 · A4"),
    ("E4", "F2", "Readiness y CHANGELOG conciliados con el código", "CONSERVAR",
     "Divergencia confirmada: 107 rutas declaradas vs 123 reales; verify-doc-figures.mjs creado hoy como verificador reutilizable",
     "En desarrollo", "Preferible tras integrar PRs"),
    ("F1", "F2", "Integrar el PR #6 (tareas + quick-actions)", "CONSERVAR",
     "src/app/api/tasks/ ausente de la base (verificado hoy); PR renumerado localmente; test de tareas 6/6 en verde; CI de terceros success sobre dfd926a",
     "Requiere autorización", "E2 · A3"),
    ("F2", "F3", "UI de conexiones WhatsApp multi-número", "CONSERVAR",
     "API wa-connections + tests en base; cero componentes de UI (verificado hoy)",
     "Pendiente", "—"),
    ("F3", "F3", "Filtros por canal/cuenta y búsqueda en la bandeja", "CONSERVAR",
     "Bandeja canónica sin filtros ni búsqueda; inbox.ts ya expone el origen de cada conversación",
     "Pendiente", "M7"),
    ("F4", "F5", "Agenda con vistas semana y día", "CONSERVAR",
     "Solo vista mensual; Google Calendar en API sin UI",
     "Pendiente", "—"),
    ("F5", "F6", "Pantalla de Salud y puesta en marcha guiada", "CONSERVAR",
     "/api/doctor aislado por org sin pantalla propia; sin wizard",
     "Pendiente", "F2"),
    ("U1", "F4", "Navegación única 5+1 y una sola bandeja", "CONSERVAR",
     "17 páginas; doble bandeja verificada; navegación saturada",
     "Pendiente", "F3 · A10"),
    ("U2", "F4", "Dashboard \"requiere atención\" con motivos", "CONSERVAR",
     "Dashboard actual solo métricas, sin motivos accionables",
     "Pendiente", "F1 (tareas del PR #6)"),
    ("U3", "F4", "Catálogo de errores accionables", "CONSERVAR",
     "No existe src/lib/errores.ts; errores técnicos en la UI",
     "Pendiente", "—"),
    ("U4", "F4", "Ajustes agrupados por dominio", "CONSERVAR",
     "settings-page.tsx = 2716 líneas, 14 tabs (verificado hoy)",
     "Pendiente", "Coordinar con F2"),
    ("U5", "F4", "Pulido visual: tipografía, dark mode, vacíos", "CONSERVAR",
     "Textos de 9–11px y dark: incompleto (diagnóstico del plan v1)",
     "Pendiente", "U1"),
    ("O3", "F6", "Instalador/actualizador idempotente", "CONSERVAR",
     "No existe instalador; DEPLOY.md con pasos manuales",
     "Pendiente", "O1"),
    ("D1", "F2", "Resolver las ramas de integración pendientes", "CONSERVAR",
     "PR #4 (test ACK ambiguo, +153) abierto hacia main; fix/migration-safety-audit sin destino decidido",
     "Requiere autorización", "A3"),
    ("D4", "F7", "Matriz de trazabilidad + check en CI", "CONSERVAR",
     "ESTA MATRIZ (docs/MATRIZ-TRAZABILIDAD-PLAN.md) + scripts/verify-doc-figures.mjs creados hoy como base del check",
     "En desarrollo", "E4"),
    # MODIFICAR (9)
    ("S2", "F1", "Purgar el historial git del CRM", "MODIFICAR",
     "scan-secrets --history operativo; baseline con ROTACION-PENDIENTE. Destructivo: exige bundle previo y ventana",
     "Requiere autorización", "S1 · A2"),
    ("M8", "F3", "Reconciliación operable de envíos UNCERTAIN", "MODIFICAR",
     "/api/internal/channel-outbox/reconcile existe y exige providerChecked; sin pantalla ni CLI de operador",
     "Pendiente", "M1 (hecho)"),
    ("I1", "F7", "E2E de 3 servicios con corrida programada", "MODIFICAR",
     "scripts/e2e-3-servicios.mjs autocontenido existe (npm run e2e:3); sin workflow de CI programado",
     "Pendiente", "M1 (hecho) · A7 (token runner)"),
    ("I2", "F7", "Pruebas de compatibilidad de contratos", "MODIFICAR",
     "ecosystem-sso.ts (espejo) y whatspower-bridge.ts (HMAC v2) en base; sin suite de fixtures",
     "Pendiente", "I3"),
    ("E7", "F6", "Test de backup/restore + drill con acta", "MODIFICAR",
     "sqlite-backup.cjs y backup-restore-drill.sh en base; backup-hardening.test.ts verde; sin test roundtrip",
     "Pendiente", "A8 (drill del propietario)"),
    ("O1", "F6", "Ejecutar Docker compose y verificar healthchecks", "MODIFICAR",
     "Healthchecks de app (/api/health) y daemon (/status) presentes (verificado hoy); compose nunca ejecutado",
     "Requiere autorización", "A8 (máquina del propietario)"),
    ("O2", "F6", "Runbook único del CRM", "MODIFICAR",
     "RUNBOOK_CANALES + DEPLOY + OWNER_TODO dispersos; §1.1 del runbook actualizada hoy con el worker M1",
     "Pendiente", "M1 (hecho) · O1 · O3 · F5"),
    ("O4", "F6", "Observabilidad mínima y unidades systemd", "MODIFICAR",
     "Sin unidades systemd; monitor de outbox solo en CI",
     "Pendiente", "M1 (hecho) · O1"),
    ("D2", "F7", "Consolidación de ramas remotas del CRM", "MODIFICAR",
     "impl/wave2-wa-connections 100% contenida; ~25 ramas remotas; requiere etiquetas antes de borrar",
     "Requiere autorización", "A9 (opcional)"),
    # POSPONER (1)
    ("U6", "F4", "Semillas sectoriales para demos", "POSPONER",
     "Valor demostrativo, sin impacto en estabilidad ni producción; reactivable en ~1 día",
     "Posponer", "—"),
    # DESCARTAR (2)
    ("M5", "F3", "Deduplicación del daemon Baileys", "DESCARTAR",
     "YA RESUELTA EN LA BASE: idempotency.mjs con clave (org, idem_key) y estados IN_FLIGHT/DONE/FAILED/UNCERTAIN + test unitario en la batería verde (verificado hoy)",
     "Descartada", "—"),
    ("D3", "F7", "Changelogs del CRM", "DESCARTAR",
     "Duplicada en su parte CRM con E4 (cifras conciliadas)",
     "Descartada", "—"),
    # DEPENDENCIA EXTERNA (13)
    ("S3", "Ext", "WP: secreto operador global", "DEPENDENCIA EXTERNA", "Reside en WHATSPOWER: credenciales de servicio por organización", "Pendiente externa", "Fase externa WP"),
    ("S4", "Ext", "WP+ULTRA: jti/rate limit persistente", "DEPENDENCIA EXTERNA", "Persistir anti-replay en SQLite; el CRM no está afectado", "Pendiente externa", "Fase externa"),
    ("S7", "Ext", "WP+ULTRA: credenciales cifradas en reposo", "DEPENDENCIA EXTERNA", "Tokens Meta en env plano persisten en los motores", "Pendiente externa", "Fase externa"),
    ("M2", "Ext", "ULTRA: consentimiento masivo (Ley 1581)", "DEPENDENCIA EXTERNA", "Sin consentimiento: no operar campañas reales", "Pendiente externa", "Decisión legal del propietario"),
    ("M3", "Ext", "WP+ULTRA: ventana 24 h y plantillas Meta", "DEPENDENCIA EXTERNA", "Rechazos 131047/131048 degradan el número", "Pendiente externa", "Plantillas aprobadas en Meta"),
    ("M4", "Ext", "ULTRA: pacing durable del /step manual", "DEPENDENCIA EXTERNA", "Despachos manuales sin ritmo", "Pendiente externa", "Fase externa ULTRA"),
    ("M6", "Ext", "ULTRA: smoke-live borra campañas ajenas", "DEPENDENCIA EXTERNA", "Riesgo destructivo si se corre en producción", "Pendiente externa", "Fase externa ULTRA"),
    ("I4", "Ext", "WP: rama fix/fase-correctiva-final divergida", "DEPENDENCIA EXTERNA", "Merge ciego revertiría protección ya fusionada", "Pendiente externa", "Decisión de diseño"),
    ("I5", "Ext", "ULTRA: rama fix/fase2-seguridad divergida", "DEPENDENCIA EXTERNA", "Merge ciego revertiría el denylist", "Pendiente externa", "Decisión de diseño"),
    ("I6", "Ext", "WP+ULTRA: selector de transporte por política", "DEPENDENCIA EXTERNA", "La elección sigue siendo la variable global TRANSPORT", "Pendiente externa", "Fase externa"),
    ("E5", "Ext", "WP: destino del ws-server y SPA dashboard", "DEPENDENCIA EXTERNA", "Código muerto referenciado por docs", "Pendiente externa", "Autorización de eliminación"),
    ("E6", "Ext", "ULTRA: docs operativas alineadas", "DEPENDENCIA EXTERNA", "Expectativas operativas erróneas", "Pendiente externa", "PR de docs en ULTRA"),
    ("F6", "Ext", "WP: cobro real (WOMPI/MP/Stripe)", "DEPENDENCIA EXTERNA", "El simulador sigue blindado; sin cobro real", "Pendiente externa", "Credenciales de pasarela"),
]

SESION = [
    ("M1 / F3-T01", "impl/plan-definitivo-construccion", "0f87e01",
     "scripts/channel-outbox-worker.mjs (nuevo) · docker-compose.yml · docker-entrypoint.sh · Dockerfile · .env.example · RUNBOOK_CANALES §1.1 · tests/unit/outbox-worker.test.ts (nuevo)",
     "13 tests unitarios + smoke real del proceso + YAML validado + batería del repo en verde",
     "Worker de despliegue con triple guarda y estado de fábrica INACTIVO"),
    ("S5 / F1-T03", "impl/plan-definitivo-construccion", "2c2c5f4",
     "scripts/check-pii.mjs · .github/workflows/ci.yml",
     "3 casos reales: sin flag exit 0 · sin pepper exit 1 · pepper erróneo exit 1",
     "CI será rojo si falta el pepper (previo: A1 configura el secret)"),
    ("E1 / F2-T02", "fix/e1-pr5-dotenv-faltante (rama del PR #5, LOCAL)", "0d7fc30",
     "package.json + package-lock.json del PR #5",
     "Reproducción 97/97 FAIL → tras fix 784/784 en verde",
     "Causa raíz única documentada: dotenv transitivo eliminado"),
    ("E2 / F2-T01 (PR #5)", "fix/e2-pr5-renumera-migracion (LOCAL)", "(sobre 0d7fc30)",
     "git mv 10_quoteitem_org_backfill → z_quoteitem_org_backfill + refs en test",
     "migrate deploy orden determinista 18/18 · test backfill 3/3",
     "Orden lexicográfico corregido; sin cambios de SQL"),
    ("E2 / F2-T01 (PR #6)", "fix/e2-pr6-renumera-migracion (LOCAL)", "(sobre dfd926a)",
     "git mv 11_tareas → z_tareas",
     "migrate deploy orden determinista 18/18 · test tareas 6/6",
     "Ídem; tabla nueva, inocuo hoy pero patrón corregido"),
    ("D4/E4 (parcial)", "impl/plan-definitivo-construccion", "(commit de matriz)",
     "scripts/verify-doc-figures.mjs · docs/MATRIZ-TRAZABILIDAD-PLAN.md · docs/plan-definitivo-2026-11-19/CONTROL-AVANCE.md",
     "Cifras verificadas: 123 rutas · 46 modelos · 17 migraciones · 97 archivos test · 98 componentes · 17 páginas · 26 scripts e2e",
     "Base del check de CI de trazabilidad"),
]

DECISIONES = [
    ("A1", "Rotar PAT de GitHub y credenciales de chats; configurar PII_PEPPER como secret de Actions", "Externa (cuentas)", "S1 (F1-T01) · S5 (F1-T03) — S5 ya implementada, falta el secret"),
    ("A2", "Autorizar purga del historial git del CRM (filter-repo + force-push, destructiva, bundle previo)", "Interna destructiva", "S2 (F1-T02) — siempre después de S1"),
    ("A3", "Trabajo/push sobre ramas de PRs #5/#6, destino del PR #4 y aprobación de fusión de cada PR", "Interna (PRs)", "E1/E2 ya preparados en ramas locales · F1 (F2-T03) · D1 (F2-T04)"),
    ("A4", "Autorizar eliminaciones con archivo previo: scripts e2e-* históricos y restos muertos", "Interna con archivo", "S6 (F1-T04) · resto de E3 (F2-T05)"),
    ("A5", "Autorizar la renumeración de migraciones y migraciones sobre base real con respaldo", "Interna (migraciones)", "E2 (F2-T01) — ya preparado en ramas locales"),
    ("A6", "Estrategia de canal WhatsApp: Baileys principal / Cloud API por org / Meta Business", "Externa (Meta)", "Condiciona valor de F2 y externas M3/I6"),
    ("A7", "Autorizar despliegue del worker de outbox y corrida programada del E2E", "Interna/Externa", "M1 (F3-T01) — ya implementado · I1 (F7-T01)"),
    ("A8", "Ejecutar en su máquina: docker compose build/up, drill de backup/restore, firma de actas", "Externa (máquina)", "O1 (F6-T01) · E7 (F6-T04) · O2 (F6-T05)"),
    ("A9", "Autorizar archivo con etiquetas de ramas remotas contenidas", "Interna (ramas)", "D2 (F7-T05, opcional)"),
    ("A10", "Aprobar criterio de unificación de bandeja y navegación 5+1", "Interna (producto)", "M7 (F3-T03) · U1 (F4-T01)"),
    ("A11", "(Externa) Credenciales de pasarela de pagos en WHATSPOWER", "Externa", "F6 — fuera de alcance"),
    ("A12", "(Externa) Política de consentimiento Ley 1581 y fases externas ULTRA/Meta", "Externa (legal)", "M2/M3/I6 — fuera de alcance"),
]

# ---------------------------------------------------------------- estilo de estados
def status_style(cell, estado):
    e = estado.lower()
    if e.startswith("terminada"):
        cell.font = Font(name=FONT_NAME, size=11, color=ACCENT_POSITIVE)
        cell.fill = PatternFill('solid', fgColor='E8F5E9')
    elif e.startswith("requiere") or e.startswith("en ") or e.startswith("bloqueada"):
        cell.font = Font(name=FONT_NAME, size=11, color=ACCENT_WARNING)
        cell.fill = PatternFill('solid', fgColor='FEF9E7')
    elif e.startswith("descartada") or e.startswith("posponer") or e.startswith("pendiente externa"):
        cell.font = Font(name=FONT_NAME, size=11, color=NEUTRAL_600)
    else:  # Pendiente
        cell.font = Font(name=FONT_NAME, size=11, color=NEUTRAL_900)

DECISION_COLORS = {
    "CONSERVAR": ACCENT_POSITIVE,
    "MODIFICAR": ACCENT_WARNING,
    "POSPONER": NEUTRAL_600,
    "DESCARTAR": NEUTRAL_600,
    "DEPENDENCIA EXTERNA": NEUTRAL_600,
}

wb = Workbook()

# ================================================================ Hoja 1: Matriz
ws = wb.active
ws.title = "Matriz"
headers = ["ID", "Fase", "Tarea", "Decisión del plan", "Estado real en el CRM clonado (evidencia)", "Estado del flujo", "Dependencias"]
last_col = len(headers) + 1  # B..H
setup_sheet(ws, title="Matriz de trazabilidad — Plan Definitivo CRM-ALBRA v2.0 vs código real (2026-11-19)", last_col=last_col)

for col_idx, h in enumerate(headers, start=2):
    ws.cell(row=4, column=col_idx, value=h)
style_header_row(ws, row_num=4, col_start=2, col_end=last_col)

r = 5
for i, (tid, fase, tarea, dec, evid, estado, deps) in enumerate(T):
    vals = [tid, fase, tarea, dec, evid, estado, deps]
    for col_idx, v in enumerate(vals, start=2):
        ws.cell(row=r, column=col_idx, value=v)
    style_data_row(ws, row_num=r, col_start=2, col_end=last_col, row_index=i)
    ws.cell(row=r, column=2).font = Font(name=FONT_NAME, size=11, bold=HEADER_BOLD, color=PRIMARY)
    dc = DECISION_COLORS.get(dec, NEUTRAL_900)
    ws.cell(row=r, column=5).font = Font(name=FONT_NAME, size=11, color=dc)
    status_style(ws.cell(row=r, column=7), estado)
    for cc in (4, 5, 6, 7, 8):
        ws.cell(row=r, column=cc).alignment = Alignment(horizontal='left', vertical='top', wrap_text=True)
    ws.row_dimensions[r].height = 44
    r += 1

last_data_row = r - 1
note_row = last_data_row + 2
ws.cell(row=note_row, column=2, value="Fuente: PLAN-DEFINITIVO-CRM-ALBRA.md (docs/plan-definitivo-2026-11-19/) verificado contra el árbol clonado el 2026-11-19. Detalle completo y registros por tarea: docs/MATRIZ-TRAZABILIDAD-PLAN.md y docs/plan-definitivo-2026-11-19/CONTROL-AVANCE.md en el repositorio.")
ws.cell(row=note_row, column=2).font = font_caption()
ws.merge_cells(start_row=note_row, start_column=2, end_row=note_row, end_column=last_col)

for col, w in {'B': 7, 'C': 7, 'D': 34, 'E': 19, 'F': 62, 'G': 20, 'H': 26}.items():
    ws.column_dimensions[col].width = w
ws.freeze_panes = 'C5'

# ================================================================ Hoja 2: Resumen
ws2 = wb.create_sheet("Resumen")
setup_sheet(ws2, title="Resumen de la clasificación y estado de flujo (48 tareas)", last_col=4)

row = 4
ws2.cell(row=row, column=2, value="Clasificación del plan")
ws2.cell(row=row, column=2).font = font_subheader()
row += 1
cls_headers = ["Decisión", "Tareas", "IDs"]
for c, h in enumerate(cls_headers, start=2):
    ws2.cell(row=row, column=c, value=h)
style_header_row(ws2, row_num=row, col_start=2, col_end=4)
row += 1
cls_rows = [
    ("CONSERVAR", "S1, S5, S6, M1, M7, I3, E1, E2, E3, E4, F1, F2, F3, F4, F5, U1, U2, U3, U4, U5, O3, D1, D4"),
    ("MODIFICAR", "S2, M8, I1, I2, E7, O1, O2, O4, D2"),
    ("POSPONER", "U6"),
    ("DESCARTAR", "M5, D3"),
    ("DEPENDENCIA EXTERNA", "S3, S4, S7, M2, M3, M4, M6, I4, I5, I6, E5, E6, F6"),
]
first_cls_row = row
for i, (name, ids) in enumerate(cls_rows):
    ws2.cell(row=row, column=2, value=name)
    ws2.cell(row=row, column=3, value=f'=COUNTIF(Matriz!$E$5:$E${last_data_row},B{row})')
    ws2.cell(row=row, column=4, value=ids)
    style_data_row(ws2, row_num=row, col_start=2, col_end=4, row_index=i)
    ws2.cell(row=row, column=3).alignment = align_number()
    ws2.row_dimensions[row].height = 22
    row += 1
ws2.cell(row=row, column=2, value="Total")
ws2.cell(row=row, column=3, value=f'=SUM(C{first_cls_row}:C{row-1})')
style_total_row(ws2, row_num=row, col_start=2, col_end=4)
ws2.cell(row=row, column=3).alignment = align_number()
row += 2

ws2.cell(row=row, column=2, value="Estado del flujo de construcción (hoy 2026-11-19)")
ws2.cell(row=row, column=2).font = font_subheader()
row += 1
for c, h in enumerate(["Estado", "Tareas"], start=2):
    ws2.cell(row=row, column=c, value=h)
style_header_row(ws2, row_num=row, col_start=2, col_end=3)
row += 1
estados = ["Terminada y verificada (local)", "En desarrollo", "En análisis", "Requiere autorización", "Pendiente", "Posponer", "Descartada", "Pendiente externa"]
first_st_row = row
for i, e in enumerate(estados):
    ws2.cell(row=row, column=2, value=e)
    ws2.cell(row=row, column=3, value=f'=COUNTIF(Matriz!$G$5:$G${last_data_row},"{e}*")')
    style_data_row(ws2, row_num=row, col_start=2, col_end=3, row_index=i)
    ws2.cell(row=row, column=3).alignment = align_number()
    status_style(ws2.cell(row=row, column=2), e)
    ws2.row_dimensions[row].height = 22
    row += 1
ws2.cell(row=row, column=2, value="Total")
ws2.cell(row=row, column=3, value=f'=SUM(C{first_st_row}:C{row-1})')
style_total_row(ws2, row_num=row, col_start=2, col_end=3)
ws2.cell(row=row, column=3).alignment = align_number()
row += 2

ws2.cell(row=row, column=2, value="Quick wins (≤1 día, mayor beneficio/esfuerzo) — estado hoy")
ws2.cell(row=row, column=2).font = font_subheader()
row += 1
for c, h in enumerate(["Tarea", "Esfuerzo", "Estado hoy"], start=2):
    ws2.cell(row=row, column=c, value=h)
style_header_row(ws2, row_num=row, col_start=2, col_end=4)
row += 1
quick_wins = [
    ("S5 pepper en CI", "0,25 d", "Hecho (falta secret A1)"),
    ("E2 numeración de migraciones", "0,5 d", "Hecho en ramas locales"),
    ("E1 diagnóstico CI PR #5", "0,5 d", "Hecho: causa raíz dotenv, 784/784"),
    ("F1 integrar PR #6", "0,5 d", "Preparado — espera A3"),
    ("O1 compose ejecutado", "0,5 d", "Espera A8 (máquina del propietario)"),
    ("S1 rotación de credenciales", "0,5 d", "Espera A1 (propietario)"),
    ("M1 worker de outbox", "1 d", "Hecho (falta despliegue A7/A8)"),
    ("F3 filtros y búsqueda de bandeja", "1 d", "Pendiente (tras M7)"),
]
for i, (t, e, s) in enumerate(quick_wins):
    ws2.cell(row=row, column=2, value=t)
    ws2.cell(row=row, column=3, value=e)
    ws2.cell(row=row, column=4, value=s)
    style_data_row(ws2, row_num=row, col_start=2, col_end=4, row_index=i)
    ws2.row_dimensions[row].height = 22
    row += 1

ws2.column_dimensions['B'].width = 38
ws2.column_dimensions['C'].width = 14
ws2.column_dimensions['D'].width = 60

# ================================================================ Hoja 3: Sesión
ws3 = wb.create_sheet("Sesión 2026-11-19")
s_headers = ["Tarea", "Rama", "Commit", "Archivos", "Pruebas ejecutadas", "Resultado"]
setup_sheet(ws3, title="Trabajos de construcción de esta sesión (solo CRM-ALBRA)", last_col=len(s_headers) + 1)
for c, h in enumerate(s_headers, start=2):
    ws3.cell(row=4, column=c, value=h)
style_header_row(ws3, row_num=4, col_start=2, col_end=len(s_headers) + 1)
r = 5
for i, row_data in enumerate(SESION):
    for c, v in enumerate(row_data, start=2):
        ws3.cell(row=r, column=c, value=v)
    style_data_row(ws3, row_num=r, col_start=2, col_end=len(s_headers) + 1, row_index=i)
    for cc in range(2, len(s_headers) + 2):
        ws3.cell(row=r, column=cc).alignment = Alignment(horizontal='left', vertical='top', wrap_text=True)
    ws3.row_dimensions[r].height = 42
    r += 1
note3 = r + 1
ws3.cell(row=note3, column=2, value="Las ramas de PR (fix/e1-pr5-dotenv-faltante, fix/e2-pr5-renumera-migracion, fix/e2-pr6-renumera-migracion) son LOCALES: su push a los PRs y su fusión requieren A3/A5. No se modificó WHATSPOWER ni WHATSPOWER-ULTRA (no existen en este entorno).")
ws3.cell(row=note3, column=2).font = font_caption()
ws3.merge_cells(start_row=note3, start_column=2, end_row=note3, end_column=len(s_headers) + 1)
for col, w in {'B': 20, 'C': 30, 'D': 16, 'E': 46, 'F': 36, 'G': 34}.items():
    ws3.column_dimensions[col].width = w
ws3.freeze_panes = 'C5'

# ================================================================ Hoja 4: Decisiones
ws4 = wb.create_sheet("Decisiones propietario")
d_headers = ["ID", "Decisión", "Tipo", "Habilita"]
setup_sheet(ws4, title="Decisiones que requieren autorización expresa del propietario (A1–A12)", last_col=len(d_headers) + 1)
for c, h in enumerate(d_headers, start=2):
    ws4.cell(row=4, column=c, value=h)
style_header_row(ws4, row_num=4, col_start=2, col_end=len(d_headers) + 1)
r = 5
for i, (did, dec, tipo, hab) in enumerate(DECISIONES):
    for c, v in enumerate((did, dec, tipo, hab), start=2):
        ws4.cell(row=r, column=c, value=v)
    style_data_row(ws4, row_num=r, col_start=2, col_end=len(d_headers) + 1, row_index=i)
    ws4.cell(row=r, column=2).font = Font(name=FONT_NAME, size=11, bold=HEADER_BOLD, color=PRIMARY)
    for cc in range(3, len(d_headers) + 2):
        ws4.cell(row=r, column=cc).alignment = Alignment(horizontal='left', vertical='top', wrap_text=True)
    ws4.row_dimensions[r].height = 34
    r += 1
for col, w in {'B': 6, 'C': 60, 'D': 20, 'E': 44}.items():
    ws4.column_dimensions[col].width = w
ws4.freeze_panes = 'C5'

wb.properties.creator = "Z.ai"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
wb.save(OUT)
print(f"OK → {OUT}")
print(f"Hoja Matriz: {len(T)} tareas ({last_data_row - 4} filas de datos)")
