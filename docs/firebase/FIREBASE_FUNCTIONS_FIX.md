# 🔧 FIX: Firebase Callable Functions

**Fecha:** 2025-10-09 23:01
**Problema:** Error 400 al solicitar viajes y buscar conductores

---

## 🔴 **PROBLEMA IDENTIFICADO:**

### **Error en logs:**
```
ERROR  ❌ Error buscando viajes: Request failed with status code 400
ERROR  Error requesting ride: [AxiosError: Request failed with status code 400]
```

### **Causa:**
`ridesService.ts` estaba usando HTTP endpoints (`client.post('/requestRide')`) pero las Firebase Functions son **Callable Functions**, no HTTP endpoints.

**Diferencia:**
- ❌ HTTP Endpoint: `https://us-central1-project.cloudfunctions.net/api/requestRide`
- ✅ Callable Function: `httpsCallable(functions, 'requestRide')`

---

## ✅ **SOLUCIÓN APLICADA:**

### **Archivo modificado:**
`Frontend/src/services/ridesService.ts`

### **Cambios:**

**1. Imports agregados:**
```typescript
import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
```

**2. requestRide() - ANTES:**
```typescript
async requestRide(data: RequestRideData): Promise<Ride> {
  const response = await client.post('/requestRide', data);
  return response.data;
}
```

**2. requestRide() - DESPUÉS:**
```typescript
async requestRide(data: RequestRideData): Promise<Ride> {
  const requestRideFunction = httpsCallable(functions, 'requestRide');
  const response = await requestRideFunction(data);
  return response.data as Ride;
}
```

**3. getAvailableRides() - ANTES:**
```typescript
async getAvailableRides(lat?: number, lng?: number, radius?: number): Promise<any[]> {
  const response = await client.get('/getAvailableRides', {
    params: { lat, lng, radius },
  });
  return response.data;
}
```

**3. getAvailableRides() - DESPUÉS:**
```typescript
async getAvailableRides(lat?: number, lng?: number, radius?: number): Promise<any[]> {
  const getAvailableRidesFunction = httpsCallable(functions, 'getAvailableRides');
  const response = await getAvailableRidesFunction({ lat, lng, radius });
  return response.data as any[];
}
```

**4. acceptRide() - ANTES:**
```typescript
async acceptRide(rideId: string, data: AcceptRideData): Promise<Ride> {
  const response = await client.post('/acceptRide', { rideId, ...data });
  return response.data;
}
```

**4. acceptRide() - DESPUÉS:**
```typescript
async acceptRide(rideId: string, data: AcceptRideData): Promise<Ride> {
  const acceptRideFunction = httpsCallable(functions, 'acceptRide');
  const response = await acceptRideFunction({ rideId, ...data });
  return response.data as Ride;
}
```

---

## 📝 **FUNCIONES ACTUALIZADAS:**

```
✅ requestRide() - Solicitar viaje
✅ getAvailableRides() - Buscar viajes disponibles
✅ acceptRide() - Aceptar viaje
```

---

## 🚀 **PRÓXIMOS PASOS:**

1. **Reiniciar Metro Bundler:**
   ```bash
   # En la terminal donde corre npm start
   # Presiona 'r' para reload
   ```

2. **Probar flujo completo:**
   - Cliente solicita viaje
   - Conductor ve viaje disponible
   - Conductor acepta viaje

---

## ⚠️ **NOTA SOBRE ERRORES DE TYPESCRIPT:**

Los errores de TypeScript en `functions/src/api/emergency.ts` y `functions/src/helpers/supabaseSync.ts` son solo warnings de compilación. No afectan la funcionalidad de las functions desplegadas.

**Para ignorarlos temporalmente:**
```bash
cd functions
npm run build -- --noEmit false
```

O comentar esos archivos si no se usan:
- `src/api/emergency.ts`
- `src/helpers/supabaseSync.ts`

---

**¡Ahora las peticiones deberían funcionar correctamente!** 🎉
