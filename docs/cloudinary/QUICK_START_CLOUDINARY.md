# ⚡ Quick Start - Cloudinary en 5 Minutos

## 🎯 Objetivo
Configurar Cloudinary para que puedas subir fotos en tu app DriveAngel.ni

---

## 📋 Checklist Rápido

### ✅ Paso 1: Crear Cuenta (2 minutos)
1. Ir a: https://cloudinary.com/users/register/free
2. Registrarse con email
3. Verificar email
4. Completar perfil:
   - Empresa: `DriveAngel`
   - Tipo: `Developer`

### ✅ Paso 2: Copiar Credenciales (1 minuto)
En el Dashboard verás:
```
Cloud name: xxxxxxxxxx          ← Copiar esto
API Key: 123456789012345        ← Copiar esto
API Secret: ••••••••••••••      ← Hacer clic en 👁️ y copiar
```

### ✅ Paso 3: Configurar Backend (1 minuto)
1. Abrir: `Backend/.env`
2. Agregar al final:
```env
# Cloudinary
CLOUDINARY_CLOUD_NAME=pega_aqui_tu_cloud_name
CLOUDINARY_API_KEY=pega_aqui_tu_api_key
CLOUDINARY_API_SECRET=pega_aqui_tu_api_secret
```
3. Guardar archivo

### ✅ Paso 4: Reiniciar Backend (1 minuto)
```bash
cd Backend
npm run start:dev
```

Deberías ver:
```
✅ Nest application successfully started
```

### ✅ Paso 5: Probar (Opcional)
Probar con curl:
```bash
curl -X POST http://localhost:3000/upload/image \
  -F "file=@ruta/a/tu/imagen.jpg"
```

---

## 🎉 ¡Listo!

Ahora puedes:
- ✅ Subir fotos de licencias
- ✅ Subir fotos de vehículos
- ✅ Subir fotos de perfil
- ✅ Subir documentos

---

## 🐛 Problemas Comunes

### Error: "Invalid credentials"
**Solución:** Verifica que copiaste bien las credenciales (sin espacios extra)

### Error: "Cannot find module 'cloudinary'"
**Solución:** 
```bash
cd Backend
npm install
```

### Backend no inicia
**Solución:** Verifica que el archivo `.env` tenga las 3 variables

---

## 📚 Más Información

- Documentación completa: `CLOUDINARY_SETUP.md`
- Dashboard: https://cloudinary.com/console
- Soporte: https://support.cloudinary.com

---

## 🔐 Seguridad

⚠️ **IMPORTANTE:**
- ❌ NO subas el archivo `.env` a Git
- ❌ NO compartas tu API Secret
- ✅ Guarda las credenciales en un lugar seguro

---

**Última actualización:** 2025-10-08
