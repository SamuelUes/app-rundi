# 🔧 Habilitar Firebase Storage

## Problema Actual
El error al subir fotos ocurre porque **Firebase Storage no está habilitado** en el proyecto.

## Solución Rápida

### Paso 1: Habilitar Storage en Firebase Console
1. Ve a: https://console.firebase.google.com/project/driveangel-ni/storage
2. Haz clic en **"Get Started"** o **"Comenzar"**
3. Acepta las reglas de seguridad predeterminadas
4. Haz clic en **"Done"**

### Paso 2: Desplegar Reglas de Storage
```powershell
# Desde la raíz del proyecto
firebase deploy --only storage
```

### Paso 3: Verificar
Las reglas están en `storage.rules` y permiten:
- ✅ Cualquiera puede leer fotos de perfil
- ✅ Solo el dueño puede subir sus fotos
- ✅ Usuarios autenticados pueden ver vehículos y documentos

## Estructura de Carpetas en Storage

```
driveangel-ni.appspot.com/
├── profiles/{userId}/          # Fotos de perfil
├── licenses/{userId}/          # Licencias de conductores
├── vehicles/                   # Fotos de vehículos
├── documents/{type}/{userId}/  # Documentos (matrícula, seguro)
└── images/                     # Imágenes generales
```

## Flujo de Subida de Fotos

1. **Frontend** selecciona foto con ImagePicker
2. **uploadService** sube a Firebase Storage
3. **Firebase Storage** retorna URL pública
4. **Backend** guarda URL en Supabase PostgreSQL tabla `vehicles`
5. **Frontend** muestra foto desde URL

## Alternativa Temporal (Sin Firebase Storage)

Si no quieres usar Firebase Storage, puedes usar:
- **Cloudinary** (25GB gratis)
- **Supabase Storage** (1GB gratis)
- **ImgBB** (gratis, sin límite)

### Configurar Supabase Storage (Recomendado)

```typescript
// Frontend/src/services/uploadService.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ceytngpresytjhafcadu.supabase.co',
  'YOUR_SUPABASE_ANON_KEY'
);

async uploadImage(imageUri: string, folder: string) {
  const blob = await this.uriToBlob(imageUri);
  const fileName = `${folder}/${Date.now()}.jpg`;
  
  const { data, error } = await supabase.storage
    .from('vehicle-photos')
    .upload(fileName, blob);
    
  if (error) throw error;
  
  const { data: { publicUrl } } = supabase.storage
    .from('vehicle-photos')
    .getPublicUrl(fileName);
    
  return { url: publicUrl, publicId: fileName };
}
```

## Comando para Desplegar Todo

```powershell
# Desplegar Storage + Functions + Firestore + Realtime DB
firebase deploy
```

## Verificar que Storage está Habilitado

```powershell
firebase projects:list
firebase use driveangel-ni
firebase storage:buckets:list
```

Deberías ver: `driveangel-ni.appspot.com`
