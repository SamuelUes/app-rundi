# 📦 Configurar Supabase Storage para Fotos

## Problema
El error al subir fotos ocurre porque falta instalar el cliente de Supabase y crear el bucket de almacenamiento.

## Solución Paso a Paso

### 1. Instalar Supabase Client en Frontend

```bash
cd Frontend
npm install @supabase/supabase-js
```

### 2. Crear Bucket en Supabase

1. Ve a: https://supabase.com/dashboard/project/ceytngpresytjhafcadu/storage/buckets
2. Haz clic en **"New bucket"**
3. Configuración:
   - **Name:** `vehicle-photos`
   - **Public bucket:** ✅ Activado (para que las URLs sean públicas)
   - **File size limit:** 5 MB
   - **Allowed MIME types:** `image/jpeg, image/png, image/jpg`
4. Haz clic en **"Create bucket"**

### 3. Configurar Políticas de Acceso (RLS)

En el bucket `vehicle-photos`, ve a **Policies** y crea estas políticas:

#### Política 1: Permitir lectura pública
```sql
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'vehicle-photos' );
```

#### Política 2: Permitir subida autenticada
```sql
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'vehicle-photos' 
  AND auth.role() = 'authenticated'
);
```

#### Política 3: Permitir eliminar propias fotos
```sql
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'vehicle-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

### 4. Obtener Supabase Anon Key

1. Ve a: https://supabase.com/dashboard/project/ceytngpresytjhafcadu/settings/api
2. Copia el **anon/public key**
3. Reemplaza en `Frontend/src/services/uploadService.ts` línea 6:

```typescript
const supabaseAnonKey = 'TU_ANON_KEY_AQUI';
```

### 5. Verificar Configuración

```typescript
// Test en consola del navegador o app
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ceytngpresytjhafcadu.supabase.co',
  'TU_ANON_KEY'
);

// Listar buckets
const { data, error } = await supabase.storage.listBuckets();
console.log('Buckets:', data);
```

## Estructura de Carpetas en Supabase Storage

```
vehicle-photos/
├── profiles/           # Fotos de perfil
├── licenses/          # Licencias de conductores
├── vehicles/          # Fotos de vehículos
└── documents/         # Documentos (matrícula, seguro)
```

## Flujo Completo

1. **Usuario** selecciona foto con ImagePicker
2. **uploadService.ts** convierte URI a Blob
3. **Supabase Storage** recibe y almacena la imagen
4. **Supabase** retorna URL pública
5. **Backend** guarda URL en tabla `vehicles.photos` (array de strings)
6. **Frontend** muestra foto desde URL pública

## Ejemplo de URL Generada

```
https://ceytngpresytjhafcadu.supabase.co/storage/v1/object/public/vehicle-photos/vehicles/1728432670_abc123.jpg
```

## Costos

- **Gratis:** 1 GB de almacenamiento
- **Gratis:** 2 GB de transferencia/mes
- **Estimado:** ~5,000 fotos de vehículos (200KB c/u)

## Comandos Útiles

```bash
# Instalar dependencia
cd Frontend
npm install @supabase/supabase-js

# Verificar instalación
npm list @supabase/supabase-js

# Reiniciar Metro bundler
npm start -- --reset-cache
```

## Troubleshooting

### Error: "Bucket not found"
- Verifica que el bucket `vehicle-photos` existe en Supabase
- Verifica que el nombre es exactamente `vehicle-photos` (sin espacios)

### Error: "Permission denied"
- Verifica que las políticas RLS están creadas
- Verifica que el bucket es público
- Verifica que el usuario está autenticado

### Error: "Invalid anon key"
- Verifica que copiaste la key correcta de Supabase Dashboard
- Verifica que no hay espacios al inicio o final de la key
