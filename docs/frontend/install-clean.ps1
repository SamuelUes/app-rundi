# Script de Instalación Limpia - Frontend App Uber
# Ejecutar con: .\install-clean.ps1

Write-Host "🚀 Iniciando instalación limpia del Frontend..." -ForegroundColor Cyan
Write-Host ""

# Paso 1: Limpiar instalación anterior
Write-Host "📦 Paso 1: Limpiando instalación anterior..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "   Eliminando node_modules..." -ForegroundColor Gray
    Remove-Item -Recurse -Force node_modules
}
if (Test-Path "package-lock.json") {
    Write-Host "   Eliminando package-lock.json..." -ForegroundColor Gray
    Remove-Item -Force package-lock.json
}
Write-Host "   ✅ Limpieza completada" -ForegroundColor Green
Write-Host ""

# Paso 2: Limpiar caché de npm
Write-Host "🧹 Paso 2: Limpiando caché de npm..." -ForegroundColor Yellow
npm cache clean --force
Write-Host "   ✅ Caché limpiada" -ForegroundColor Green
Write-Host ""

# Paso 3: Instalar dependencias
Write-Host "📥 Paso 3: Instalando dependencias..." -ForegroundColor Yellow
Write-Host "   Esto puede tomar 2-5 minutos..." -ForegroundColor Gray
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Dependencias instaladas correctamente" -ForegroundColor Green
} else {
    Write-Host "   ❌ Error al instalar dependencias" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Paso 4: Verificar instalación
Write-Host "🔍 Paso 4: Verificando instalación..." -ForegroundColor Yellow
$reactNativeVersion = npm list react-native --depth=0 2>$null | Select-String "react-native@"
$expoVersion = npm list expo --depth=0 2>$null | Select-String "expo@"

if ($reactNativeVersion -match "0.74.5") {
    Write-Host "   ✅ React Native: 0.74.5 (correcto)" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  React Native: versión incorrecta" -ForegroundColor Yellow
}

if ($expoVersion -match "51.0") {
    Write-Host "   ✅ Expo: ~51.0.x (correcto)" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Expo: versión incorrecta" -ForegroundColor Yellow
}
Write-Host ""

# Paso 5: Verificar archivo .env
Write-Host "📝 Paso 5: Verificando configuración..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "   ✅ Archivo .env encontrado" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Archivo .env no encontrado" -ForegroundColor Yellow
    Write-Host "   Crea un archivo .env con:" -ForegroundColor Gray
    Write-Host "   API_BASE_URL=http://localhost:3000/api" -ForegroundColor Gray
}
Write-Host ""

# Resumen final
Write-Host "🎉 ¡Instalación completada!" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Próximos pasos:" -ForegroundColor White
Write-Host "   1. Asegúrate que el Backend esté corriendo:" -ForegroundColor Gray
Write-Host "      cd ..\Backend" -ForegroundColor Gray
Write-Host "      npm run start:dev" -ForegroundColor Gray
Write-Host ""
Write-Host "   2. Inicia el Frontend:" -ForegroundColor Gray
Write-Host "      npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "   3. Abre en tu dispositivo:" -ForegroundColor Gray
Write-Host "      - Presiona 'a' para Android" -ForegroundColor Gray
Write-Host "      - Presiona 'i' para iOS" -ForegroundColor Gray
Write-Host "      - Presiona 'w' para Web" -ForegroundColor Gray
Write-Host ""
Write-Host "✨ ¡Listo para desarrollar!" -ForegroundColor Green
