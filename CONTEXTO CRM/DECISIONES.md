# Decisiones

1. **CRM autónomo — Aprobada:** mantener identidad y repositorio propios.
2. **Evolución SaaS incremental — Aprobada:** preservar módulos útiles y evolucionar sin reescritura innecesaria.
3. **Estabilidad separada de evolución — Aprobada:** main como referencia estable; cambios SaaS de alcance mayor en rama de evolución, integrados con revisión y pruebas. Esta tarea no cambió ramas.
4. **Multi-cuenta — Requisito objetivo aprobado:** varias cuentas del mismo canal por organización, con credenciales, sesiones y webhooks aislados.
5. **APIs oficiales primero — Aprobada:** Browser Factory solo cuando se requiera automatización de navegador.
6. **Autonomía del ecosistema — Aprobada:** Comuniti Manager y WhatsPower mantienen capacidades y ciclos propios.
7. **Seguridad por diseño — Aprobada:** tenant explícito, ownership exacto, cifrado, mínimo privilegio y auditoría; ante ambigüedad, denegar.
8. **Memoria en el repo — Aprobada:** CONTEXTO CRM vive dentro de ALBRA8/CRM-ALBRA.
9. **Producción con evidencia — Aprobada:** no declarar estabilidad sin commit, entorno, pruebas, health, backup y restauración verificables.
10. **SSO de ecosistema condicionado y blindado — Aprobada (2026-11-18):** el acceso inter-servicios (CRM -> WhatsPower -> WhatsPower-Ultra) solo está disponible en modo desarrollo/demo (`NODE_ENV !== 'production'` y `DEMO_MODE=true`). En producción (`NODE_ENV=production`) todas las rutas (`/studio/login-demo`, `/studio/login-ecosystem`, `/api/auth/ecosystem/links`) responden estrictamente HTTP 403 Forbidden y la UI oculta los botones de acceso demo.
11. **Protección criptográfica de PII con sal secreta — Aprobada (2026-11-18):** la denylist del guardián de PII (`check:pii`) utiliza hashes HMAC-SHA256 con `PII_PEPPER`. No se versionan identificadores personales ni teléfonos reales en el árbol git ni en repositorios públicos.
12. **Suite E2E 3 servicios autocontenida y multiplataforma — Aprobada (2026-11-18):** `npm run e2e:3` orquesta dinámicamente CRM, WhatsPower y WhatsPower-Ultra usando puertos efímeros y bases de datos SQLite temporales independientes, garantizando ejecución reproducible en Windows y Linux con `SENT=0` estricto sin dependencias de `/tmp` ni scripts `.sh`.

## Decisiones técnicas pendientes
Base de datos de producción; estrategia de aislamiento; identidad/OAuth; planes y facturación; orquestación de sesiones y alta disponibilidad.
