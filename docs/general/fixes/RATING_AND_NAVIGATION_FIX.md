# Fix: Errores en Calificación y Navegación

## 🐛 Problemas Identificados

**Fecha:** 2025-10-16

### 1. Error al Enviar Calificación (Cliente)
**Síntoma:**
- Cliente intenta calificar el viaje
- Error: "No se pudo enviar la calificación"

**Causa:**
- El error no se estaba mostrando correctamente
- `error.response?.data?.message` no existe en Firebase Functions
- Necesita usar `error.message` directamente

### 2. Error de Navegación (Conductor)
**Síntoma:**
- Conductor completa viaje
- Intenta calificar o omitir
- Error: "The action 'GO_BACK' was not handled by any navigator"
- Mensaje: "Is there any screen to go back to?"

**Causa:**
- La pantalla `ActiveRideScreen` usa `navigation.replace('AvailableRides')`
- Luego navega a `Rating` screen
- Al hacer `goBack()` no hay pantalla anterior en el stack
- El stack de navegación está vacío

---

## ✅ Soluciones Implementadas

### Archivo: `Frontend/src/screens/Shared/RatingScreen.tsx`

### Fix 1: Manejo de Errores Mejorado

**Antes (❌):**
```typescript
catch (error: any) {
  Alert.alert('Error', error.response?.data?.message || 'No se pudo enviar la calificación');
}
```

**Después (✅):**
```typescript
catch (error: any) {
  console.error('Error enviando calificación:', error);
  Alert.alert('Error', error.message || 'No se pudo enviar la calificación');
}
```

**Cambios:**
- ✅ Agregado `console.error()` para debugging
- ✅ Cambiado `error.response?.data?.message` → `error.message`
- ✅ Funciona correctamente con Firebase Functions errors

---

### Fix 2: Navegación Corregida

**Antes (❌):**
```typescript
// Al enviar calificación
onPress: () => navigation.goBack()  // ❌ No hay pantalla anterior

// Al omitir
onPress: () => navigation.goBack()  // ❌ No hay pantalla anterior
```

**Después (✅):**
```typescript
// Al enviar calificación
onPress: () => {
  if (isDriver) {
    navigation.replace('DriverHome');
  } else {
    navigation.replace('ClientHome');
  }
}

// Al omitir
onPress: () => {
  if (isDriver) {
    navigation.replace('DriverHome');
  } else {
    navigation.replace('ClientHome');
  }
}
```

**Cambios:**
- ✅ Eliminado `goBack()` que causaba el error
- ✅ Usa `replace()` para navegar al Home correspondiente
- ✅ Diferencia entre Driver y Client usando `isDriver`
- ✅ Limpia el stack de navegación correctamente

---

## 🔄 Flujo Corregido

### Cliente:

```
1. Viaje completado
   ↓
2. CashPaymentScreen (o PaymentScreen)
   ↓
3. navigation.replace('Rating', { rideId })
   ↓
4. RatingScreen
   ↓
5. Enviar calificación o Omitir
   ↓
6. navigation.replace('ClientHome') ✅
```

### Conductor:

```
1. Viaje completado
   ↓
2. ActiveRideScreen
   ↓
3. Alert: "¡Viaje Completado!"
   ↓
4. navigation.replace('AvailableRides')
   ↓
5. (Opcional) navigation.navigate('Rating', { rideId })
   ↓
6. RatingScreen
   ↓
7. Enviar calificación o Omitir
   ↓
8. navigation.replace('DriverHome') ✅
```

---

## 🧪 Testing

### Test 1: Calificación Exitosa (Cliente)

```typescript
// 1. Completar viaje
await completeRide(rideId);

// 2. Ir a Rating
navigation.replace('Rating', { rideId });

// 3. Seleccionar estrellas
setRating(5);

// 4. Enviar calificación
await submitRating();

// 5. Verificar navegación
expect(currentScreen).toBe('ClientHome'); // ✅
```

### Test 2: Omitir Calificación (Conductor)

```typescript
// 1. Completar viaje
await completeRide(rideId);

// 2. Ir a Rating
navigation.navigate('Rating', { rideId });

// 3. Omitir
onPress: omitir();

// 4. Verificar navegación
expect(currentScreen).toBe('DriverHome'); // ✅
```

### Test 3: Error en Calificación

```typescript
// 1. Simular error en backend
mockRateRide.mockRejectedValue(new Error('Network error'));

// 2. Intentar enviar calificación
await submitRating();

// 3. Verificar error mostrado
expect(Alert.alert).toHaveBeenCalledWith(
  'Error',
  'Network error'  // ✅ Mensaje correcto
);
```

---

## 📊 Errores Comunes de Navegación en React Navigation

### ❌ **Error: "GO_BACK was not handled"**

**Causa:**
- No hay pantalla anterior en el stack
- Se usó `replace()` en lugar de `navigate()`
- El stack está vacío

**Solución:**
```typescript
// ❌ Incorrecto
navigation.goBack();

// ✅ Correcto
navigation.replace('Home');
// o
navigation.navigate('Home');
```

### ❌ **Error: "The action 'NAVIGATE' with payload..."**

**Causa:**
- Nombre de pantalla incorrecto
- Pantalla no registrada en el navigator

**Solución:**
```typescript
// Verificar que la pantalla esté registrada
<Stack.Screen name="Rating" component={RatingScreen} />
```

---

## 🔍 Debugging Tips

### Ver Stack de Navegación:

```typescript
import { useNavigationState } from '@react-navigation/native';

const routes = useNavigationState(state => state.routes);
console.log('📍 Stack actual:', routes.map(r => r.name));
```

### Ver si se puede hacer goBack():

```typescript
import { useNavigation } from '@react-navigation/native';

const navigation = useNavigation();
const canGoBack = navigation.canGoBack();
console.log('⬅️ Puede volver?', canGoBack);
```

---

## 📝 Mejores Prácticas

### 1. **Usar `replace()` para flujos lineales:**
```typescript
// Flujo: Login → Home (no debe volver a Login)
navigation.replace('Home');
```

### 2. **Usar `navigate()` para navegación normal:**
```typescript
// Puede volver atrás
navigation.navigate('Details');
```

### 3. **Usar `reset()` para limpiar stack completo:**
```typescript
navigation.reset({
  index: 0,
  routes: [{ name: 'Home' }],
});
```

### 4. **Verificar antes de goBack():**
```typescript
if (navigation.canGoBack()) {
  navigation.goBack();
} else {
  navigation.replace('Home');
}
```

---

## ✅ Checklist

- [x] Corregir manejo de errores en Rating
- [x] Cambiar `goBack()` por `replace()`
- [x] Diferenciar navegación Driver vs Client
- [x] Agregar logs de debugging
- [x] Documentar cambios
- [ ] Testing E2E
- [ ] Verificar en producción

---

**Fecha de corrección:** 2025-10-16  
**Archivos modificados:** 
- `Frontend/src/screens/Shared/RatingScreen.tsx`

**Estado:** ✅ Corregido - Listo para testing
