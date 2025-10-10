# Script para configurar variables de entorno en Firebase Functions
# Ejecutar desde la raíz del proyecto

Write-Host "🔧 CONFIGURANDO VARIABLES DE ENTORNO EN FIREBASE" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Ir a la carpeta functions
Set-Location functions

Write-Host "📝 Configurando Supabase..." -ForegroundColor Yellow
firebase functions:config:set `
  supabase.url="https://ceytngpresytjhafcadu.supabase.co" `
  supabase.anon_key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNleXRuZ3ByZXN5dGpoYWZjYWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5Nzg4NzIsImV4cCI6MjA3NTU1NDg3Mn0.3G9aCmJsjOIL-VG6E49sNnxvKBLITX-I1gFFlWKVslo" `
  supabase.db_password="appdriveangel2025"

Write-Host ""
Write-Host "📝 Configurando Database URL..." -ForegroundColor Yellow
firebase functions:config:set `
  database.url="postgresql://postgres.ceytngpresytjhafcadu:appdriveangel2025@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

Write-Host ""
Write-Host "✅ Variables configuradas" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Ahora necesitas redesplegar las functions:" -ForegroundColor Yellow
Write-Host "   firebase deploy --only functions" -ForegroundColor White
Write-Host ""

Set-Location ..
