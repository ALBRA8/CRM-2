@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Ecosistema ALBRA - Arranque completo
cd /d "%~dp0"
set "ROOT=%cd%"

REM Este archivo vive DENTRO del repo CRM-ALBRA, y las capas 2A/2B son sus
REM carpetas HERMANAS (un nivel arriba). Se detecta sola para que tambien
REM funcione si se copia a la raiz del ecosistema.
set "ECO_ROOT=%ROOT%"
if not exist "%ECO_ROOT%\WHATSPOWER\src\server.ts" if exist "%ECO_ROOT%\..\WHATSPOWER\src\server.ts" for %%i in ("%ECO_ROOT%\..") do set "ECO_ROOT=%%~fi"

REM ============================================================
REM  INICIAR_ECOSISTEMA.bat - 2026-11-17
REM  Arranca en orden: daemon 3002 - CRM 3000 - WhatsPower 3003 -
REM  WhatsPower-Ultra 3004; ESPERA la salud de cada capa -max 60 s-
REM  y SOLO entonces abre el navegador. Si una capa no levanta, lo
REM  dice en pantalla y sigue con las demas.
REM
REM  Los logs de cada capa quedan en SU PROPIA ventana: NO se crean
REM  archivos .log - asi se evita el "Acceso denegado" por ACL de
REM  Windows al redirigir salida dentro de las subcarpetas.
REM
REM  Requisito: curl.exe -incluido en Windows 10 1803 o superior-.
REM
REM  NOTA DE ESTILO BATCH: NUNCA usar parentesis en los textos de
REM  echo dentro de bloques if/for - el parentesis de cierre cerraria
REM  el bloque antes de tiempo y romperia el script.
REM ============================================================

REM ---------- Carpetas de las capas -edita aqui si cambian de sitio- ----------
REM Tambien puedes definirlas como variables de entorno WHATSPOWER_DIR y ULTRA_DIR.
set "WP_DIR=%ECO_ROOT%\WHATSPOWER"
set "ULTRA_DIR=%ECO_ROOT%\WHATSPOWER-ULTRA"
if defined WHATSPOWER_DIR set "WP_DIR=%WHATSPOWER_DIR%"
if defined ULTRA_DIR set "ULTRA_DIR=%ULTRA_DIR%"

where curl >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] curl.exe no esta disponible. Viene con Windows 10 1803 o superior.
  pause
  exit /b 1
)

echo.
echo  ============================================================
echo    ECOSISTEMA ALBRA - Arranque completo
echo    Capa 1 CRM  -  Capa 2A WhatsPower  -  Capa 2B Ultra
echo  ============================================================
echo.

REM ---------- 1) Daemon WhatsApp - 3002 ----------
netstat -ano | findstr /C:":3002 " | findstr "LISTENING" >nul 2>nul
if errorlevel 1 (
  echo  [1/4] Daemon WhatsApp - puerto 3002: iniciando en ventana aparte...
  if exist "scripts\windows\_crm-bot-whatsapp.cmd" (
    start "1-Daemon-WhatsApp" cmd /c "%~dp0scripts\windows\_crm-bot-whatsapp.cmd"
  ) else (
    echo        [AVISO] scripts\windows\_crm-bot-whatsapp.cmd no existe; arranca el bot con INICIAR-CRM.bat
  )
) else (
  echo  [1/4] Daemon WhatsApp - puerto 3002: ya esta corriendo.
)

REM ---------- 2) CRM - 3000 ----------
netstat -ano | findstr /C:":3000 " | findstr "LISTENING" >nul 2>nul
if errorlevel 1 (
  echo  [2/4] CRM - puerto 3000: iniciando servidor...
  if exist ".next\standalone\server.js" (
    start "2-CRM-Servidor" /min cmd /k "node scripts\start-standalone.mjs"
  ) else if exist "scripts\windows\_crm-servidor.cmd" (
    echo        [AVISO] No hay build standalone (.next\standalone). Arrancando en modo dev;
    echo        para produccion ejecuta primero: npm run build
    start "2-CRM-Servidor" /min cmd /k "%~dp0scripts\windows\_crm-servidor.cmd"
  ) else (
    echo        [ERROR] scripts\windows\_crm-servidor.cmd no existe; no se puede arrancar el CRM.
  )
) else (
  echo  [2/4] CRM - puerto 3000: ya esta corriendo.
)
set "CRM_OK=0"
set "CRM_CODE=000"
call :esperar "CRM 3000" "http://127.0.0.1:3000/api/health" CRM_OK CRM_CODE

REM ---------- 3) WhatsPower - 3003 ----------
netstat -ano | findstr /C:":3003 " | findstr "LISTENING" >nul 2>nul
if errorlevel 1 (
  echo  [3/4] WhatsPower - puerto 3003: iniciando en ventana aparte...
  if exist "!WP_DIR!\src\server.ts" (
    start "3-WhatsPower-2A" /D "!WP_DIR!" cmd /k node --experimental-strip-types src\server.ts
  ) else (
    echo        [ERROR] No se encuentra !WP_DIR!\src\server.ts
    echo        Edita WP_DIR al principio de este archivo o define la
    echo        variable de entorno WHATSPOWER_DIR con la carpeta correcta.
  )
) else (
  echo  [3/4] WhatsPower - puerto 3003: ya esta corriendo.
)
set "WP_OK=0"
set "WP_CODE=000"
call :esperar "WhatsPower 3003" "http://127.0.0.1:3003/api/health" WP_OK WP_CODE

REM ---------- 4) WhatsPower-Ultra - 3004 ----------
netstat -ano | findstr /C:":3004 " | findstr "LISTENING" >nul 2>nul
if errorlevel 1 (
  echo  [4/4] WhatsPower-Ultra - puerto 3004: iniciando en ventana aparte...
  if exist "!ULTRA_DIR!\src\server.ts" (
    start "4-Ultra-2B" /D "!ULTRA_DIR!" cmd /k node --experimental-strip-types src\server.ts
  ) else (
    echo        [ERROR] No se encuentra !ULTRA_DIR!\src\server.ts
    echo        Edita ULTRA_DIR al principio de este archivo o define la
    echo        variable de entorno ULTRA_DIR con la carpeta correcta.
  )
) else (
  echo  [4/4] WhatsPower-Ultra - puerto 3004: ya esta corriendo.
)
set "ULTRA_OK=0"
set "ULTRA_CODE=000"
call :esperar "WhatsPower-Ultra 3004" "http://127.0.0.1:3004/api/health" ULTRA_OK ULTRA_CODE

REM ---------- Navegador - solo si el CRM responde ----------
if "%CRM_OK%"=="1" start "" http://localhost:3000

REM ---------- Resumen ----------
echo.
echo  ============================================================
echo    ESTADO DEL ECOSISTEMA
echo  ============================================================
call :resumen "CRM 3000"              CRM_OK   CRM_CODE   "2-CRM-Servidor"
call :resumen "WhatsPower 3003"       WP_OK    WP_CODE    "3-WhatsPower-2A"
call :resumen "WhatsPower-Ultra 3004" ULTRA_OK ULTRA_CODE "4-Ultra-2B"
echo.
echo    Ruta de uso:
echo      1. Abre http://localhost:3000 y entra al DEMO -sin registro-.
echo      2. En el sidebar pulsa "Ecosistema".
echo      3. Pulsa "Abrir WhatsPower" o "Abrir WhatsPower-Ultra".
echo    Cada enlace dura 90 s y abre UNA sola vez: si ves
echo    "enlace caducado o ya usado", vuelve al CRM y pulsa
echo    Ecosistema de nuevo: sale uno nuevo al instante.
echo.
echo    Esta ventana ya puede CERRARSE. Cada capa corre en SU ventana:
echo    si una capa falla, el error se ve ahi -no en archivos .log-.
echo    Para DETENER: DETENER-CRM.bat y cierra las ventanas 3 y 4.
echo.
pause
exit /b 0

REM ============ Subrutinas ============

:esperar  [%1=nombre] [%2=url de salud] [%3=var OK] [%4=var codigo]
set "%~3=0"
set "%~4=000"
set /a INT=0
:esperar_loop
set /a INT+=1
set "CODE=000"
for /f %%c in ('curl -s -m 2 -o nul -w "%%{http_code}" "%~2" 2^>nul') do set "CODE=%%c"
if "%CODE%"=="200" (
  set "%~3=1"
  set "%~4=200"
  echo        OK - %~1 responde 200.
  goto :eof
)
set "%~4=%CODE%"
if %INT% geq 30 (
  echo        *** FALLO *** %~1 no respondio 200 en ~60 s. Ultimo codigo: %CODE%
  echo        Revisa la ventana de esa capa: el error esta ahi.
  goto :eof
)
timeout /t 2 /nobreak >nul
goto :esperar_loop

:resumen  [%1=nombre] [%2=var OK] [%3=var codigo] [%4=ventana]
if "!%~2!"=="1" (
  echo    [OK   ] %~1
) else (
  echo    [FALLO] %~1 - ultimo HTTP: !%~3! - revisa la ventana %~4
)
goto :eof
