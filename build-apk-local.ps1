# Script para generar APK local con Expo
# Ejecutar desde la raíz del proyecto

Write-Host "📦 GENERANDO APK LOCAL CON EXPO" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Ir a Frontend
Set-Location Frontend

Write-Host "🏗️ Generando APK local..." -ForegroundColor Yellow
Write-Host "   Esto puede tomar 5-10 minutos" -ForegroundColor White
Write-Host ""

npx expo export --platform android

Write-Host ""
Write-Host "📦 Creando APK..." -ForegroundColor Yellow
npx eas build --platform android --profile preview --local

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "✅ APK GENERADO" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📱 El APK está en:" -ForegroundColor White
Write-Host "   Frontend\android\app\build\outputs\apk\release\app-release.apk" -ForegroundColor Cyan
Write-Host ""
Write-Host "💾 Copia el APK a tu teléfono y instálalo" -ForegroundColor Yellow
Write-Host ""

Set-Location ..
