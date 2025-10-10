# Script para generar APK con Expo
# Ejecutar desde la raíz del proyecto

Write-Host "📦 GENERANDO APK CON EXPO" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""

# Ir a Frontend
Set-Location Frontend

Write-Host "🔧 Paso 1: Instalando EAS CLI..." -ForegroundColor Yellow
npm install -g eas-cli

Write-Host ""
Write-Host "🔑 Paso 2: Login en Expo..." -ForegroundColor Yellow
Write-Host "   (Si no tienes cuenta, créala en https://expo.dev)" -ForegroundColor White
eas login

Write-Host ""
Write-Host "⚙️ Paso 3: Configurando proyecto..." -ForegroundColor Yellow
eas build:configure

Write-Host ""
Write-Host "🏗️ Paso 4: Generando APK..." -ForegroundColor Yellow
Write-Host "   Esto puede tomar 10-15 minutos" -ForegroundColor White
eas build --platform android --profile preview

Write-Host ""
Write-Host "=========================" -ForegroundColor Cyan
Write-Host "✅ BUILD COMPLETADO" -ForegroundColor Green
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📱 El APK estará disponible en:" -ForegroundColor White
Write-Host "   https://expo.dev/accounts/[tu-usuario]/projects/driveangel-ni/builds" -ForegroundColor Cyan
Write-Host ""
Write-Host "💾 Descarga el APK desde el link que te proporcionó Expo" -ForegroundColor Yellow
Write-Host ""

Set-Location ..
