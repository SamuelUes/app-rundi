# 📤 Guía para Subir Código a GitHub

## 🔍 Verificar Estado Actual

```bash
# Ver qué archivos han cambiado
git status

# Ver diferencias
git diff
```

---

## 📋 Comandos para Primera Subida

### 1. Inicializar Git (si no está inicializado)
```bash
git init
```

### 2. Agregar Remote (si no está configurado)
```bash
git remote add origin https://github.com/SamuelUes/app-uber.git
```

### 3. Verificar Remote
```bash
git remote -v
```

### 4. Agregar Archivos al Staging
```bash
# Agregar todos los archivos (respetando .gitignore)
git add .

# O agregar archivos específicos
git add functions/
git add Frontend/
git add database/
git add docs/
```

### 5. Verificar qué se va a subir
```bash
git status
```

**✅ Archivos que DEBEN aparecer:**
- `functions/src/` (código de Firebase Functions)
- `functions/.env.example` (plantilla sin secrets)
- `Frontend/src/` (código del frontend)
- `Frontend/.env` (credenciales públicas de Firebase)
- `Frontend/.env.example` (plantilla)
- `database/` (schemas y migraciones)
- `docs/` (documentación)
- `README.md`, `SETUP.md`, etc.

**❌ Archivos que NO deben aparecer:**
- `functions/.env` (contiene secrets)
- `Backend/.env` (contiene secrets)
- `*-firebase-adminsdk-*.json` (service accounts)
- `node_modules/` (dependencias)
- `.env` en la raíz

### 6. Crear Commit
```bash
git commit -m "feat: Implementación completa del sistema de viajes

- Sistema de múltiples ofertas de conductores
- Sistema de calificaciones mejorado (6 categorías)
- Sistema de tracking optimizado (Firebase + PostgreSQL)
- Campos de departamento y municipio para conductores
- Documentación completa
- Configuración de .env.example para colaboración"
```

### 7. Subir a GitHub
```bash
# Primera vez (crear rama main y subir)
git branch -M main
git push -u origin main

# Siguientes veces
git push
```

---

## 🔄 Comandos para Actualizaciones Posteriores

```bash
# 1. Ver cambios
git status

# 2. Agregar cambios
git add .

# 3. Commit
git commit -m "descripción de los cambios"

# 4. Push
git push
```

---

## 🌿 Trabajar con Ramas (Recomendado)

```bash
# Crear rama para nueva feature
git checkout -b feature/nombre-feature

# Hacer cambios y commit
git add .
git commit -m "feat: descripción"

# Subir rama
git push -u origin feature/nombre-feature

# Volver a main
git checkout main

# Mergear cambios (después de revisar)
git merge feature/nombre-feature
git push
```

---

## 🚨 Comandos de Emergencia

### Deshacer último commit (sin perder cambios)
```bash
git reset --soft HEAD~1
```

### Deshacer cambios en un archivo
```bash
git checkout -- nombre-archivo
```

### Ver historial de commits
```bash
git log --oneline
```

### Limpiar archivos no trackeados
```bash
git clean -fd
```

---

## 🔐 Verificar que NO se suban Secrets

### Antes de hacer commit, verifica:
```bash
# Ver qué archivos se van a subir
git status

# Ver contenido de archivos específicos
git diff functions/.env
git diff Backend/.env

# Si ves secrets, asegúrate de que estén en .gitignore
```

### Si accidentalmente subiste secrets:

```bash
# 1. Eliminar archivo del historial
git rm --cached functions/.env

# 2. Agregar a .gitignore
echo "functions/.env" >> .gitignore

# 3. Commit
git commit -m "fix: Remove sensitive .env file"

# 4. Push forzado (CUIDADO: solo si es tu repo personal)
git push --force
```

**⚠️ IMPORTANTE:** Si subiste secrets por error:
1. Cambia TODAS las credenciales inmediatamente
2. Revoca API keys comprometidas
3. Genera nuevas credenciales

---

## 📊 Ver Diferencias Antes de Subir

```bash
# Ver todos los cambios
git diff

# Ver cambios de un archivo específico
git diff functions/src/api/rides.ts

# Ver cambios en staging
git diff --staged
```

---

## 🎯 Convenciones de Commits

Usa prefijos para organizar commits:

- `feat:` - Nueva funcionalidad
- `fix:` - Corrección de bugs
- `docs:` - Cambios en documentación
- `style:` - Cambios de formato (no afectan código)
- `refactor:` - Refactorización de código
- `test:` - Agregar o modificar tests
- `chore:` - Tareas de mantenimiento

**Ejemplos:**
```bash
git commit -m "feat: Agregar sistema de calificaciones detalladas"
git commit -m "fix: Corregir error en carga de datos del vehículo"
git commit -m "docs: Actualizar guía de setup"
git commit -m "refactor: Optimizar queries de PostgreSQL"
```

---

## ✅ Checklist Antes de Push

- [ ] `git status` - Verificar archivos
- [ ] No hay archivos `.env` (excepto `Frontend/.env`)
- [ ] No hay service accounts de Firebase
- [ ] No hay certificados o llaves privadas
- [ ] El código compila sin errores
- [ ] Los tests pasan (si los hay)
- [ ] La documentación está actualizada
- [ ] El commit message es descriptivo

---

## 🤝 Colaboración

### Clonar el repo (otros desarrolladores)
```bash
git clone https://github.com/SamuelUes/app-uber.git
cd app-uber
```

### Actualizar código local
```bash
git pull
```

### Resolver conflictos
```bash
# Si hay conflictos al hacer pull
git pull
# Editar archivos con conflictos
git add .
git commit -m "fix: Resolver conflictos"
git push
```

---

**¡Listo para colaborar! 🚀**
