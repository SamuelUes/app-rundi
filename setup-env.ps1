# ============================================
# Setup Environment Variables - DriveAngel.ni
# ============================================
# Copia los archivos .env.template a .env

Write-Host "🔧 Configurando archivos .env..." -ForegroundColor Yellow

# ============================================
# FRONTEND
# ============================================
Write-Host "`n📱 Configurando Frontend..." -ForegroundColor Cyan

# Eliminar archivos viejos
Remove-Item -Path "Frontend\.env.production" -ErrorAction SilentlyContinue
Remove-Item -Path "Frontend\.env.example" -ErrorAction SilentlyContinue

# Copiar template a .env
Copy-Item -Path "Frontend\.env.template" -Destination "Frontend\.env" -Force

Write-Host "✅ Frontend/.env creado" -ForegroundColor Green

# ============================================
# BACKEND (NestJS - Respaldo)
# ============================================
Write-Host "`n🔧 Configurando Backend NestJS..." -ForegroundColor Cyan

# Eliminar archivos viejos
Remove-Item -Path "Backend\.env.production" -ErrorAction SilentlyContinue
Remove-Item -Path "Backend\.env.example" -ErrorAction SilentlyContinue

# Copiar template a .env
Copy-Item -Path "Backend\.env.template" -Destination "Backend\.env" -Force

Write-Host "✅ Backend/.env creado" -ForegroundColor Green

# ============================================
# FUNCTIONS (Firebase - Principal)
# ============================================
Write-Host "`n🔥 Configurando Firebase Functions..." -ForegroundColor Cyan

# Eliminar archivos viejos
Remove-Item -Path "functions\.env.example" -ErrorAction SilentlyContinue

# Copiar template a .env
Copy-Item -Path "functions\.env.template" -Destination "functions\.env" -Force

Write-Host "✅ functions/.env creado" -ForegroundColor Green

# ============================================
# RESUMEN
# ============================================
Write-Host "`n📊 Archivos creados:" -ForegroundColor Magenta
Write-Host "✅ Frontend/.env    - Configurado para usar Firebase" -ForegroundColor Green
Write-Host "✅ Backend/.env     - Configurado (respaldo)" -ForegroundColor Green
Write-Host "✅ functions/.env   - Configurado (principal)" -ForegroundColor Green

Write-Host "`n🎯 Próximos pasos:" -ForegroundColor Yellow
Write-Host "1. cd Frontend" -ForegroundColor White
Write-Host "2. npm start -- --clear" -ForegroundColor White
Write-Host "3. La app usará Firebase automáticamente" -ForegroundColor White

Write-Host "`n✨ ¡Listo! Archivos .env configurados" -ForegroundColor Green
