# ✅ FORMATO AUTOMÁTICO DE FECHAS - RegisterScreen

## 🎯 FEATURE IMPLEMENTADA

Se agregó formato automático para los campos de fecha en el formulario de registro de conductores.

---

## 📝 CAMPOS CON FORMATO AUTOMÁTICO:

1. **Vencimiento Licencia** (`licenseExpiry`)
2. **Vencimiento Circulación** (`registrationExpiry`)
3. **Vencimiento Seguro** (`insuranceExpiry`)

---

## ✨ CÓMO FUNCIONA:

### **Formato:** `YYYY-MM-DD`

Cuando el usuario escribe números, automáticamente se agregan los guiones `-`:

```
Usuario escribe: 20251231
Resultado:       2025-12-31

Usuario escribe: 2025
Resultado:       2025

Usuario escribe: 202512
Resultado:       2025-12

Usuario escribe: 20251231
Resultado:       2025-12-31
```

---

## 🔧 IMPLEMENTACIÓN:

### **Función de Formato:**

```typescript
const formatDate = (text: string, currentValue: string) => {
  // Remover todo excepto números
  const numbers = text.replace(/[^\d]/g, '');
  
  // Si está borrando, permitir
  if (text.length < currentValue.length) {
    return text;
  }
  
  // Formatear según la longitud
  if (numbers.length <= 4) {
    return numbers;
  } else if (numbers.length <= 6) {
    return `${numbers.slice(0, 4)}-${numbers.slice(4)}`;
  } else {
    return `${numbers.slice(0, 4)}-${numbers.slice(4, 6)}-${numbers.slice(6, 8)}`;
  }
};
```

### **Handlers Específicos:**

```typescript
const handleLicenseExpiryChange = (text: string) => {
  const formatted = formatDate(text, licenseExpiry);
  setLicenseExpiry(formatted);
};

const handleRegistrationExpiryChange = (text: string) => {
  const formatted = formatDate(text, registrationExpiry);
  setRegistrationExpiry(formatted);
};

const handleInsuranceExpiryChange = (text: string) => {
  const formatted = formatDate(text, insuranceExpiry);
  setInsuranceExpiry(formatted);
};
```

### **Inputs Actualizados:**

```typescript
<Input
  placeholder="Vencimiento Licencia (YYYY-MM-DD)"
  value={licenseExpiry}
  onChangeText={handleLicenseExpiryChange}  // ← Handler con formato
  keyboardType="numeric"                     // ← Solo números
  maxLength={10}                             // ← Máximo 10 caracteres
  style={{ marginTop: 12 }}
  editable={!loading}
/>
```

---

## ✅ CARACTERÍSTICAS:

1. **Solo números:** El teclado muestra solo números
2. **Guiones automáticos:** Se agregan automáticamente en las posiciones correctas
3. **Máximo 10 caracteres:** `YYYY-MM-DD` (4 + 1 + 2 + 1 + 2)
4. **Permite borrar:** Si el usuario borra, no se re-formatea
5. **No permite letras:** Solo acepta dígitos

---

## 🧪 EJEMPLOS DE USO:

### **Ejemplo 1: Escribir fecha completa**
```
Escribe: 2
Muestra:  2

Escribe: 20
Muestra:  20

Escribe: 2025
Muestra:  2025

Escribe: 20251
Muestra:  2025-1

Escribe: 202512
Muestra:  2025-12

Escribe: 2025123
Muestra:  2025-12-3

Escribe: 20251231
Muestra:  2025-12-31
```

### **Ejemplo 2: Borrar**
```
Tiene:   2025-12-31
Borra:   2025-12-3
Borra:   2025-12-
Borra:   2025-12
```

---

## 🎨 MEJORAS FUTURAS (Opcional):

1. **Validación de fecha real:**
   - Verificar que el mes sea 01-12
   - Verificar que el día sea 01-31
   - Verificar que la fecha no sea pasada

2. **Selector de fecha visual:**
   - Agregar un DatePicker nativo
   - Mostrar calendario al hacer click

3. **Formato alternativo:**
   - Permitir DD/MM/YYYY
   - Permitir MM-DD-YYYY

---

## 📱 EXPERIENCIA DE USUARIO:

**Antes:**
```
Usuario: "Tengo que escribir 2025-12-31 con guiones"
```

**Ahora:**
```
Usuario: "Solo escribo 20251231 y se formatea solo"
✅ Más rápido
✅ Menos errores
✅ Mejor UX
```

---

**¡Feature implementada y lista para usar!** 🚀
