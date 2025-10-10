# ☁️ Configuración de Cloudinary - DriveAngel.ni

## 📋 ¿Qué es Cloudinary?

Cloudinary es un servicio de almacenamiento y gestión de imágenes en la nube que ofrece:
- ✅ 25GB de almacenamiento gratuito
- ✅ 25GB de ancho de banda mensual
- ✅ Optimización automática de imágenes
- ✅ Transformaciones en tiempo real
- ✅ CDN global para carga rápida

---

## 🚀 Paso 1: Crear Cuenta

1. Ir a https://cloudinary.com/users/register/free
2. Registrarse con email (o GitHub/Google)
3. Verificar email
4. Completar perfil

---

## 🔑 Paso 2: Obtener Credenciales

1. Ir al Dashboard: https://cloudinary.com/console
2. En la sección "Account Details" encontrarás:
   - **Cloud Name**: `your_cloud_name`
   - **API Key**: `123456789012345`
   - **API Secret**: `abcdefghijklmnopqrstuvwxyz123456`

---

## 🔧 Paso 3: Configurar Backend

### Editar `.env`

```env
# Cloudinary (Image Upload)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz123456
```

### Verificar Instalación

```bash
cd Backend
npm install cloudinary streamifier @types/multer
```

---

## 📱 Paso 4: Configurar Frontend

### Instalar Dependencias

```bash
cd Frontend
npx expo install expo-image-picker expo-file-system
```

### Permisos (app.json)

```json
{
  "expo": {
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "La app necesita acceso a tus fotos para subir imágenes.",
          "cameraPermission": "La app necesita acceso a la cámara para tomar fotos."
        }
      ]
    ]
  }
}
```

---

## 📂 Estructura de Carpetas en Cloudinary

```
driveangel/
├── profiles/          # Fotos de perfil
├── licenses/          # Licencias de conducir
├── vehicles/          # Fotos de vehículos
├── documents/
│   ├── registration/  # Matrículas
│   └── insurance/     # Seguros
└── general/           # Otras imágenes
```

---

## 🧪 Testing

### Probar Upload desde Backend

```bash
# Usando curl
curl -X POST http://localhost:3000/upload/image \
  -F "file=@/path/to/image.jpg" \
  -F "folder=driveangel/test"
```

### Probar desde Frontend

1. Abrir la app
2. Ir a Registro de Conductor
3. Seleccionar "Subir Licencia"
4. Elegir imagen de galería o tomar foto
5. Verificar que se sube correctamente

---

## 📊 Endpoints Disponibles

### Backend

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/upload/image` | POST | Subir una imagen |
| `/upload/images` | POST | Subir múltiples imágenes |
| `/upload/profile` | POST | Subir foto de perfil |
| `/upload/license` | POST | Subir licencia |
| `/upload/vehicle` | POST | Subir fotos de vehículo |
| `/upload/document` | POST | Subir documento |

### Ejemplo de Request

```typescript
const formData = new FormData();
formData.append('file', {
  uri: imageUri,
  name: 'photo.jpg',
  type: 'image/jpeg',
});
formData.append('folder', 'driveangel/profiles');

const response = await axios.post(
  'http://localhost:3000/upload/image',
  formData,
  {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }
);

console.log(response.data.data.url); // URL de la imagen
```

---

## 🎨 Transformaciones Automáticas

Cloudinary optimiza automáticamente las imágenes:

- ✅ **Redimensionamiento**: Máximo 1000x1000px
- ✅ **Calidad**: Optimización automática
- ✅ **Formato**: WebP si el navegador lo soporta
- ✅ **Compresión**: Sin pérdida de calidad visible

### Ejemplo de URL

**Original:**
```
https://res.cloudinary.com/your_cloud_name/image/upload/v1234567890/driveangel/profiles/abc123.jpg
```

**Transformada (thumbnail 200x200):**
```
https://res.cloudinary.com/your_cloud_name/image/upload/w_200,h_200,c_fill/driveangel/profiles/abc123.jpg
```

---

## 🔐 Seguridad

### Validaciones Implementadas

**Backend:**
- ✅ Tipos de archivo permitidos: JPEG, PNG, WEBP
- ✅ Tamaño máximo: 5MB para imágenes, 10MB para documentos
- ✅ Validación de MIME type
- ✅ Carpetas organizadas por tipo

**Frontend:**
- ✅ Permisos de cámara y galería
- ✅ Compresión de imágenes (quality: 0.8)
- ✅ Aspect ratio configurable
- ✅ Manejo de errores

### Recomendaciones

1. ✅ **Nunca exponer API Secret en frontend**
2. ✅ **Usar signed uploads para producción**
3. ✅ **Configurar límites de upload en Cloudinary Dashboard**
4. ✅ **Habilitar moderación de contenido (opcional)**

---

## 💰 Límites del Plan Gratuito

| Recurso | Límite Gratuito |
|---------|-----------------|
| Almacenamiento | 25 GB |
| Ancho de banda | 25 GB/mes |
| Transformaciones | 25,000/mes |
| Imágenes | Ilimitadas |
| Videos | 500 MB |

### ¿Qué pasa si se excede?

- Cloudinary enviará notificación por email
- Puedes actualizar a plan de pago
- Plan básico: $89/mes (100GB storage, 100GB bandwidth)

---

## 🛠️ Uso en la App

### Registro de Conductor

```typescript
// RegisterScreen.tsx
const [licensePhoto, setLicensePhoto] = useState('');
const [vehiclePhotos, setVehiclePhotos] = useState<string[]>([]);

<ImagePickerButton
  label="Foto de Licencia *"
  onImageSelected={(url) => setLicensePhoto(url)}
  folder="driveangel/licenses"
/>

<ImagePickerButton
  label="Fotos del Vehículo *"
  onImageSelected={(url) => setVehiclePhotos([...vehiclePhotos, url])}
  folder="driveangel/vehicles"
/>
```

### Perfil de Usuario

```typescript
// ProfileScreen.tsx
const [profilePhoto, setProfilePhoto] = useState('');

<ImagePickerButton
  label="Foto de Perfil"
  currentImage={user.profilePhoto}
  onImageSelected={(url) => setProfilePhoto(url)}
  folder="driveangel/profiles"
/>
```

---

## 📈 Monitoreo

### Dashboard de Cloudinary

Monitorear en https://cloudinary.com/console:

1. **Media Library**: Ver todas las imágenes subidas
2. **Usage**: Ver uso de almacenamiento y ancho de banda
3. **Reports**: Analíticas de uso
4. **Settings**: Configurar límites y seguridad

### Logs del Backend

```bash
# Ver logs de uploads
grep "✅ Imagen subida" logs/app.log

# Ver errores
grep "❌ Error subiendo" logs/app.log
```

---

## 🐛 Troubleshooting

### Error: "Invalid credentials"

**Causa:** Credenciales incorrectas en `.env`

**Solución:**
1. Verificar `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
2. Copiar directamente del Dashboard de Cloudinary
3. Reiniciar el servidor backend

### Error: "File too large"

**Causa:** Archivo excede el límite de 5MB

**Solución:**
1. Comprimir imagen antes de subir
2. Ajustar `quality` en ImagePicker (0.5 - 0.8)
3. Aumentar límite en backend si es necesario

### Error: "Permission denied"

**Causa:** No se otorgaron permisos de cámara/galería

**Solución:**
1. Ir a Configuración del dispositivo
2. Buscar la app
3. Habilitar permisos de Cámara y Fotos

### Imágenes no se cargan

**Causa:** URL incorrecta o imagen eliminada

**Solución:**
1. Verificar URL en Media Library de Cloudinary
2. Verificar que la imagen no fue eliminada
3. Verificar conexión a internet

---

## ✅ Checklist de Producción

- [ ] Cuenta de Cloudinary creada
- [ ] Credenciales configuradas en `.env.production`
- [ ] Variables de entorno en servidor de producción
- [ ] Permisos configurados en app.json
- [ ] Testing completo de upload
- [ ] Límites de tamaño configurados
- [ ] Carpetas organizadas
- [ ] Monitoreo configurado
- [ ] Plan de pago evaluado (si es necesario)

---

## 📞 Soporte

- **Documentación**: https://cloudinary.com/documentation
- **Support**: https://support.cloudinary.com
- **Community**: https://community.cloudinary.com

---

## 🎯 Estado de Implementación

- ✅ Backend: UploadService completo
- ✅ Backend: Endpoints configurados
- ✅ Frontend: UploadService completo
- ✅ Frontend: ImagePickerButton componente
- ✅ Validaciones implementadas
- ✅ Documentación completa

**Sistema de Upload: 100% Completo** 🎉

---

**Última actualización:** 2025-10-08
**Versión:** 1.0.0
