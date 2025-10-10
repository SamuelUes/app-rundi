# Limpiar caché completo de Expo y Metro

Write-Host "Limpiando caché completo..." -ForegroundColor Yellow

# 1. Limpiar caché de Metro
Write-Host "`n1. Limpiando Metro Bundler..." -ForegroundColor Cyan
if (Test-Path ".expo") {
    Remove-Item -Recurse -Force ".expo"
    Write-Host "OK: .expo eliminado" -ForegroundColor Green
}

# 2. Limpiar node_modules/.cache
Write-Host "`n2. Limpiando node_modules cache..." -ForegroundColor Cyan
if (Test-Path "node_modules/.cache") {
    Remove-Item -Recurse -Force "node_modules/.cache"
    Write-Host "OK: node_modules/.cache eliminado" -ForegroundColor Green
}

# 3. Limpiar watchman (si existe)
Write-Host "`n3. Limpiando watchman..." -ForegroundColor Cyan
try {
    watchman watch-del-all 2>$null
    Write-Host "OK: watchman limpiado" -ForegroundColor Green
} catch {
    Write-Host "SKIP: watchman no instalado" -ForegroundColor Gray
}

Write-Host "`nListo! Ahora ejecuta:" -ForegroundColor Green
Write-Host "npm start -- --clear" -ForegroundColor White
