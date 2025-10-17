# 🔑 Obtener API Key de ImgBB (Solución Temporal)

## ¿Por qué ImgBB?
- ✅ **100% Gratuito** - Sin límites de almacenamiento
- ✅ **Sin configuración** - Solo necesitas una API key
- ✅ **URLs públicas** - Funcionan inmediatamente
- ✅ **Sin servidor** - Servicio externo confiable

## Paso 1: Crear Cuenta en ImgBB

1. Ve a: https://imgbb.com/
2. Haz clic en **"Sign Up"** (arriba derecha)
3. Regístrate con:
   - Email
   - O Google
   - O Facebook

## Paso 2: Obtener API Key

1. Una vez registrado, ve a: https://api.imgbb.com/
2. Haz clic en **"Get API Key"**
3. Copia la API Key que te dan (formato: `abc123def456...`)

## Paso 3: Configurar en el Proyecto

Abre `Frontend/src/services/uploadService.ts` y reemplaza la línea 92:

```typescript
// ANTES (línea 92):
const apiKey = '8c3b8d6c8f7e4a5b9c0d1e2f3a4b5c6d'; // Temporal

// DESPUÉS:
const apiKey = 'TU_API_KEY_AQUI'; // Tu key real de ImgBB
```

## Paso 4: Probar

```bash
cd Frontend
npm start -- --clear
```

Intenta subir una foto del vehículo y debería funcionar.

## Ejemplo de URL Generada

```
https://i.ibb.co/abc123/vehicles_1728432670.jpg
```

## Ventajas vs Supabase Storage

| Característica | ImgBB | Supabase Storage |
|---|---|---|
| Configuración | ✅ Solo API key | ❌ Bucket + Policies + Anon Key |
| Costo | ✅ Gratis ilimitado | ⚠️ 1GB gratis |
| Velocidad | ✅ CDN global | ✅ CDN global |
| Privacidad | ⚠️ Público | ✅ Control total |

## Migrar a Supabase Después (Opcional)

Si más adelante quieres usar Supabase Storage:

1. Crea el bucket `vehicle-photos` en Supabase
2. Obtén la Anon Key real de Supabase
3. Descomenta el código de Supabase en `uploadService.ts`
4. Las URLs viejas de ImgBB seguirán funcionando

## Límites de ImgBB

- **Tamaño máximo por imagen:** 32 MB
- **Almacenamiento:** Ilimitado
- **Ancho de banda:** Ilimitado
- **Requests:** Sin límite oficial

## Troubleshooting

### Error: "Invalid API key"
- Verifica que copiaste la key completa
- Verifica que no hay espacios al inicio/final

### Error: "Image too large"
- La imagen debe ser menor a 32 MB
- ImgBB la optimizará automáticamente

### Error: "Network request failed"
- Verifica tu conexión a internet
- ImgBB puede estar temporalmente caído (raro)
