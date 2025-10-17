# Campos de Ubicación Geográfica para Conductores

**Fecha:** 2025-10-16  
**Versión:** 1.0

## 📋 Descripción

Se agregaron campos de **departamento** y **municipio** al registro de conductores para mejorar la segmentación geográfica y facilitar análisis de cobertura por región.

---

## 🗄️ Cambios en Base de Datos

### **Tabla: `drivers`**

Se agregaron dos nuevas columnas:

```sql
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS department VARCHAR(100),
ADD COLUMN IF NOT EXISTS municipality VARCHAR(100);

-- Índices para búsquedas optimizadas
CREATE INDEX IF NOT EXISTS idx_drivers_department ON public.drivers(department);
CREATE INDEX IF NOT EXISTS idx_drivers_municipality ON public.drivers(municipality);
```

**Columnas:**
- `department` (VARCHAR 100): Departamento de residencia del conductor
- `municipality` (VARCHAR 100): Municipio de residencia del conductor

**Ejemplos:**
- Departamento: `Managua`, `León`, `Granada`, `Masaya`
- Municipio: `Managua`, `Tipitapa`, `Ciudad Sandino`, `Masaya`

---

## 📱 Cambios en Frontend

### **Archivo:** `Frontend/src/constants/nicaraguaLocations.ts`

Se creó un archivo con la lista completa de **17 departamentos** y **153 municipios** de Nicaragua.

**Funciones disponibles:**
```typescript
// Obtener lista de departamentos
const departments = getDepartments();

// Obtener municipios de un departamento
const municipalities = getMunicipalitiesByDepartment('Managua');

// Validar departamento
const isValid = isValidDepartment('Managua'); // true

// Validar municipio
const isValid = isValidMunicipality('Managua', 'Tipitapa'); // true
```

### **Archivo:** `Frontend/src/screens/Auth/RegisterScreen.tsx`

Se agregaron dos nuevos campos al formulario de registro de conductores:

1. **Selector de Departamento** (Picker)
   - Campo obligatorio (*)
   - Lista de 17 departamentos de Nicaragua
   - Al seleccionar, resetea el municipio

2. **Selector de Municipio** (Picker)
   - Campo obligatorio (*)
   - Lista dinámica según departamento seleccionado
   - Deshabilitado hasta que se seleccione un departamento

**Validación:**
```typescript
if (!licenseNumber || !department || !municipality || !plate || !brand || !model || !year || !color) {
  Alert.alert('Error', 'Por favor completa todos los campos obligatorios...');
  return;
}
```

---

## 🔧 Cambios en Backend

### **Archivo:** `functions/src/api/auth.ts`

Se actualizó la función `register()` para guardar los campos en PostgreSQL:

```typescript
const driverResult = await client.query(
  `INSERT INTO drivers (
    user_id, license_number, license_expiry, license_photo, 
    department, municipality,  // ✅ NUEVOS CAMPOS
    status, total_rides, average_rating, total_earnings
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0) 
  RETURNING id`,
  [
    userRecord.uid,
    driverData.licenseNumber,
    driverData.licenseExpiry,
    driverData.licensePhoto,
    driverData.department || null,  // ✅ NUEVO
    driverData.municipality || null, // ✅ NUEVO
    "pending",
  ]
);
```

---

## 📊 Datos de Nicaragua

### **Departamentos (17):**
1. Managua
2. Masaya
3. Granada
4. León
5. Chinandega
6. Carazo
7. Rivas
8. Estelí
9. Matagalpa
10. Jinotega
11. Boaco
12. Chontales
13. Madriz
14. Nueva Segovia
15. Río San Juan
16. RACCS (Región Autónoma Costa Caribe Sur)
17. RACCN (Región Autónoma Costa Caribe Norte)

### **Municipios por Departamento:**
- **Managua:** 9 municipios (Managua, Ciudad Sandino, Tipitapa, etc.)
- **Masaya:** 9 municipios (Masaya, Masatepe, Nindirí, etc.)
- **Granada:** 4 municipios (Granada, Diriá, Diriomo, Nandaime)
- **León:** 10 municipios (León, Nagarote, La Paz Centro, etc.)
- ... (ver archivo completo en `nicaraguaLocations.ts`)

---

## 🎯 Casos de Uso

### **1. Análisis de Cobertura**
```sql
-- Conductores por departamento
SELECT department, COUNT(*) as total_drivers
FROM drivers
WHERE status = 'active'
GROUP BY department
ORDER BY total_drivers DESC;
```

### **2. Asignación Inteligente**
- Priorizar conductores del mismo departamento/municipio
- Reducir tiempos de llegada
- Mejorar experiencia del usuario

### **3. Reportes Geográficos**
- Demanda por región
- Conductores disponibles por zona
- Expansión de servicio

---

## 🚀 Deployment

### **1. Ejecutar Migración en Supabase:**
```sql
-- Ejecutar: database/migrations/add-driver-location-fields.sql
```

### **2. Desplegar Backend:**
```bash
cd functions
firebase deploy --only functions:register
```

### **3. Actualizar Frontend:**
```bash
cd Frontend
npm start
# o
npx expo start
```

---

## ✅ Testing

### **Flujo de Prueba:**

1. **Abrir app** → Ir a Registro
2. **Seleccionar rol:** Conductor
3. **Llenar datos básicos:** Nombre, email, teléfono, contraseña
4. **Datos de licencia:** Número de licencia
5. **Ubicación:**
   - Seleccionar departamento (ej: Managua)
   - Seleccionar municipio (ej: Tipitapa)
6. **Datos del vehículo:** Placa, marca, modelo, año, color, tipo
7. **Registrar**
8. **Verificar en Supabase:**
   ```sql
   SELECT user_id, license_number, department, municipality
   FROM drivers
   ORDER BY created_at DESC
   LIMIT 1;
   ```

---

## 📝 Notas

- Los campos son **obligatorios** para conductores
- Los campos son **NULL** para clientes (no aplica)
- Los datos están basados en la división política-administrativa oficial de Nicaragua
- Los índices mejoran el rendimiento de búsquedas por ubicación

---

## 🔄 Próximas Mejoras

1. **Filtro de conductores por ubicación** en pantalla de admin
2. **Mapa de calor** de conductores por región
3. **Sugerencias de expansión** basadas en demanda vs oferta
4. **Notificaciones push** segmentadas por departamento
5. **Promociones regionales** específicas por zona

---

**Estado:** ✅ **Implementado y listo para producción**
