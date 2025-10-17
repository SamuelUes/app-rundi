# Configuración de .gitignore

## 📋 Resumen

El archivo `.gitignore` está configurado para:
- ✅ **Subir todo el código de `Frontend/`** (incluyendo `.env`)
- ✅ **Subir todo el código de `functions/`** (excepto `.env`)
- ❌ **NO subir `Backend/`** (legacy, no se usa)
- ❌ **NO subir `node_modules/`** (dependencias)

---

## 🔐 Archivos .env

### ✅ **Frontend/.env** - SE SUBE AL REPO

**Razón:** El `.env` del Frontend contiene solo configuraciones del cliente que son seguras de compartir:

```env
# Frontend/.env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...  # API Key con restricciones
EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk...    # Token público
BACKEND_MODE=firebase                     # Configuración de modo
USE_FIREBASE_EMULATORS=false             # Flag de emulators
```

**Por qué es seguro:**
- 🔒 Las API Keys tienen restricciones de dominio/bundle ID
- 🔒 Son keys públicas (client-side)
- 🔒 No contienen secrets del servidor
- 🔒 Firebase Auth protege el backend

---

### ❌ **functions/.env** - NO SE SUBE AL REPO

**Razón:** El `.env` de Functions contiene secrets del servidor:

```env
# functions/.env (NO SE SUBE)
SUPABASE_URL=https://...                 # URL de base de datos
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # ⚠️ SECRET KEY
STRIPE_SECRET_KEY=sk_live_...           # ⚠️ SECRET KEY
FIREBASE_ADMIN_SDK=...                   # ⚠️ CREDENTIALS
```

**Por qué NO es seguro:**
- ⚠️ Contiene keys del servidor
- ⚠️ Acceso total a base de datos
- ⚠️ Puede procesar pagos
- ⚠️ Acceso admin a Firebase

---

## 📁 Carpetas Incluidas en el Repo

### ✅ **Frontend/** (TODO se sube)

```
Frontend/
├── .env ✅                    # Configuración del cliente
├── .env.local ✅              # Configuración local
├── .env.production ✅         # Configuración de producción
├── src/ ✅                    # Todo el código fuente
├── assets/ ✅                 # Imágenes, fonts, etc.
├── app.json ✅                # Configuración de Expo
├── package.json ✅            # Dependencias
└── node_modules/ ❌           # Ignorado (se instala con npm)
```

---

### ✅ **functions/** (TODO excepto .env)

```
functions/
├── .env ❌                    # IGNORADO (contiene secrets)
├── src/ ✅                    # Todo el código fuente
├── package.json ✅            # Dependencias
├── tsconfig.json ✅           # Configuración TypeScript
├── firebase.json ✅           # Configuración Firebase
└── node_modules/ ❌           # Ignorado (se instala con npm)
```

---

### ❌ **Backend/** (TODO ignorado - legacy)

```
Backend/  ❌                   # Carpeta completa ignorada
```

**Razón:** Ya no se usa, migrado a Firebase Functions.

---

## 🔧 Reglas del .gitignore

### 1. Environment Files

```gitignore
# Ignorar todos los .env por defecto
.env
.env.local
.env.production
.env.*.local

# EXCEPCIÓN: Permitir .env del Frontend
!Frontend/.env
!Frontend/.env.local
!Frontend/.env.production

# Asegurar que functions/.env esté ignorado
functions/.env
functions/.env.*
Backend/.env
Backend/.env.*
```

### 2. Dependencies

```gitignore
# Ignorar node_modules en todas las carpetas
node_modules/
.pnp
.pnp.js
```

### 3. Build Artifacts

```gitignore
# Ignorar archivos compilados
dist/
build/
*.tsbuildinfo
```

### 4. IDE & OS

```gitignore
# Ignorar configuraciones de IDE
.vscode/
.idea/

# Ignorar archivos del OS
.DS_Store
Thumbs.db
```

### 5. Secrets & Credentials

```gitignore
# Ignorar archivos de credenciales
firebase-service-account.json
*-firebase-adminsdk-*.json
*.pem
*.key
*.cert
```

### 6. Carpetas Legacy

```gitignore
# Ignorar carpetas que ya no se usan
Backend/
docs/session-2025-10-09/
```

---

## 🚀 Cómo Usar

### Primer Push al Repo

```bash
# 1. Verificar qué archivos se subirán
git status

# 2. Agregar todos los archivos
git add .

# 3. Verificar que Frontend/.env esté incluido
git status | grep "Frontend/.env"

# 4. Verificar que functions/.env NO esté incluido
git status | grep "functions/.env"  # No debería aparecer

# 5. Commit y push
git commit -m "Initial commit con Frontend y Functions"
git push origin main
```

---

### Verificar Configuración

```bash
# Ver qué archivos están siendo ignorados
git status --ignored

# Ver si Frontend/.env está trackeado
git ls-files | grep "Frontend/.env"  # Debería aparecer

# Ver si functions/.env está ignorado
git ls-files | grep "functions/.env"  # NO debería aparecer
```

---

## ⚠️ Advertencias de Seguridad

### ✅ **Seguro de Compartir:**
- Frontend/.env (API keys públicas con restricciones)
- Código fuente de Frontend
- Código fuente de Functions
- Configuraciones de Firebase (firebase.json)
- Configuraciones de Expo (app.json)

### ❌ **NUNCA Compartir:**
- functions/.env (secrets del servidor)
- firebase-service-account.json (credenciales admin)
- Archivos .pem, .key, .cert (certificados)
- SUPABASE_SERVICE_ROLE_KEY
- STRIPE_SECRET_KEY

---

## 🔄 Actualizar .gitignore

Si necesitas cambiar la configuración:

```bash
# 1. Editar .gitignore
nano .gitignore

# 2. Limpiar cache de git (para aplicar cambios)
git rm -r --cached .

# 3. Re-agregar archivos con nueva configuración
git add .

# 4. Commit
git commit -m "Update .gitignore configuration"
```

---

## 📊 Resumen de Archivos

| Archivo/Carpeta | Estado | Razón |
|-----------------|--------|-------|
| `Frontend/` | ✅ Incluido | Código del cliente |
| `Frontend/.env` | ✅ Incluido | Config pública segura |
| `Frontend/node_modules/` | ❌ Ignorado | Dependencias (npm install) |
| `functions/` | ✅ Incluido | Código del servidor |
| `functions/.env` | ❌ Ignorado | Secrets del servidor |
| `functions/node_modules/` | ❌ Ignorado | Dependencias (npm install) |
| `Backend/` | ❌ Ignorado | Legacy, no se usa |
| `docs/` | ✅ Incluido | Documentación |
| `database/` | ✅ Incluido | Schemas SQL |

---

## ✅ Checklist de Seguridad

Antes de hacer push, verificar:

- [ ] `functions/.env` NO está en el commit
- [ ] `firebase-service-account.json` NO está en el commit
- [ ] `Frontend/.env` SÍ está en el commit
- [ ] No hay secrets hardcodeados en el código
- [ ] Las API keys tienen restricciones configuradas
- [ ] Los tokens de Stripe son de test (no producción)

---

## 📚 Referencias

- [Git Documentation - gitignore](https://git-scm.com/docs/gitignore)
- [GitHub - Ignoring files](https://docs.github.com/en/get-started/getting-started-with-git/ignoring-files)
- [Best Practices for .env files](https://12factor.net/config)

---

**Última actualización:** 2025-10-16  
**Estado:** ✅ Configurado correctamente
