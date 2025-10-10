# 🌙 DARK MODE - GUÍA COMPLETA DE IMPLEMENTACIÓN

## ✅ **PANTALLAS COMPLETADAS (6/23):**

1. ✅ **HomeScreen** (Cliente)
2. ✅ **SettingsScreen**
3. ✅ **ProfileScreen**
4. ✅ **SearchRideScreen**
5. ✅ **RideConfirmationScreen**
6. ✅ **DriverHomeScreen**

---

## 🎨 **PATRÓN PERFECTO (Sombras + Bordes):**

### **Código Base:**

```tsx
// 1. Imports
import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';

// 2. En el componente
const { colors } = useTheme();
const styles = useMemo(() => createStyles(colors), [colors]);

// 3. Función de estilos
const createStyles = (colors: any) => StyleSheet.create({
  // ... estilos
});

// 4. Reemplazos automáticos:
// #fff → colors.card (cards) o colors.background (fondo)
// #000 → colors.text
// #666 → colors.textSecondary
// #e0e0e0 → colors.border
// #f5f5f5 → colors.surface
```

### **Patrón para Cards (CRÍTICO):**

```tsx
card: {
  backgroundColor: colors.card,
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
  // ← SOMBRAS SUTILES
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 2,
  // ← BORDE PARA MODO CLARO
  borderWidth: 1,
  borderColor: colors.border,  // ← CLAVE!
}
```

### **Patrón para Inputs:**

```tsx
input: {
  backgroundColor: colors.card,
  borderRadius: 12,
  padding: 16,
  fontSize: 16,
  color: colors.text,
  // ← BORDE VISIBLE
  borderWidth: 1,
  borderColor: colors.border,
}
```

### **Patrón para Containers de Fondo:**

```tsx
container: {
  backgroundColor: colors.surface,  // ← No colors.card
  borderRadius: 12,
  padding: 16,
  borderWidth: 1,
  borderColor: colors.border,
}
```

---

## 🔍 **VERIFICACIÓN DE COLORES:**

Antes de aplicar Dark Mode, verificar qué colores usa la pantalla:

```bash
# Buscar colores hardcodeados:
grep -n "#fff" ScreenName.tsx
grep -n "#000" ScreenName.tsx
grep -n "#666" ScreenName.tsx
grep -n "#f5f5f5" ScreenName.tsx
grep -n "backgroundColor:" ScreenName.tsx
```

---

## 📋 **CHECKLIST POR PANTALLA:**

### **Paso 1: Imports**
- [ ] Agregar `useMemo` a imports de React
- [ ] Importar `useTheme` de ThemeContext

### **Paso 2: Hook**
- [ ] Agregar `const { colors } = useTheme();`
- [ ] Agregar `const styles = useMemo(() => createStyles(colors), [colors]);`

### **Paso 3: Función de Estilos**
- [ ] Cambiar `const styles = StyleSheet.create({` a `const createStyles = (colors: any) => StyleSheet.create({`

### **Paso 4: Reemplazos**
- [ ] `backgroundColor: '#fff'` → `backgroundColor: colors.card`
- [ ] `backgroundColor: '#f5f5f5'` → `backgroundColor: colors.background` o `colors.surface`
- [ ] `color: '#000'` → `color: colors.text`
- [ ] `color: '#666'` → `color: colors.textSecondary`
- [ ] `borderColor: '#e0e0e0'` → `borderColor: colors.border`

### **Paso 5: Agregar Bordes a Cards**
- [ ] Agregar `borderWidth: 1` a todas las cards
- [ ] Agregar `borderColor: colors.border` a todas las cards

### **Paso 6: Verificar**
- [ ] Probar en modo claro - ¿Se ven las cards?
- [ ] Probar en modo oscuro - ¿Se ven las cards?
- [ ] Cambiar entre modos - ¿Funciona bien?

---

## ⚠️ **ERRORES COMUNES A EVITAR:**

### **1. Cards Invisibles en Modo Claro**
❌ **Mal:**
```tsx
card: {
  backgroundColor: colors.card,  // Blanco sobre blanco
  borderRadius: 12,
  padding: 16,
}
```

✅ **Bien:**
```tsx
card: {
  backgroundColor: colors.card,
  borderRadius: 12,
  padding: 16,
  borderWidth: 1,  // ← AGREGAR
  borderColor: colors.border,  // ← AGREGAR
  shadowColor: '#000',  // ← AGREGAR
  shadowOpacity: 0.1,  // ← AGREGAR
}
```

### **2. Inputs Sin Contraste**
❌ **Mal:**
```tsx
input: {
  backgroundColor: '#f5f5f5',  // Hardcodeado
  padding: 16,
}
```

✅ **Bien:**
```tsx
input: {
  backgroundColor: colors.card,
  padding: 16,
  color: colors.text,
  borderWidth: 1,
  borderColor: colors.border,
}
```

### **3. Texto Invisible**
❌ **Mal:**
```tsx
text: {
  color: '#000',  // Negro sobre negro en dark mode
}
```

✅ **Bien:**
```tsx
text: {
  color: colors.text,  // Dinámico
}
```

---

## 📊 **PROGRESO ACTUAL:**

```
✅ Completadas: 6 de 23 pantallas (26%)
⏳ Pendientes: 17 pantallas (74%)

Tiempo invertido: ~3 horas
Tiempo estimado restante: 2-3 horas
```

---

## 🎯 **PANTALLAS PENDIENTES:**

### **Alta Prioridad (5):**
- RideTrackingScreen
- PaymentScreen
- AvailableRidesScreen
- ActiveRideScreen
- TodayRidesScreen

### **Media Prioridad (6):**
- RideHistoryScreen
- RatingScreen
- ChatScreen
- PaymentMethodsScreen
- HelpScreen
- SplashScreen

### **Baja Prioridad (6):**
- LoginScreen
- RegisterScreen
- EarningsScreen
- RideRequestsScreen
- VehicleInspectionScreen

---

## 🚀 **SCRIPT RÁPIDO DE APLICACIÓN:**

Para aplicar Dark Mode rápidamente a una pantalla:

```bash
# 1. Verificar colores
grep -n "#fff\|#000\|#666\|#f5f5f5" ScreenName.tsx

# 2. Aplicar patrón base (imports + hook)
# 3. Convertir StyleSheet.create a función
# 4. Reemplazar colores con replace_all
# 5. Agregar bordes a todas las cards
# 6. Probar en ambos modos
```

---

## 💡 **TIPS:**

1. **Siempre agregar bordes a cards** - Crítico para modo claro
2. **Usar `colors.surface` para fondos secundarios** - No `colors.card`
3. **Probar en ambos modos** - Antes de continuar
4. **Sombras sutiles** - `shadowOpacity: 0.1` es perfecto
5. **Bordes sutiles** - `borderWidth: 1` es suficiente

---

**Última actualización:** 2025-10-09 20:45
**Estado:** 26% completado - Patrón perfecto establecido ✅
