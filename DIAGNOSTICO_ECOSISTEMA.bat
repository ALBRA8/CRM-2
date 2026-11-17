@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Ecosistema ALBRA - Diagnostico
cd /d "%~dp0"
set "ROOT=%cd%"

REM ============================================================
REM  DIAGNOSTICO_ECOSISTEMA.bat - 2026-11-17
REM  Imprime: puertos a la escucha, codigos HTTP de cada capa y el
REM  estado de la configuracion SSO en los tres .env.
REM
REM  SEGURIDAD: los valores de los SECRETOS jamas se imprimen; solo
REM  se informa si existen y si COINCIDEN entre los tres servicios.
REM ============================================================

REM ---------- Carpetas -igual que INICIAR_ECOSISTEMA.bat- ----------
REM 2A/2B son carpetas HERMANAS del repo CRM-ALBRA -un nivel arriba-.
set "ECO_ROOT=%ROOT%"
if not exist "%ECO_ROOT%\WHATSPOWER\src\server.ts" if exist "%ECO_ROOT%\..\WHATSPOWER\src\server.ts" for %%i in ("%ECO_ROOT%\..") do set "ECO_ROOT=%%~fi"
set "WP_DIR=%ECO_ROOT%\WHATSPOWER"
set "ULTRA_DIR=%ECO_ROOT%\WHATSPOWER-ULTRA"
if defined WHATSPOWER_DIR set "WP_DIR=%WHATSPOWER_DIR%"
if defined ULTRA_DIR set "ULTRA_DIR=%ULTRA_DIR%"

echo.
echo  ============================================================
echo    DIAGNOSTICO DEL ECOSISTEMA ALBRA
echo  ============================================================
echo.

echo  [1/3] PUERTOS  -OK = LISTENING / DOWN = no escucha-
call :puerto "CRM capa 1             :3000" ":3000 "
call :puerto "Daemon WhatsApp       :3002" ":3002 "
call :puerto "WhatsPower capa 2A    :3003" ":3003 "
call :puerto "WhatsPower-Ultra 2B   :3004" ":3004 "
echo.

echo  [2/3] HTTP  -codigo devuelto por cada endpoint-
call :http "CRM  /api/health"            "http://127.0.0.1:3000/api/health"
call :http "CRM  / -pantalla de acceso-" "http://127.0.0.1:3000/"
call :http "2A   /api/health"            "http://127.0.0.1:3003/api/health"
call :http "2A   / -Flow Studio-"        "http://127.0.0.1:3003/"
call :http "2B   /api/health"            "http://127.0.0.1:3004/api/health"
call :http "2B   / -dashboard-"          "http://127.0.0.1:3004/"
echo    Nota: /api/flows y /api/campaigns devuelven 401 SIN sesion: es NORMAL.
echo    La sesion se obtiene desde el CRM -demo y luego Ecosistema- o en la
echo    pantalla de acceso de cada studio -secreto clasico o demo habilitado-.
echo.

echo  [3/3] CONFIGURACION  -los .env NUNCA se commitean-
call :envsecreto "%ROOT%\.env" V1
call :envsecreto "!WP_DIR!\.env" V2
call :envsecreto "!ULTRA_DIR!\.env" V3
set "SSO_STATE="
if not exist "%ROOT%\.env" set "SSO_STATE=el .env del CRM NO EXISTE"
if defined V1 if not defined V2 set "SSO_STATE=ECOSYSTEM_SSO_SECRET AUSENTE en WhatsPower"
if defined V1 if defined V2 if not defined V3 set "SSO_STATE=ECOSYSTEM_SSO_SECRET AUSENTE en WhatsPower-Ultra"
if not defined V1 set "SSO_STATE=ECOSYSTEM_SSO_SECRET AUSENTE en el CRM"
if defined V1 if defined V2 if defined V3 (
  if "!V1!"=="!V2!" if "!V2!"=="!V3!" (set "SSO_STATE=PRESENTE en los 3 y COINCIDE [OK]") else (set "SSO_STATE=PRESENTE pero NO COINCIDE en los 3 - usar EL MISMO valor")
)
if not defined SSO_STATE set "SSO_STATE=INCOMPLETO - revisa arriba"
echo    ECOSYSTEM_SSO_SECRET    : !SSO_STATE!
call :envvalor "%ROOT%\.env" "WHATSPOWER_STUDIO_URL" WU1
call :envvalor "%ROOT%\.env" "ULTRA_STUDIO_URL" WU2
if defined WU1 (echo    CRM WHATSPOWER_STUDIO_URL : !WU1!) else echo    CRM WHATSPOWER_STUDIO_URL : AUSENTE
if defined WU2 (echo    CRM ULTRA_STUDIO_URL      : !WU2!) else echo    CRM ULTRA_STUDIO_URL      : AUSENTE
call :envvalor "!WP_DIR!\.env" "DEMO_MODE" DM1
call :envvalor "!WP_DIR!\.env" "NODE_ENV" NE1
call :envvalor "!ULTRA_DIR!\.env" "DEMO_MODE" DM2
call :envvalor "!ULTRA_DIR!\.env" "NODE_ENV" NE2
if defined DM1 (echo    2A DEMO_MODE : !DM1!) else echo    2A DEMO_MODE : no definido
if defined NE1 (echo    2A NODE_ENV  : !NE1!) else echo    2A NODE_ENV  : no definido
if defined DM2 (echo    2B DEMO_MODE : !DM2!) else echo    2B DEMO_MODE : no definido
if defined NE2 (echo    2B NODE_ENV  : !NE2!) else echo    2B NODE_ENV  : no definido
if /I "!NE1!"=="production" echo    [AVISO] 2A en production: el login-demo responde 403 POR DISENO. Entra desde el CRM -Ecosistema- o con el secreto clasico.
if /I "!NE2!"=="production" echo    [AVISO] 2B en production: el login-demo responde 403 POR DISENO. Entra desde el CRM -Ecosistema- o con el secreto clasico.
echo.
echo  Fin del diagnostico. Cierra esta ventana cuando quieras.
pause
exit /b 0

REM ============ Subrutinas ============

:puerto  [%1=etiqueta] [%2=patron ":NNNN "]
netstat -ano | findstr /C:"%~2" | findstr "LISTENING" >nul 2>nul
if errorlevel 1 (echo    [DOWN] %~1) else (echo    [OK  ] %~1)
goto :eof

:http  [%1=etiqueta] [%2=url]
set "CODE=000"
for /f %%c in ('curl -s -m 3 -o nul -w "%%{http_code}" "%~2" 2^>nul') do set "CODE=%%c"
echo    [!CODE!] %~1
goto :eof

:envsecreto  [%1=archivo .env] [%2=variable de salida]  -se compara en memoria, JAMAS se imprime-
set "%~2="
if not exist "%~1" goto :eof
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /B /L /C:"ECOSYSTEM_SSO_SECRET=" "%~1"`) do (
  set "TMPV=%%b"
  if defined TMPV set "TMPV=!TMPV:"=!"
  REM Se guarda el VALOR real (no un simple 1) para que la comparacion de mas
  REM abajo detecte de verdad si los tres secretos coinciden. Si fuese "1"
  REM el diagnostico diria "COINCIDE" con secretos distintos.
  if not "!TMPV!"=="" set "%~2=!TMPV!"
)
goto :eof

:envvalor  [%1=archivo .env] [%2=clave] [%3=variable de salida]
set "%~3="
if not exist "%~1" goto :eof
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /B /L /C:"%~2=" "%~1"`) do (
  set "TMPV=%%b"
  if defined TMPV set "TMPV=!TMPV:"=!"
  if not "!TMPV!"=="" set "%~3=!TMPV!"
)
goto :eof
