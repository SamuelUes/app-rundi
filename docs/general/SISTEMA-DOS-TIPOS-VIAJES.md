# 🚗 Sistema de Dos Tipos de Viajes

**Fecha**: 2025-10-07 23:56  
**Estado**: ✅ Implementado

---

## 🎯 TIPOS DE VIAJE

### **1. 🚕 Viaje Normal (Tipo Uber)**
- Cliente solicita viaje
- Conductor usa su propio vehículo
- Conductor recoge al cliente
- Lleva al cliente al destino

### **2. 🚗 Conductor Designado**
- Cliente tiene su propio vehículo
- Cliente no puede/quiere manejar
- Conductor solo maneja el vehículo del cliente
- Servicio de chofer designado

---

## ✅ IMPLEMENTACIÓN CLIENTE

### **SearchRideScreen.tsx - Switch de Tipo de Servicio**

```typescript
const [isDesignatedDriver, setIsDesignatedDriver] = useState(false);

<View style={styles.serviceTypeContainer}>
  <View style={styles.serviceTypeHeader}>
    <View>
      <Text style={styles.serviceTypeTitle}>
        {isDesignatedDriver ? '🚗 Conductor Designado' : '🚕 Viaje Normal'}
      </Text>
      <Text style={styles.serviceTypeSubtitle}>
        {isDesignatedDriver 
          ? 'Usarás tu propio vehículo, el conductor solo maneja'
          : 'Viaje tradicional tipo Uber'}
      </Text>
    </View>
    <Switch
      value={isDesignatedDriver}
      onValueChange={setIsDesignatedDriver}
    />
  </View>
</View>
```

### **Solicitud de Viaje con Tipo**

```typescript
const ride = await ridesService.requestRide({
  clientId: user.id,
  origin: { latitude, longitude, address },
  destination: { latitude, longitude, address },
  rideType: isDesignatedDriver ? 'designated_driver' : 'normal',
  notes: `${isDesignatedDriver ? '🚗 Conductor Designado | ' : ''}...`,
});
```

---

## 📱 PANTALLA CONDUCTOR - Ver Solicitudes en Mapa

### **DriverHomeScreen.tsx - Actualización Necesaria**

**LO QUE FALTA IMPLEMENTAR:**

1. **Mapa con marcadores de solicitudes**
   - Mostrar pins en el mapa donde hay solicitudes
   - Color diferente para cada tipo:
     - 🚕 Azul = Viaje normal
     - 🚗 Verde = Conductor designado

2. **Click en marcador → Ver detalles**
   ```typescript
   <Marker
     coordinate={request.origin}
     onPress={() => showRideDetails(request)}
   >
     <View style={styles.markerContainer}>
       <Text>{request.rideType === 'designated_driver' ? '🚗' : '🚕'}</Text>
     </View>
   </Marker>
   ```

3. **Modal con información del viaje**
   ```typescript
   <Modal visible={showDetails}>
     <View style={styles.rideDetails}>
       <Text style={styles.clientName}>
         👤 {ride.client.name}
       </Text>
       
       <View style={styles.locations}>
         <Text>📍 Origen: {ride.origin.address}</Text>
         <Text>📍 Destino: {ride.destination.address}</Text>
       </View>
       
       <View style={styles.rideType}>
         {ride.rideType === 'designated_driver' ? (
           <Text>🚗 Conductor Designado</Text>
         ) : (
           <Text>🚕 Viaje Normal</Text>
         )}
       </View>
       
       <View style={styles.pricing}>
         {ride.suggestedPrice ? (
           <Text>💰 Precio sugerido: C${ride.suggestedPrice}</Text>
         ) : (
           <TextInput
             placeholder="Sugerir precio..."
             onChangeText={setProposedPrice}
           />
         )}
       </View>
       
       <Button title="Aceptar Viaje" onPress={acceptRide} />
     </View>
   </Modal>
   ```

---

## 🗺️ FLUJO COMPLETO

### **Cliente:**
1. Abre "Buscar viaje"
2. Ingresa origen y destino
3. **Activa/desactiva switch** de "Conductor Designado"
4. Ve precio estimado
5. Busca conductores
6. Confirma viaje

### **Conductor:**
1. Activa disponibilidad
2. **Ve mapa con solicitudes** (pins)
3. Click en pin → Ve detalles:
   - Nombre del cliente
   - Origen → Destino
   - Tipo de viaje
   - Precio (si hay) o campo para sugerir
4. Acepta viaje
5. Navega al origen

---

## 📊 BACKEND - Actualización Necesaria

### **Ride Entity - Agregar campo rideType**

```typescript
@Entity('rides')
export class Ride {
  @Column({
    type: 'enum',
    enum: ['normal', 'designated_driver'],
    default: 'normal'
  })
  rideType: string;
  
  @Column({ type: 'decimal', nullable: true })
  suggestedPrice: number;
  
  @Column({ type: 'decimal', nullable: true })
  driverProposedPrice: number;
}
```

### **Endpoint para conductores - Ver solicitudes**

```typescript
// GET /api/rides/available?rideType=all|normal|designated_driver
@Get('available')
async getAvailableRides(
  @Query('rideType') rideType: string,
  @Query('lat') lat: number,
  @Query('lng') lng: number,
  @Query('radius') radius: number = 10000 // 10km
) {
  return this.ridesService.findAvailableRides({
    rideType,
    location: { lat, lng },
    radius
  });
}
```

---

## 🎨 UI/UX DIFERENCIAS

### **Cliente - SearchRideScreen**
```
┌─────────────────────────────┐
│ 🔵 Origen                   │
│ [Tu ubicación actual]       │
├─────────────────────────────┤
│ 🔴 Destino                  │
│ [Buscar dirección...]       │
├─────────────────────────────┤
│ 🚗 Conductor Designado  [⚪]│
│ Usarás tu propio vehículo   │
├─────────────────────────────┤
│ 📊 Estimación               │
│ 📏 5.2 km                   │
│ ⏱️ 15 min                   │
│ 💰 C$120.00                 │
├─────────────────────────────┤
│ [Buscar Conductores]        │
└─────────────────────────────┘
```

### **Conductor - DriverHomeScreen (Propuesto)**
```
┌─────────────────────────────┐
│                             │
│    🗺️ MAPA CON PINS        │
│                             │
│  🚕 🚗    🚕                │
│      🚕                     │
│                             │
└─────────────────────────────┘
┌─────────────────────────────┐
│ 🟢 Disponible          [ON] │
├─────────────────────────────┤
│ 📍 Solicitudes cercanas (3) │
│                             │
│ 🚕 María G. - 2.5 km        │
│ Zona 10 → Aeropuerto        │
│ C$150                       │
│                             │
│ 🚗 Juan P. - 1.2 km         │
│ Centro → Carretera Sur      │
│ [Sugerir precio]            │
│                             │
│ 🚕 Ana L. - 4.8 km          │
│ Metrocentro → Universidad   │
│ C$200                       │
└─────────────────────────────┘
```

---

## 🔄 PRÓXIMOS PASOS

### **1. Actualizar DriverHomeScreen** ⚠️ PENDIENTE
- [ ] Agregar mapa con marcadores de solicitudes
- [ ] Implementar click en marcador
- [ ] Modal con detalles del viaje
- [ ] Campo para sugerir precio
- [ ] Botón "Aceptar viaje"

### **2. Actualizar Backend** ⚠️ PENDIENTE
- [ ] Agregar campo `rideType` a tabla `rides`
- [ ] Agregar campo `suggestedPrice`
- [ ] Agregar campo `driverProposedPrice`
- [ ] Endpoint `GET /api/rides/available`
- [ ] Filtrar por tipo de viaje

### **3. Sistema de Precios**
- [ ] Cliente puede poner precio sugerido
- [ ] Conductor puede proponer precio diferente
- [ ] Cliente acepta/rechaza propuesta

---

## ✅ COMPLETADO

- [x] Switch de tipo de viaje en SearchRideScreen
- [x] UI para seleccionar tipo de servicio
- [x] Actualizar RequestRideData con rideType
- [x] Enviar tipo de viaje al backend
- [x] Documentación completa

---

## 📝 NOTAS IMPORTANTES

1. **Conductor Designado** es un servicio premium
   - Puede tener precio diferente
   - Requiere conductores certificados
   - Cliente debe tener seguro del vehículo

2. **Filtros para conductores**
   - Algunos conductores solo hacen viajes normales
   - Otros pueden hacer ambos tipos
   - Configurar en perfil del conductor

3. **Precio sugerido vs Precio fijo**
   - Viaje normal: Precio calculado por app
   - Conductor designado: Cliente/Conductor negocian

---

**¿Quieres que implemente la pantalla del conductor con el mapa de solicitudes ahora?** 🗺️
