# 🚗 Aclaración: ¿Qué es un Vehículo 4x4?

## Fecha: 10 de Octubre 2025

---

## 📋 Definición

El campo `is_4x4` en la tabla `vehicles` identifica vehículos con **tracción en las 4 ruedas** (4WD o AWD), aptos para el servicio de **Conductor Designado**.

---

## ✅ Vehículos que DEBEN ser marcados como 4x4:

### 1. Camionetas Pickup
- Toyota Hilux
- Nissan Frontier / Navara
- Ford Ranger / F-150
- Chevrolet Colorado / Silverado
- Mitsubishi L200
- Mazda BT-50
- Isuzu D-Max

### 2. SUVs (Sport Utility Vehicles)
- Toyota 4Runner, Land Cruiser, RAV4 (4x4)
- Nissan Pathfinder, Xterra, Patrol
- Ford Explorer, Expedition, Bronco
- Chevrolet Tahoe, Suburban, Traverse
- Honda Pilot, CR-V (AWD)
- Mazda CX-5, CX-9 (AWD)
- Mitsubishi Montero, Pajero, Outlander

### 3. Jeeps (Todos)
- Jeep Wrangler
- Jeep Cherokee
- Jeep Grand Cherokee
- Jeep Compass (4x4)
- Jeep Renegade (4x4)

### 4. Vans 4x4
- Ford Transit 4x4
- Mercedes-Benz Sprinter 4x4
- Toyota Hiace 4x4

### 5. Sedanes con 4x4/AWD
- Subaru Legacy (AWD)
- Subaru Outback (AWD)
- Audi A4 Quattro
- Audi A6 Quattro
- BMW xDrive (modelos con tracción integral)

### 6. Crossovers con AWD
- Honda CR-V (AWD)
- Toyota RAV4 (AWD)
- Mazda CX-5 (AWD)
- Nissan Rogue (AWD)

---

## ❌ Vehículos que NO deben ser marcados como 4x4:

### 1. Motos
- Cualquier motocicleta
- Scooters
- Motonetas

### 2. Sedanes 2WD (Tracción Delantera o Trasera)
- Toyota Corolla
- Honda Civic
- Nissan Sentra
- Mazda 3
- Hyundai Elantra

### 3. Autos Compactos
- Toyota Yaris
- Honda Fit
- Nissan Versa
- Chevrolet Spark

### 4. SUVs 2WD
- Toyota RAV4 (versión 2WD)
- Honda CR-V (versión 2WD)
- Nissan Rogue (versión 2WD)

---

## 🔍 ¿Cómo Identificar un Vehículo 4x4?

### Características Físicas:
1. **Altura del chasis:** Generalmente más alto que un sedán normal
2. **Ruedas más grandes:** Llantas más robustas
3. **Emblemas:** Badges de "4x4", "4WD", "AWD", "Quattro", "xDrive"
4. **Distancia al suelo:** Mayor clearance (espacio entre el suelo y el chasis)

### Características Técnicas:
1. **Sistema de tracción:** Tracción en las 4 ruedas
2. **Modos de manejo:** Selector de 2WD/4WD o modo automático AWD
3. **Diferencial:** Sistema de diferencial para distribuir potencia

### En la Documentación del Vehículo:
1. **Manual del propietario:** Especifica el tipo de tracción
2. **Tarjeta de circulación:** Puede indicar el modelo (ej: "4x4")
3. **Ficha técnica:** Especificaciones del fabricante

---

## 💡 Criterio Principal

**Un vehículo es 4x4 si tiene tracción en las 4 ruedas (4WD o AWD).**

### Tipos de Tracción:
- **2WD (Two-Wheel Drive):** ❌ NO es 4x4
  - FWD (Front-Wheel Drive): Tracción delantera
  - RWD (Rear-Wheel Drive): Tracción trasera

- **4WD (Four-Wheel Drive):** ✅ SÍ es 4x4
  - Part-time 4WD: Se activa manualmente
  - Full-time 4WD: Siempre activo

- **AWD (All-Wheel Drive):** ✅ SÍ es 4x4
  - Sistema automático que distribuye potencia a las 4 ruedas

---

## 🎯 ¿Por qué solo 4x4 para Conductor Designado?

### Razones:

1. **Seguridad:**
   - Mayor estabilidad en diferentes condiciones
   - Mejor tracción en caminos mojados o irregulares
   - Más control en situaciones de emergencia

2. **Capacidad:**
   - Vehículos generalmente más grandes
   - Más espacio para pasajeros
   - Más espacio para equipaje

3. **Confiabilidad:**
   - Vehículos más robustos
   - Mejor para viajes largos
   - Más seguros para el servicio nocturno

4. **Estándar de Calidad:**
   - Servicio premium requiere vehículos premium
   - Imagen profesional
   - Mayor confort para los pasajeros

---

## 📊 Ejemplos por Marca

### Toyota:
- ✅ 4x4: Hilux, 4Runner, Land Cruiser, RAV4 (4x4), Sequoia
- ❌ 2WD: Corolla, Yaris, Camry, RAV4 (2WD)

### Nissan:
- ✅ 4x4: Frontier, Navara, Pathfinder, Xterra, Patrol, Armada
- ❌ 2WD: Sentra, Versa, Altima

### Ford:
- ✅ 4x4: Ranger, F-150, Explorer (4x4), Expedition, Bronco
- ❌ 2WD: Fiesta, Focus, Fusion

### Chevrolet:
- ✅ 4x4: Colorado, Silverado, Tahoe, Suburban, Traverse (AWD)
- ❌ 2WD: Spark, Cruze, Malibu

### Honda:
- ✅ 4x4: Pilot (AWD), CR-V (AWD), Ridgeline (AWD)
- ❌ 2WD: Civic, Accord, Fit, CR-V (2WD)

### Subaru:
- ✅ 4x4: **TODOS** (Subaru usa AWD estándar en casi todos sus modelos)
  - Legacy, Outback, Forester, Crosstrek, Ascent

---

## 🛠️ Script SQL para Marcar Vehículos

Ver archivo: `database/scripts/mark_4x4_vehicles.sql`

### Opciones:
1. **Por tipo:** Marca automáticamente SUVs, pickups, jeeps
2. **Por marca/modelo:** Marca modelos específicos conocidos
3. **Manual:** Marca vehículos individuales por ID o placa

---

## 📝 Proceso de Verificación

### Para Conductores Nuevos:
1. Conductor registra su vehículo
2. Indica marca, modelo, año
3. **Sistema pregunta:** "¿Tu vehículo tiene tracción 4x4 o AWD?"
4. Conductor confirma
5. Sistema marca `is_4x4 = TRUE` si aplica

### Para Vehículos Existentes:
1. Revisar lista de vehículos en BD
2. Identificar cuáles tienen 4x4/AWD
3. Ejecutar script SQL para marcarlos
4. Verificar con los conductores si hay dudas

---

## ⚠️ Casos Especiales

### Vehículos Híbridos:
- Si tienen AWD → ✅ Marcar como 4x4
- Si son 2WD → ❌ No marcar

### Vehículos Eléctricos:
- Tesla Model X (AWD) → ✅ Marcar como 4x4
- Tesla Model 3 (RWD) → ❌ No marcar
- Tesla Model 3 (AWD) → ✅ Marcar como 4x4

### Vehículos Deportivos:
- Porsche 911 (AWD) → ✅ Marcar como 4x4
- Porsche 911 (RWD) → ❌ No marcar

---

## 🎯 Resumen

**Criterio Simple:**
```
¿El vehículo tiene tracción en las 4 ruedas?
  SÍ → is_4x4 = TRUE ✅
  NO → is_4x4 = FALSE ❌
```

**No importa si es:**
- Camioneta
- SUV
- Sedán
- Van
- Crossover

**Lo que importa es:**
- ¿Tiene 4WD o AWD?
- ¿Tiene tracción en las 4 ruedas?

---

**Última actualización:** 10 de Octubre 2025, 21:50  
**Autor:** Sistema DriveAngel.ni
