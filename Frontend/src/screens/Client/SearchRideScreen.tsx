import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  Platform,
  Switch,
  Modal,
} from 'react-native';
import DynamicMap from '../../components/DynamicMap';
import { useLocation } from '../../hooks/useLocation';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ridesService, { Driver } from '../../services/ridesService';
import mapsService from '../../services/mapsService';
import driversService from '../../services/driversService';
import Button from '../../components/Button';

export default function SearchRideScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { coords } = useLocation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originCoords, setOriginCoords] = useState<{latitude: number; longitude: number} | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{latitude: number; longitude: number} | null>(null);
  
  // Tipo de viaje
  const [isDesignatedDriver, setIsDesignatedDriver] = useState(false);
  
  // Autocompletado
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const isSelectingSuggestionRef = useRef(false);
  
  // Conductores y viaje
  const [searchingDrivers, setSearchingDrivers] = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [requestingRide, setRequestingRide] = useState(false);
  const [driversAvailable, setDriversAvailable] = useState<boolean | null>(null);
  const [checkingDrivers, setCheckingDrivers] = useState(false);
  
  // Estimaciones reales
  const [estimatedPrice, setEstimatedPrice] = useState(0);
  const [estimatedDistance, setEstimatedDistance] = useState(0);
  const [estimatedDuration, setEstimatedDuration] = useState(0);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  
  // Modo selección en mapa
  const [isSelectingOnMap, setIsSelectingOnMap] = useState(false);
  const [selectingType, setSelectingType] = useState<'origin' | 'destination'>('destination'); // Nuevo: qué estamos seleccionando
  const [selectedMapLocation, setSelectedMapLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [previewRoute, setPreviewRoute] = useState<any[]>([]);
  const [showRouteConfirmation, setShowRouteConfirmation] = useState(false);

  // Consultar proveedor de mapas al backend
  useEffect(() => {
    mapsService.fetchProviderFromBackend();
  }, []);

  // Verificar conductores disponibles al abrir la pantalla
  useEffect(() => {
    if (coords) {
      checkDriverAvailability();
    }
  }, [coords]);

  const checkDriverAvailability = async () => {
    if (!coords) return;

    setCheckingDrivers(true);
    try {
      const result = await driversService.checkAvailableDrivers(coords, 10);
      setDriversAvailable(result.available);
      console.log(`ℹ️ Conductores disponibles: ${result.count}`);
    } catch (error) {
      console.error('Error verificando conductores:', error);
      setDriversAvailable(null);
    } finally {
      setCheckingDrivers(false);
    }
  };

  // Obtener dirección del origen al cargar
  useEffect(() => {
    if (coords) {
      loadOriginAddress();
    }
  }, [coords]);

  const loadOriginAddress = async () => {
    if (!coords) return;
    const address = await mapsService.reverseGeocode(coords);
    if (address) {
      setOrigin(address);
      setOriginCoords(coords); // Guardar coordenadas del origen
    }
  };

  // Autocompletar destino con debounce
  useEffect(() => {
    // No buscar si se está seleccionando una sugerencia
    if (isSelectingSuggestionRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      if (destination.length > 2) {
        searchPlaces(destination);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [destination]);

  const searchPlaces = async (text: string) => {
    try {
      setLoadingSuggestions(true);
      const results = await mapsService.autocomplete(text, coords || undefined);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch (error) {
      console.error('Error searching places:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const selectSuggestion = async (place: any) => {
    // Activar bandera para evitar búsqueda automática
    isSelectingSuggestionRef.current = true;
    
    // Limpiar sugerencias INMEDIATAMENTE
    setShowSuggestions(false);
    setSuggestions([]);
    
    // Actualizar destino
    setDestination(place.description);
    
    // Obtener coordenadas del lugar
    const placeCoords = await mapsService.getPlaceDetails(place.place_id, place.position);
    if (!placeCoords) {
      Alert.alert('Error', 'No se pudieron obtener las coordenadas del lugar');
      isSelectingSuggestionRef.current = false;
      return;
    }
    
    setDestinationCoords(placeCoords);
    
    // Calcular ruta real con TomTom Routing API
    const startPoint = originCoords || coords;
    if (startPoint) {
      await calculateRealRoute(startPoint, placeCoords);
    }
    
    // Desactivar bandera después de un delay más largo
    setTimeout(() => {
      isSelectingSuggestionRef.current = false;
    }, 500);
  };

  const handleMapPress = async (latitude: number, longitude: number) => {
    setSelectedMapLocation({ latitude, longitude });
    
    // Si estamos seleccionando origen, no calcular ruta aún
    if (selectingType === 'origin') {
      setShowRouteConfirmation(true);
      return;
    }
    
    // Si estamos seleccionando destino, calcular ruta desde el origen
    const startPoint = originCoords || coords;
    if (startPoint) {
      setCalculatingRoute(true);
      const route = await mapsService.getDirections(startPoint, { latitude, longitude });
      
      if (route) {
        // Guardar la ruta para preview
        setPreviewRoute(route.polyline);
        
        // Calcular estimaciones
        const distanceKm = route.distance / 1000;
        const durationMin = route.duration / 60;
        const price = mapsService.calculateEstimatedPrice(route.distance, route.duration);
        
        setEstimatedDistance(parseFloat(distanceKm.toFixed(2)));
        setEstimatedDuration(parseFloat(durationMin.toFixed(0)));
        setEstimatedPrice(parseFloat(price.toFixed(2)));
        
        // Mostrar confirmación
        setShowRouteConfirmation(true);
      }
      setCalculatingRoute(false);
    }
  };

  const confirmRoute = async () => {
    if (!selectedMapLocation) return;
    
    const { latitude, longitude } = selectedMapLocation;
    
    // Obtener dirección usando Reverse Geocoding
    const address = await mapsService.reverseGeocode({ latitude, longitude });
    console.log('📍 Address from map:', address);
    
    if (address) {
      isSelectingSuggestionRef.current = true;
      
      if (selectingType === 'origin') {
        // Actualizar origen
        setOrigin(address);
        setOriginCoords({ latitude, longitude });
        
        // Si ya hay destino, recalcular ruta
        if (destinationCoords) {
          await calculateRealRoute({ latitude, longitude }, destinationCoords);
        }
      } else {
        // Actualizar destino
        setDestination(address);
        setDestinationCoords({ latitude, longitude });
        setRouteCoordinates(previewRoute);
      }
      
      setShowSuggestions(false);
      setSuggestions([]);
      
      // Cerrar modal y limpiar preview
      setIsSelectingOnMap(false);
      setShowRouteConfirmation(false);
      setPreviewRoute([]);
      setSelectedMapLocation(null);
      
      setTimeout(() => {
        isSelectingSuggestionRef.current = false;
      }, 1000);
    }
  };

  const cancelRouteSelection = () => {
    setShowRouteConfirmation(false);
    setPreviewRoute([]);
    setSelectedMapLocation(null);
    setEstimatedPrice(0);
    setEstimatedDistance(0);
    setEstimatedDuration(0);
  };

  const calculateRealRoute = async (origin: any, destination: any) => {
    try {
      setCalculatingRoute(true);
      
      const route = await mapsService.getDirections(origin, destination);
      
      if (route) {
        // Distancia en km
        const distanceKm = route.distance / 1000;
        setEstimatedDistance(parseFloat(distanceKm.toFixed(2)));
        
        // Duración en minutos
        const durationMin = route.duration / 60;
        setEstimatedDuration(parseFloat(durationMin.toFixed(0)));
        
        // Precio basado en distancia y duración REALES
        const price = mapsService.calculateEstimatedPrice(
          route.distance,
          route.duration
        );
        setEstimatedPrice(parseFloat(price.toFixed(2)));
        
        // Polyline ya viene como array de coordenadas
        setRouteCoordinates(route.polyline);
        
        console.log('✅ Ruta calculada:', {
          distancia: distanceKm.toFixed(2) + ' km',
          duración: durationMin.toFixed(0) + ' min',
          precio: 'C$' + price.toFixed(2)
        });
      }
    } catch (error) {
      console.error('Error calculating route:', error);
      Alert.alert('Error', 'No se pudo calcular la ruta');
    } finally {
      setCalculatingRoute(false);
    }
  };

  const searchDrivers = async () => {
    if (!destination.trim()) {
      Alert.alert('Error', 'Por favor ingresa un destino');
      return;
    }

    if (!destinationCoords) {
      Alert.alert('Error', 'Por favor selecciona un destino del autocompletado');
      return;
    }

    // Usar originCoords si está disponible, sino usar ubicación actual
    const startPoint = originCoords || coords;
    if (!startPoint || !user) {
      Alert.alert('Error', 'No se pudo obtener la ubicación de origen');
      return;
    }

    try {
      setRequestingRide(true);

      // Verificar conductores disponibles antes de solicitar
      console.log('🔍 Verificando conductores disponibles...');
      const availabilityCheck = await driversService.checkAvailableDrivers(startPoint, 10);
      
      if (!availabilityCheck.available || availabilityCheck.count === 0) {
        Alert.alert(
          'Sin conductores',
          'No hay conductores disponibles en este momento. Por favor, intenta más tarde.'
        );
        setRequestingRide(false);
        return;
      }

      console.log(`✅ ${availabilityCheck.count} conductor(es) disponible(s)`);

      // Solicitar viaje directamente (sin buscar conductores primero)
      const ride = await ridesService.requestRide({
        clientId: user.id,
        origin: {
          lat: startPoint.latitude,
          lng: startPoint.longitude,
          address: origin || 'Mi ubicación',
        },
        destination: {
          lat: destinationCoords.latitude,
          lng: destinationCoords.longitude,
          address: destination,
        },
        estimatedDistance: Math.round(estimatedDistance * 1000), // Convertir a metros
        estimatedDuration: Math.round(estimatedDuration * 60), // Convertir a segundos
        estimatedPrice: estimatedPrice,
        rideType: isDesignatedDriver ? 'designated_driver' : 'normal',
        notes: isDesignatedDriver ? '🚗 Conductor Designado' : undefined,
      });

      console.log('✅ Viaje solicitado:', ride.id);

      // Navegar a la pantalla de confirmación
      navigation.navigate('RideConfirmation', { rideId: ride.id });
    } catch (error: any) {
      console.error('Error requesting ride:', error);
      Alert.alert(
        'Error',
        error.response?.data?.message || error.message || 'No se pudo solicitar el viaje',
      );
    } finally {
      setRequestingRide(false);
    }
  };

  const requestRide = async () => {
    if (!selectedDriver) {
      Alert.alert('Error', 'Por favor selecciona un conductor');
      return;
    }

    // Usar originCoords si está disponible, sino usar ubicación actual
    const startPoint = originCoords || coords;
    if (!startPoint || !user || !destinationCoords) {
      Alert.alert('Error', 'Datos incompletos');
      return;
    }

    try {
      setRequestingRide(true);

      const ride = await ridesService.requestRide({
        clientId: user.id,
        origin: {
          lat: startPoint.latitude,
          lng: startPoint.longitude,
          address: origin || 'Mi ubicación',
        },
        destination: {
          lat: destinationCoords.latitude,
          lng: destinationCoords.longitude,
          address: destination,
        },
        estimatedDistance: Math.round(estimatedDistance * 1000), // Convertir a metros
        estimatedDuration: Math.round(estimatedDuration * 60), // Convertir a segundos
        estimatedPrice: estimatedPrice,
        rideType: isDesignatedDriver ? 'designated_driver' : 'normal',
        notes: isDesignatedDriver ? '🚗 Conductor Designado' : undefined,
      });

      // Navegar a la pantalla de confirmación
      navigation.navigate('RideConfirmation', { rideId: ride.id });
    } catch (error: any) {
      console.error('Error requesting ride:', error);
      Alert.alert(
        'Error',
        error.response?.data?.message || 'No se pudo solicitar el viaje',
      );
    } finally {
      setRequestingRide(false);
    }
  };

  if (!coords) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>Obteniendo ubicación...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mapa pequeño - Solo mostrar si NO hay destino seleccionado */}
      {!destinationCoords && (
        <View style={styles.mapContainer}>
          <DynamicMap
            latitude={coords.latitude}
            longitude={coords.longitude}
            style={styles.map}
            showMarker={true}
            markerPosition={{ latitude: coords.latitude, longitude: coords.longitude }}
            markerType="origin"
          />
        </View>
      )}

      {/* Modal de mapa en pantalla completa */}
      <Modal
        visible={isSelectingOnMap}
        animationType="slide"
        onRequestClose={() => setIsSelectingOnMap(false)}
      >
        <View style={styles.fullMapContainer}>
          {/* Header */}
          <View style={styles.fullMapHeader}>
            <Text style={styles.fullMapTitle}>
              {showRouteConfirmation 
                ? '🛣️ ¿Confirmar ubicación?' 
                : selectingType === 'origin'
                  ? '🔵 Toca el mapa para seleccionar origen'
                  : '🔴 Toca el mapa para seleccionar destino'}
            </Text>
            <TouchableOpacity 
              style={styles.closeMapButton}
              onPress={() => {
                setIsSelectingOnMap(false);
                cancelRouteSelection();
              }}
            >
              <Text style={styles.closeMapButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Mapa completo */}
          <DynamicMap
            latitude={
              selectedMapLocation?.latitude || 
              originCoords?.latitude || 
              coords?.latitude || 
              12.1364 // Managua, Nicaragua (fallback)
            }
            longitude={
              selectedMapLocation?.longitude || 
              originCoords?.longitude || 
              coords?.longitude || 
              -86.2514 // Managua, Nicaragua (fallback)
            }
            style={styles.fullMap}
            onMapPress={showRouteConfirmation ? undefined : (event) => handleMapPress(event.latitude, event.longitude)}
            showMarker={!!selectedMapLocation}
            markerPosition={selectedMapLocation || undefined}
            markerType={selectingType === 'origin' ? 'origin' : 'destination'}
            originMarker={originCoords || coords || undefined}
            routeCoordinates={previewRoute}
          />

          {/* Panel de confirmación de ruta */}
          {showRouteConfirmation && (
            <View style={styles.routeConfirmationPanel}>
              {calculatingRoute ? (
                <ActivityIndicator size="large" color="#000" />
              ) : (
                <>
                  <View style={styles.routeInfo}>
                    <View style={styles.routeInfoItem}>
                      <Text style={styles.routeInfoLabel}>Distancia</Text>
                      <Text style={styles.routeInfoValue}>{estimatedDistance} km</Text>
                    </View>
                    <View style={styles.routeInfoItem}>
                      <Text style={styles.routeInfoLabel}>Tiempo</Text>
                      <Text style={styles.routeInfoValue}>{estimatedDuration} min</Text>
                    </View>
                    <View style={styles.routeInfoItem}>
                      <Text style={styles.routeInfoLabel}>Precio</Text>
                      <Text style={styles.routeInfoValue}>C${estimatedPrice}</Text>
                    </View>
                  </View>

                  <View style={styles.routeButtons}>
                    <TouchableOpacity
                      style={styles.cancelRouteButton}
                      onPress={cancelRouteSelection}
                    >
                      <Text style={styles.cancelRouteButtonText}>Cambiar Ruta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmRouteButton}
                      onPress={confirmRoute}
                    >
                      <Text style={styles.confirmRouteButtonText}>✓ Confirmar Ruta</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* Formulario de búsqueda */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>¿A dónde vas?</Text>

        {/* Origen */}
        <View style={styles.inputContainer}>
          <View style={styles.inputHeader}>
            <Text style={styles.inputLabel}>🔵 Origen</Text>
            <TouchableOpacity 
              style={styles.mapPinButton}
              onPress={() => {
                setSelectingType('origin');
                setIsSelectingOnMap(true);
              }}
              disabled={searchingDrivers}
            >
              <Text style={styles.mapPinButtonText}>📍 Cambiar origen</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Tu ubicación actual"
            value={origin}
            onChangeText={setOrigin}
            editable={!searchingDrivers}
          />
        </View>

        {/* Destino con Autocompletar */}
        <View style={styles.inputContainer}>
          <View style={styles.inputHeader}>
            <Text style={styles.inputLabel}>🔴 Destino</Text>
            <TouchableOpacity 
              style={styles.mapPinButton}
              onPress={() => {
                setSelectingType('destination');
                setIsSelectingOnMap(true);
              }}
              disabled={searchingDrivers}
            >
              <Text style={styles.mapPinButtonText}>📍 Seleccionar en mapa</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Buscar dirección..."
            value={destination}
            onChangeText={setDestination}
            editable={!searchingDrivers}
          />
          {loadingSuggestions && (
            <ActivityIndicator style={styles.suggestionsLoader} size="small" color="#000" />
          )}
        </View>

        {/* Tipo de servicio */}
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
              trackColor={{ false: '#ccc', true: '#4CAF50' }}
              thumbColor={isDesignatedDriver ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Sugerencias de Google Places */}
        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            {suggestions.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionItem}
                onPress={() => selectSuggestion(suggestion)}
              >
                <Text style={styles.suggestionIcon}>📍</Text>
                <View style={styles.suggestionText}>
                  <Text style={styles.suggestionMain}>
                    {suggestion.structured_formatting.main_text}
                  </Text>
                  <Text style={styles.suggestionSecondary}>
                    {suggestion.structured_formatting.secondary_text}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Indicador de cálculo de ruta */}
        {calculatingRoute && (
          <View style={styles.calculatingContainer}>
            <ActivityIndicator size="small" color="#000" />
            <Text style={styles.calculatingText}>Calculando ruta real...</Text>
          </View>
        )}

        {/* Estimación REAL con TomTom Routing */}
        {estimatedPrice > 0 && !calculatingRoute && (
          <View style={styles.estimateCard}>
            <Text style={styles.estimateTitle}>📊 Estimación Real (TomTom Maps)</Text>
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>📏 Distancia:</Text>
              <Text style={styles.estimateValue}>{estimatedDistance} km</Text>
            </View>
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>⏱️ Duración:</Text>
              <Text style={styles.estimateValue}>{estimatedDuration} min</Text>
            </View>
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>💰 Precio estimado:</Text>
              <Text style={styles.estimatePrice}>C${estimatedPrice}</Text>
            </View>
          </View>
        )}

        {/* Mensaje de disponibilidad de conductores */}
        {driversAvailable === false && !requestingRide && (
          <View style={styles.noDriversCard}>
            <Text style={styles.noDriversIcon}>🚗</Text>
            <Text style={styles.noDriversTitle}>No hay conductores disponibles</Text>
            <Text style={styles.noDriversText}>
              En este momento no hay conductores cerca de tu ubicación. Por favor, intenta más tarde.
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={checkDriverAvailability}
              disabled={checkingDrivers}
            >
              <Text style={styles.refreshButtonText}>
                {checkingDrivers ? 'Verificando...' : '🔄 Verificar de nuevo'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Botón buscar conductores */}
        {availableDrivers.length === 0 && driversAvailable !== false && (
          <Button
            title={requestingRide ? 'Solicitando viaje...' : 'Buscar Conductor'}
            onPress={searchDrivers}
            style={{ marginTop: 16 }}
            disabled={requestingRide || !destinationCoords || checkingDrivers}
          />
        )}

        {/* Lista de conductores disponibles */}
        {availableDrivers.length > 0 && (
          <View style={styles.driversSection}>
            <Text style={styles.driversTitle}>
              Conductores disponibles ({availableDrivers.length})
            </Text>

            {availableDrivers.map((driver) => (
              <TouchableOpacity
                key={driver.id}
                style={[
                  styles.driverCard,
                  selectedDriver?.id === driver.id && styles.driverCardSelected,
                ]}
                onPress={() => setSelectedDriver(driver)}
              >
                <View style={styles.driverInfo}>
                  <Text style={styles.driverName}>{driver.name}</Text>
                  <Text style={styles.driverRating}>⭐ {driver.rating.toFixed(1)}</Text>
                </View>
                <View style={styles.vehicleInfo}>
                  <Text style={styles.vehicleText}>
                    {driver.vehicle.brand} {driver.vehicle.model}
                  </Text>
                  <Text style={styles.vehicleColor}>{driver.vehicle.color}</Text>
                  <Text style={styles.vehiclePlate}>{driver.vehicle.plate}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <Button
              title={requestingRide ? 'Solicitando...' : 'Confirmar Viaje'}
              onPress={requestRide}
              style={{ marginTop: 16 }}
              disabled={!selectedDriver || requestingRide}
            />

            <TouchableOpacity
              onPress={() => setAvailableDrivers([])}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Buscar de nuevo</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapContainer: {
    height: 200,
  },
  map: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 20,
    color: colors.text,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  estimateCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  estimateLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  estimateValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  estimatePrice: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  driversSection: {
    marginTop: 20,
  },
  driversTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  driverCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  driverCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  driverInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
  },
  driverRating: {
    fontSize: 16,
    fontWeight: '600',
  },
  vehicleInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  vehicleText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  vehicleColor: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  vehiclePlate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  cancelButton: {
    marginTop: 12,
    alignItems: 'center',
    padding: 12,
  },
  cancelText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  // Estilos para sugerencias de Google Places
  suggestionsLoader: {
    position: 'absolute',
    right: 16,
    top: 38,
  },
  suggestionsContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    marginTop: -8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionMain: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  suggestionSecondary: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  calculatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calculatingText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.textSecondary,
  },
  estimateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  serviceTypeContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  serviceTypeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceTypeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  serviceTypeSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    maxWidth: '80%',
  },
  // Estilos para selección en mapa
  mapOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  mapOverlayText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  cancelMapButton: {
    backgroundColor: colors.card,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelMapButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  mapPinButton: {
    backgroundColor: colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapPinButtonText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  // Estilos para modal de mapa completo
  fullMapContainer: {
    flex: 1,
    backgroundColor: colors.card,
  },
  fullMapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  fullMapTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  closeMapButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeMapButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  fullMap: {
    flex: 1,
  },
  // Estilos para confirmación de ruta
  routeConfirmationPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  routeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  routeInfoItem: {
    alignItems: 'center',
  },
  routeInfoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  routeInfoValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  routeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelRouteButton: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelRouteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  confirmRouteButton: {
    flex: 1,
    backgroundColor: colors.text,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmRouteButtonText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
  // Estilos para mensaje de no disponibilidad
  noDriversCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    marginTop: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  noDriversIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  noDriversTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  noDriversText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  refreshButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
