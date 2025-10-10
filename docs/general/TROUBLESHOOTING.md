# 🔧 Troubleshooting - Firebase Functions Deploy

## ❌ Error: "FAILED_PRECONDITION" al desplegar Functions

### Causa:
Firebase necesita habilitar APIs adicionales en tu proyecto.

### Solución:

#### **Opción 1: Habilitar desde Firebase Console (Recomendado)**

1. **Ir a Google Cloud Console:**
   ```
   https://console.cloud.google.com/apis/library?project=driveangel-ni
   ```

2. **Habilitar estas APIs una por una:**
   - Cloud Functions API
   - Cloud Build API
   - Cloud Scheduler API
   - Cloud Run Admin API
   - Artifact Registry API

3. **Para cada API:**
   - Buscar el nombre en la barra de búsqueda
   - Clic en la API
   - Clic en "ENABLE" (Habilitar)
   - Esperar ~30 segundos

#### **Opción 2: Habilitar con gcloud CLI**

```bash
gcloud services enable cloudfunctions.googleapis.com --project=driveangel-ni
gcloud services enable cloudbuild.googleapis.com --project=driveangel-ni
gcloud services enable cloudscheduler.googleapis.com --project=driveangel-ni
gcloud services enable run.googleapis.com --project=driveangel-ni
gcloud services enable artifactregistry.googleapis.com --project=driveangel-ni
```

#### **Opción 3: Esperar y Reintentar**

A veces Firebase habilita las APIs automáticamente. Espera 2-3 minutos y reintenta:

```bash
firebase deploy --only functions
```

---

## 🚀 Después de habilitar las APIs

Reintentar el deploy:

```bash
cd D:\Documentos\GitHub\App-Uber
firebase deploy --only functions
```

---

## ✅ Verificar que el deploy fue exitoso

Deberías ver:
```
✔  Deploy complete!
```

Y las functions estarán disponibles en:
```
https://console.firebase.google.com/project/driveangel-ni/functions
```

---

## 🧪 Probar una Function

```bash
# Health Check
curl https://us-central1-driveangel-ni.cloudfunctions.net/healthCheck
```

Respuesta esperada:
```json
{
  "status": "ok",
  "timestamp": "2025-10-08T...",
  "service": "DriveAngel.ni Functions",
  "version": "1.0.0"
}
```
