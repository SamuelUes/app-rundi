# Script para preparar el proyecto antes de generar APK
# Ejecutar desde la raíz del proyecto

Write-Host "🔧 PREPARANDO PROYECTO PARA BUILD" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Ir a Frontend
Set-Location Frontend

# Paso 1: Verificar que no haya errores
Write-Host "✅ Paso 1: Verificando código..." -ForegroundColor Yellow
npm run build 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Hay errores en el código. Arregla los errores antes de continuar." -ForegroundColor Red
    Set-Location ..
    exit 1
}
Write-Host "   ✅ Código sin errores" -ForegroundColor Green

# Paso 2: Verificar app.json
Write-Host ""
Write-Host "✅ Paso 2: Verificando app.json..." -ForegroundColor Yellow
if (Test-Path "app.json") {
    $appJson = Get-Content "app.json" | ConvertFrom-Json
    Write-Host "   📱 Nombre: $($appJson.expo.name)" -ForegroundColor White
    Write-Host "   📦 Package: $($appJson.expo.android.package)" -ForegroundColor White
    Write-Host "   🔢 Versión: $($appJson.expo.version)" -ForegroundColor White
    Write-Host "   ✅ app.json OK" -ForegroundColor Green
} else {
    Write-Host "   ❌ app.json no encontrado" -ForegroundColor Red
    Set-Location ..
    exit 1
}

# Paso 3: Verificar eas.json
Write-Host ""
Write-Host "✅ Paso 3: Verificando eas.json..." -ForegroundColor Yellow
if (Test-Path "eas.json") {
    Write-Host "   ✅ eas.json OK" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  eas.json no encontrado, se creará automáticamente" -ForegroundColor Yellow
}

# Paso 4: Limpiar caché
Write-Host ""
Write-Host "✅ Paso 4: Limpiando caché..." -ForegroundColor Yellow
Remove-Item -Path ".expo" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "node_modules\.cache" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "   ✅ Caché limpiado" -ForegroundColor Green

# Paso 5: Verificar dependencias
Write-Host ""
Write-Host "✅ Paso 5: Verificando dependencias..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "   ✅ Dependencias instaladas" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Instalando dependencias..." -ForegroundColor Yellow
    npm install
    Write-Host "   ✅ Dependencias instaladas" -ForegroundColor Green
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "✅ PROYECTO LISTO PARA BUILD" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📦 Ahora puedes generar el APK:" -ForegroundColor White
Write-Host ""
Write-Host "   Opción 1 (Recomendado):" -ForegroundColor Yellow
Write-Host "   .\build-apk.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Opción 2 (Local):" -ForegroundColor Yellow
Write-Host "   .\build-apk-local.ps1" -ForegroundColor Cyan
Write-Host ""

Set-Location ..
