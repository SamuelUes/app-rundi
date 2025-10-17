@echo off
echo ========================================
echo   GIT PUSH - DriveAngel.ni
echo ========================================
echo.

REM Verificar estado
echo [1/6] Verificando estado de Git...
git status
echo.

REM Preguntar si continuar
set /p continue="Continuar con el push? (s/n): "
if /i not "%continue%"=="s" (
    echo Operacion cancelada.
    pause
    exit /b
)
echo.

REM Agregar archivos
echo [2/6] Agregando archivos al staging...
git add .
echo.

REM Mostrar archivos agregados
echo [3/6] Archivos que se van a subir:
git status
echo.

REM Preguntar mensaje de commit
set /p commit_msg="Ingresa el mensaje del commit: "
if "%commit_msg%"=="" (
    set commit_msg="Update: Cambios generales"
)
echo.

REM Crear commit
echo [4/6] Creando commit...
git commit -m "%commit_msg%"
echo.

REM Verificar remote
echo [5/6] Verificando configuracion de remote...
git remote -v
echo.

REM Push
echo [6/6] Subiendo cambios a GitHub...
git push
echo.

if %errorlevel% equ 0 (
    echo ========================================
    echo   EXITO! Codigo subido a GitHub
    echo ========================================
) else (
    echo ========================================
    echo   ERROR al subir codigo
    echo ========================================
    echo.
    echo Si es la primera vez, ejecuta:
    echo   git branch -M main
    echo   git push -u origin main
)

echo.
pause
