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
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DynamicMap from '../../components/DynamicMap';
import { useLocation } from '../../hooks/useLocation';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ridesService, { Driver } from '../../services/ridesService';
import mapsService from '../../services/mapsService';
import driversService from '../../services/driversService';
import Button from '../../components/Button';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { NoDriversEmptyState, NoSearchResultsEmptyState } from '../../components/EmptyState';
import { AnimatedButton } from '../../components/AnimatedButton';
import { calculateRidePrice, formatPriceBreakdown, getVehicleTypeName, type PriceBreakdown } from '../../utils/priceCalculator';

export default function SearchRideScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { coords } = useLocation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [originCoords, setOriginCoords] = useState<{latitude: number; longitude: number} | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{latitude: number; longitude: number} | null>(null);
  const [usingManualLocation, setUsingManualLocation] = useState(false);
  
  // Inicializar origen con ubicación actual al inicio
  useEffect(() => {
    if (coords && !originCoords) {
      setOriginCoords({ latitude: coords.latitude, longitude: coords.longitude });
      setOrigin('Mi ubicación actual');
    }
  }, [coords]);
  
  // Múltiples destinos
  const [extraDestinations, setExtraDestinations] = useState<Array<{address: string; coords: {latitude: number; longitude: number} | null}>>([]);
  
  // Cantidad de pasajeros
  const [passengers, setPassengers] = useState(1);
  
  // Tipo de vehículo
  const [vehicleType, setVehicleType] = useState<'moto' | 'auto' | 'designated_driver'>('auto');
  const [clientVehiclePhoto, setClientVehiclePhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  // Autocompletado
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [destinationSelected, setDestinationSelected] = useState(false);
  const [isDestinationFocused, setDestinationFocused] = useState(false);
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
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  
  // Negociación de precio
  const [suggestedPrice, setSuggestedPrice] = useState('');
  const [showPriceInput, setShowPriceInput] = useState(false);
  
  // Modo selección en mapa
  const [isSelectingOnMap, setIsSelectingOnMap] = useState(false);
  const [selectingType, setSelectingType] = useState<'origin' | 'destination' | 'extra' | null>('destination'); // Nuevo: qué estamos seleccionando
  const [currentExtraDestIndex, setCurrentExtraDestIndex] = useState<number>(0); // Índice de la parada extra que se está editando
  const [selectedMapLocation, setSelectedMapLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [previewRoute, setPreviewRoute] = useState<any[]>([]);
  const [showRouteConfirmation, setShowRouteConfirmation] = useState(false);
  
  // Pines móviles (draggable markers)
  const [isDraggingMarker, setIsDraggingMarker] = useState(false);
  const [draggedMarkerType, setDraggedMarkerType] = useState<'origin' | 'destination' | null>(null);
  const [tempLocation, setTempLocation] = useState<{latitude: number; longitude: number; address?: string} | null>(null);
  const [showLocationConfirmation, setShowLocationConfirmation] = useState(false);
  const [loadingAddress, setLoadingAddress] = useState(false);

  // Método de pago seleccionado: 'cash' (efectivo) o 'card' (bancos nacionales)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');

  // Consultar proveedor de mapas al backend
  useEffect(() => {
    mapsService.fetchProviderFromBackend();
  }, []);

  // Verificar conductores disponibles al abrir la pantalla o cambiar tipo de vehículo
  useEffect(() => {
    if (coords) {
      checkDriverAvailability();
    }
  }, [coords, vehicleType]);

  // Resetear pasajeros cuando se cambia a moto
  useEffect(() => {
    if (vehicleType === 'moto' && passengers > 1) {
      setPassengers(1);
      Alert.alert(
        '🏍️ Moto seleccionada',
        'Las motos solo pueden llevar 1 pasajero. Se ha ajustado automáticamente.',
        [{ text: 'Entendido' }]
      );
    }
  }, [vehicleType]);

  const checkDriverAvailability = async () => {
    if (!coords) return;

    setCheckingDrivers(true);
    try {
      console.log(`🔍 Verificando disponibilidad con tipo: "${vehicleType}"`);
      const result = await driversService.checkAvailableDrivers(coords, 15, vehicleType);
      console.log(`📊 Resultado completo:`, result);
      setDriversAvailable(result.available);
      console.log(`ℹ️ Conductores con vehículo tipo "${vehicleType}" disponibles: ${result.count}`);
    } catch (error) {
      console.error('❌ Error verificando conductores:', error);
      setDriversAvailable(null);
    } finally {
      setCheckingDrivers(false);
    }
  };

  // Obtener dirección del origen al cargar (priorizar ubicación manual)
  useEffect(() => {
    if (coords && user) {
      loadOriginAddress();
    }
  }, [coords, user]);

  const loadOriginAddress = async () => {
    if (!coords || !user) return;
    
    try {
      // Primero, intentar obtener ubicación manual de Firebase
      const { getDatabase, ref, get } = await import('firebase/database');
      const db = getDatabase();
      const clientLocationRef = ref(db, `clientLocations/${user.id}`);
      const snapshot = await get(clientLocationRef);
      
      if (snapshot.exists()) {
        const manualLocation = snapshot.val();
        // Verificar que la ubicación manual es reciente (menos de 1 hora)
        const isRecent = (Date.now() - manualLocation.timestamp) < 3600000; // 1 hora
        
        if (manualLocation.isManual && isRecent) {
          console.log('📍 Usando ubicación manual guardada');
          const manualCoords = {
            latitude: manualLocation.latitude,
            longitude: manualLocation.longitude
          };
          const address = await mapsService.reverseGeocode(manualCoords);
          if (address) {
            setOrigin(address + ' 📍');
            setOriginCoords(manualCoords);
            setUsingManualLocation(true);
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error obteniendo ubicación manual:', error);
    }
    
    // Si no hay ubicación manual o hubo error, usar GPS
    console.log('📡 Usando ubicación GPS');
    const address = await mapsService.reverseGeocode(coords);
    if (address) {
      setOrigin(address);
      setOriginCoords(coords);
      setUsingManualLocation(false);
    }
  };

  // Autocompletar destino con debounce
  useEffect(() => {
    if (isSelectingSuggestionRef.current) {
      return;
    }

    if (!isDestinationFocused) {
      setShowSuggestions(false);
      return;
    }

    if (destinationSelected) {
      setShowSuggestions(false);
      return;
    }

    const trimmedDestination = destination.trim();
    if (trimmedDestination.length <= 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(() => {
      searchPlaces(trimmedDestination);
    }, 300);

    return () => clearTimeout(timer);
  }, [destination, destinationSelected, isDestinationFocused]);

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
    setDestinationSelected(true);
    
    // Obtener coordenadas del lugar
    const placeCoords = await mapsService.getPlaceDetails(place.place_id, place.position);
    if (!placeCoords) {
      Alert.alert('Error', 'No se pudieron obtener las coordenadas del lugar');
      isSelectingSuggestionRef.current = false;
      return;
    }
    
    setDestinationCoords(placeCoords);
    
    // Calcular ruta real con MapBox Routing API
    const startPoint = originCoords || coords;
    if (startPoint) {
      await calculateRealRoute(startPoint, placeCoords);
    }
    
    // Desactivar bandera después de un delay más largo
    setTimeout(() => {
      isSelectingSuggestionRef.current = false;
    }, 500);
  };

  // ✅ NUEVA: Función para calcular routing secuencial con múltiples destinos
  const calculateSequentialRoute = async (
    startPoint: { latitude: number; longitude: number },
    stops: Array<{ latitude: number; longitude: number }>,
    endPoint: { latitude: number; longitude: number }
  ) => {
    try {
      setCalculatingRoute(true);
      console.log('🛣️ Calculando ruta secuencial con', stops.length, 'paradas');
      
      // Construir array de waypoints: origen → paradas → destino
      const waypoints = [startPoint, ...stops, endPoint];
      
      let totalDistance = 0;
      let totalDuration = 0;
      let allPolylines: any[] = [];
      
      // Calcular ruta entre cada par de puntos consecutivos
      for (let i = 0; i < waypoints.length - 1; i++) {
        const from = waypoints[i];
        const to = waypoints[i + 1];
        
        console.log(`📍 Tramo ${i + 1}: (${from.latitude}, ${from.longitude}) → (${to.latitude}, ${to.longitude})`);
        
        const route = await mapsService.getDirections(from, to);
        
        if (route) {
          totalDistance += route.distance;
          totalDuration += route.duration;
          allPolylines = [...allPolylines, ...route.polyline];
          
          console.log(`✅ Tramo ${i + 1}: ${(route.distance / 1000).toFixed(2)} km`);
        } else {
          throw new Error(`No se pudo calcular el tramo ${i + 1}`);
        }
      }
      
      console.log('✅ Ruta secuencial completa:', {
        distanciaTotal: (totalDistance / 1000).toFixed(2) + ' km',
        duracionTotal: (totalDuration / 60).toFixed(0) + ' min',
        tramos: waypoints.length - 1
      });
      
      // Guardar la ruta completa para preview
      setPreviewRoute(allPolylines);
      setRouteCoordinates(allPolylines);
      
      // Calcular estimaciones
      const distanceKm = totalDistance / 1000;
      const durationMin = totalDuration / 60;
      
      setEstimatedDistance(parseFloat(distanceKm.toFixed(2)));
      setEstimatedDuration(parseFloat(durationMin.toFixed(0)));
      
      // Calcular precio usando la nueva fórmula
      const vehicleTypeForCalc = vehicleType === 'moto' ? 'motorcycle' : 'car';
      const rideTypeForCalc = vehicleType === 'designated_driver' ? 'designated_driver' : 'normal';
      
      const breakdown = calculateRidePrice(
        totalDistance, // distancia total en metros
        totalDuration, // duración total en segundos
        vehicleTypeForCalc,
        rideTypeForCalc,
        originCoords?.latitude,
        originCoords?.longitude,
        stops.length // número de paradas extras
      );
      
      setEstimatedPrice(breakdown.finalPrice);
      setPriceBreakdown(breakdown);
      
      console.log('✅ Precio calculado:', {
        finalPrice: breakdown.finalPrice,
        distancePrice: breakdown.distancePrice,
        breakdown: formatPriceBreakdown(breakdown)
      });
    } catch (error) {
      console.error('❌ Error en calculateSequentialRoute:', error);
      Alert.alert('Error', 'No se pudo calcular la ruta. Intenta de nuevo.');
    } finally {
      setCalculatingRoute(false);
    }
  };

  // Función para calcular ruta entre dos puntos
  const calculateRealRoute = async (
    start: { latitude: number; longitude: number },
    end: { latitude: number; longitude: number }
  ) => {
    try {
      setCalculatingRoute(true);
      console.log('🛣️ Calculando ruta desde:', start, 'hasta:', end);
      
      const route = await mapsService.getDirections(start, end);
      
      if (route) {
        console.log('✅ Ruta calculada:', {
          distance: route.distance,
          duration: route.duration,
          points: route.polyline.length
        });
        
        // Guardar la ruta para preview
        setPreviewRoute(route.polyline);
        setRouteCoordinates(route.polyline);
        
        // Calcular estimaciones
        const distanceKm = route.distance / 1000;
        const durationMin = route.duration / 60;
        
        setEstimatedDistance(parseFloat(distanceKm.toFixed(2)));
        setEstimatedDuration(parseFloat(durationMin.toFixed(0)));
        
        // Calcular precio usando la nueva fórmula
        const vehicleTypeForCalc = vehicleType === 'moto' ? 'motorcycle' : 'car';
        const rideTypeForCalc = vehicleType === 'designated_driver' ? 'designated_driver' : 'normal';
        
        const breakdown = calculateRidePrice(
          route.distance, // distancia en metros
          route.duration, // duración en segundos
          vehicleTypeForCalc,
          rideTypeForCalc,
          originCoords?.latitude,
          originCoords?.longitude,
          extraDestinations.length
        );
        
        setEstimatedPrice(breakdown.finalPrice);
        setPriceBreakdown(breakdown);
        
        console.log('✅ Precio calculado:', {
          finalPrice: breakdown.finalPrice,
          distancePrice: breakdown.distancePrice,
          timePrice: breakdown.timePrice,
          isPeakHour: breakdown.isPeakHour,
          breakdown: formatPriceBreakdown(breakdown)
        });
      } else {
        console.error('❌ No se obtuvo ruta del servicio de mapas');
        Alert.alert('Error', 'No se pudo calcular la ruta. Verifica las ubicaciones.');
      }
    } catch (error) {
      console.error('❌ Error en calculateRealRoute:', error);
      Alert.alert('Error', 'No se pudo calcular la ruta. Intenta de nuevo.');
    } finally {
      setCalculatingRoute(false);
    }
  };

  const handleMapPress = async (latitude: number, longitude: number) => {
    setSelectedMapLocation({ latitude, longitude });
    
    // Si estamos seleccionando origen, no calcular ruta aún
    if (selectingType === 'origin') {
      setShowRouteConfirmation(true);
      return;
    }
    
    // ✅ Si estamos seleccionando parada extra, CALCULAR ruta con paradas
    if (selectingType === 'extra') {
      const startPoint = originCoords || coords;
      if (startPoint) {
        // Crear array temporal con la nueva parada
        const tempDests = [...extraDestinations];
        tempDests[currentExtraDestIndex] = {
          address: 'Parada temporal',
          coords: { latitude, longitude }
        };
        
        const stopsCoords = tempDests
          .filter((dest: any) => dest.coords !== null)
          .map((dest: any) => dest.coords as { latitude: number; longitude: number });
        
        if (stopsCoords.length > 0) {
          if (destinationCoords) {
            // Con destino final: Origen → Paradas → Destino Final
            await calculateSequentialRoute(startPoint, stopsCoords, destinationCoords);
          } else {
            // Sin destino final: Origen → Paradas
            if (stopsCoords.length === 1) {
              await calculateRealRoute(startPoint, stopsCoords[0]);
            } else {
              const routeStops = stopsCoords.slice(0, -1);
              const lastStop = stopsCoords[stopsCoords.length - 1];
              await calculateSequentialRoute(startPoint, routeStops, lastStop);
            }
          }
        }
      }
      setShowRouteConfirmation(true);
      return;
    }
    
    // ✅ Si estamos seleccionando destino, calcular ruta secuencial si hay paradas
    const startPoint = originCoords || coords;
    if (startPoint) {
      const stopsCoords = extraDestinations
        .filter((dest: any) => dest.coords !== null)
        .map((dest: any) => dest.coords as { latitude: number; longitude: number });
      
      if (stopsCoords.length > 0) {
        // Con paradas: Origen → Paradas → Destino Final
        await calculateSequentialRoute(startPoint, stopsCoords, { latitude, longitude });
      } else {
        // Sin paradas: Origen → Destino Final
        await calculateRealRoute(startPoint, { latitude, longitude });
      }
      setShowRouteConfirmation(true);
    }
  };

  const confirmRoute = async () => {
    if (!selectedMapLocation) return;
    
    // Obtener dirección del punto seleccionado
    const address = await mapsService.reverseGeocode(selectedMapLocation);
    
    if (selectingType === 'origin') {
      setOrigin(address || 'Ubicación seleccionada');
      setOriginCoords(selectedMapLocation);
    } else if (selectingType === 'extra') {
      // ✅ Actualizar parada extra
      const newDests = [...extraDestinations];
      newDests[currentExtraDestIndex] = {
        address: address || 'Parada seleccionada',
        coords: selectedMapLocation
      };
      setExtraDestinations(newDests);
      
      // ✅ NUEVO: Calcular ruta actualizada con la nueva parada
      // SIEMPRE incluir TODAS las paradas en el routing
      const startPoint = originCoords || coords;
      if (startPoint) {
        const stopsCoords = newDests
          .filter((dest: any) => dest.coords !== null)
          .map((dest: any) => dest.coords as { latitude: number; longitude: number });
        
        if (stopsCoords.length > 0) {
          if (destinationCoords) {
            // Con destino final: Origen → TODAS las Paradas → Destino Final
            await calculateSequentialRoute(startPoint, stopsCoords, destinationCoords);
          } else {
            // Sin destino final: Origen → TODAS las Paradas (la última es el endpoint)
            if (stopsCoords.length === 1) {
              // Solo una parada: Origen → Parada
              await calculateRealRoute(startPoint, stopsCoords[0]);
            } else {
              // Múltiples paradas: Origen → Paradas (todas)
              // Usar la última como endpoint, las demás como waypoints
              const routeStops = stopsCoords.slice(0, -1);
              const lastStop = stopsCoords[stopsCoords.length - 1];
              await calculateSequentialRoute(startPoint, routeStops, lastStop);
            }
          }
        }
      }
    } else {
      // ✅ Destino final
      setDestination(address || 'Destino seleccionado');
      setDestinationSelected(true);
      setDestinationCoords(selectedMapLocation);
      
      // ✅ Calcular ruta secuencial con todas las paradas
      const startPoint = originCoords || coords;
      if (startPoint) {
        const stopsCoords = extraDestinations
          .filter((dest: any) => dest.coords !== null)
          .map((dest: any) => dest.coords as { latitude: number; longitude: number });
        
        // Si hay paradas, usar ruta secuencial; si no, ruta simple
        if (stopsCoords.length > 0) {
          await calculateSequentialRoute(startPoint, stopsCoords, selectedMapLocation);
        } else {
          await calculateRealRoute(startPoint, selectedMapLocation);
        }
      }
    }
    
    // Limpiar sugerencias
    setShowSuggestions(false);
    setSuggestions([]);
    
    // ✅ IMPORTANTE: Solo cerrar modal si es destino final
    // Si es parada extra, mantener modal abierto para agregar más paradas
    if (selectingType !== 'extra') {
      setIsSelectingOnMap(false);
      setShowRouteConfirmation(false);
      setSelectingType(null);
    } else {
      // Para parada extra: mantener modal abierto pero limpiar selección
      setShowRouteConfirmation(false);
      setSelectedMapLocation(null);
      setSelectingType(null);
    }
  };

  const cancelRouteSelection = () => {
    setShowRouteConfirmation(false);
    setPreviewRoute([]);
    setRouteCoordinates([]);
    setSelectedMapLocation(null);
    setEstimatedDistance(0);
    setEstimatedDuration(0);
    setEstimatedPrice(0);
  };
  
  // Manejar cuando se mueve un pin (draggable marker)
  const handleMarkerDragEnd = async (type: 'origin' | 'destination', newLocation: { latitude: number; longitude: number }) => {
    console.log(`📍 Pin de ${type} movido a:`, newLocation);
    setDraggedMarkerType(type);
    setTempLocation({ ...newLocation });
    setShowLocationConfirmation(true);
    
    // Obtener dirección de la nueva ubicación (reverse geocoding)
    setLoadingAddress(true);
    try {
      const address = await mapsService.reverseGeocode(newLocation);
      setTempLocation(prev => prev ? { ...prev, address: address || undefined } : null);
    } catch (error) {
      console.error('❌ Error obteniendo dirección:', error);
      setTempLocation(prev => prev ? { ...prev, address: 'Ubicación seleccionada' } : null);
    } finally {
      setLoadingAddress(false);
    }
  };
  
  // Confirmar nueva ubicación del pin
  const confirmMarkerLocation = async () => {
    if (!tempLocation || !draggedMarkerType) return;
    
    // ✅ Guardar el tipo antes de limpiarlo
    const markerType = draggedMarkerType;
    
    if (markerType === 'origin') {
      setOriginCoords({ latitude: tempLocation.latitude, longitude: tempLocation.longitude });
      setOrigin(tempLocation.address || 'Ubicación seleccionada');
      console.log('✅ Origen actualizado:', tempLocation);
    } else {
      setDestinationCoords({ latitude: tempLocation.latitude, longitude: tempLocation.longitude });
      setDestination(tempLocation.address || 'Ubicación seleccionada');
      console.log('✅ Destino actualizado:', tempLocation);
    }
    
    // Cerrar confirmación
    setShowLocationConfirmation(false);
    setTempLocation(null);
    setDraggedMarkerType(null);
    
    // ✅ Recalcular ruta si tenemos ambos puntos
    if (markerType === 'origin' && destinationCoords) {
      const startPoint = { latitude: tempLocation.latitude, longitude: tempLocation.longitude };
      const stopsCoords = extraDestinations
        .filter((dest: any) => dest.coords !== null)
        .map((dest: any) => dest.coords as { latitude: number; longitude: number });
      
      if (stopsCoords.length > 0) {
        // Con paradas: Origen → Paradas → Destino Final
        await calculateSequentialRoute(startPoint, stopsCoords, destinationCoords);
      } else {
        // Sin paradas: Origen → Destino Final
        await calculateRealRoute(startPoint, destinationCoords);
      }
    } else if (markerType === 'destination' && originCoords) {
      const newDestination = { latitude: tempLocation.latitude, longitude: tempLocation.longitude };
      const stopsCoords = extraDestinations
        .filter((dest: any) => dest.coords !== null)
        .map((dest: any) => dest.coords as { latitude: number; longitude: number });
      
      if (stopsCoords.length > 0) {
        // Con paradas: Origen → Paradas → Nuevo Destino
        await calculateSequentialRoute(originCoords, stopsCoords, newDestination);
      } else {
        // Sin paradas: Origen → Nuevo Destino
        await calculateRealRoute(originCoords, newDestination);
      }
    }
  };
  
  // Cancelar cambio de ubicación del pin
  const cancelMarkerLocation = () => {
    setShowLocationConfirmation(false);
    setTempLocation(null);
    setDraggedMarkerType(null);
  };
  
  // Tomar foto del vehículo (para conductor designado)
  const handleTakeVehiclePhoto = async () => {
    try {
      // Solicitar permisos
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permisos necesarios', 'Necesitamos acceso a tu cámara para tomar la foto del vehículo');
        return;
      }

      Alert.alert(
        'Foto del Vehículo',
        'Selecciona una opción',
        [
          {
            text: '📷 Tomar Foto',
            onPress: async () => {
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
              });

              if (!result.canceled && result.assets[0]) {
                setClientVehiclePhoto(result.assets[0].uri);
              }
            },
          },
          {
            text: '🖼️ Galería',
            onPress: async () => {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
              });

              if (!result.canceled && result.assets[0]) {
                setClientVehiclePhoto(result.assets[0].uri);
              }
            },
          },
          { text: 'Cancelar', style: 'cancel' },
        ]
      );
    } catch (error) {
      console.error('Error al tomar foto:', error);
      Alert.alert('Error', 'No se pudo tomar la foto');
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
      const availabilityCheck = await driversService.checkAvailableDrivers(startPoint, 15, vehicleType);
      
      if (!availabilityCheck.available || availabilityCheck.count === 0) {
        Alert.alert(
          'Sin conductores',
          `No hay conductores con vehículo tipo "${vehicleType === 'moto' ? 'Moto' : vehicleType === 'auto' ? 'Auto' : 'Conductor Designado'}" disponibles en este momento. Por favor, intenta más tarde o selecciona otro tipo de vehículo.`
        );
        setRequestingRide(false);
        return;
      }

      console.log(`✅ ${availabilityCheck.count} conductor(es) con vehículo tipo "${vehicleType}" disponible(s)`);

      // Validar precio sugerido si existe (rango: 30-500)
      let clientSuggestedPrice: number | undefined = undefined;
      if (suggestedPrice && suggestedPrice.trim() !== '') {
        const priceValue = parseFloat(suggestedPrice);
        if (isNaN(priceValue) || priceValue < 30 || priceValue > 500) {
          Alert.alert('Error', 'El precio debe estar entre C$30 y C$500');
          setRequestingRide(false);
          return;
        }
        clientSuggestedPrice = priceValue;
        console.log('💰 Cliente sugiere precio:', clientSuggestedPrice);
      }

      // Solicitar viaje directamente (sin buscar conductores primero)
      console.log('📤 Enviando solicitud con:', {
        estimatedPrice,
        clientSuggestedPrice,
        hasClientSuggestion: !!clientSuggestedPrice
      });
      
      // Construir objeto de solicitud sin campos undefined
      const requestData: any = {
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
        rideType: vehicleType === 'designated_driver' ? 'designated_driver' : 'normal',
        vehicleType: vehicleType || 'auto',
        paymentMethod: paymentMethod || 'cash', // Usar default si no está definido
      };

      // Agregar campos opcionales solo si tienen valor
      if (clientSuggestedPrice) {
        requestData.clientSuggestedPrice = clientSuggestedPrice;
      }

      if (vehicleType === 'designated_driver' && clientVehiclePhoto) {
        requestData.clientVehiclePhoto = clientVehiclePhoto;
      }

      if (passengers && passengers > 0) {
        requestData.passengers = passengers;
      }

      if (extraDestinations && extraDestinations.length > 0) {
        requestData.extraDestinations = extraDestinations.map(dest => ({
          lat: dest.coords?.latitude || 0,
          lng: dest.coords?.longitude || 0,
          address: dest.address,
        }));
      }

      if (vehicleType === 'designated_driver') {
        requestData.notes = '🚗 Conductor Designado';
      }

      const ride = await ridesService.requestRide(requestData);

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

      // Validar precio sugerido si existe
      let clientSuggestedPrice = undefined;
      if (suggestedPrice && suggestedPrice.trim() !== '') {
        const priceValue = parseFloat(suggestedPrice);
        if (priceValue < 50) {
          Alert.alert('Error', 'El precio mínimo sugerido es C$50');
          setRequestingRide(false);
          return;
        }
        clientSuggestedPrice = priceValue;
      }

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
        clientSuggestedPrice: clientSuggestedPrice, // Precio sugerido por el cliente
        rideType: vehicleType === 'designated_driver' ? 'designated_driver' : 'normal',
        vehicleType: vehicleType,
        clientVehiclePhoto: vehicleType === 'designated_driver' ? (clientVehiclePhoto || undefined) : undefined,
        passengers: passengers,
        extraDestinations: extraDestinations.map(dest => ({
          lat: dest.coords?.latitude || 0,
          lng: dest.coords?.longitude || 0,
          address: dest.address,
        })),
        notes: vehicleType === 'designated_driver' ? '🚗 Conductor Designado' : undefined,
        paymentMethod: paymentMethod, // Agregar método de pago
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
      {!destinationCoords && originCoords && (
        <View style={styles.mapContainer}>
          <DynamicMap
            latitude={originCoords.latitude}
            longitude={originCoords.longitude}
            style={styles.map}
            showMarker={true}
            markerPosition={{ latitude: originCoords.latitude, longitude: originCoords.longitude }}
            markerType="origin"
            draggableMarker={true}
            onMarkerDragEnd={(newLocation) => handleMarkerDragEnd('origin', newLocation)}
            onMapPress={(event) => {
              // Al tocar el mapa pequeño, abrir el mapa completo para seleccionar origen
              setSelectingType('origin');
              setIsSelectingOnMap(true);
            }}
          />
          
          {/* Hint para mover el pin */}
          <View style={styles.dragHintCard}>
            <Text style={styles.dragHintText}>💡 Arrastra el pin para ajustar tu ubicación</Text>
          </View>
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
                  ? '🔵 Selecciona tu punto de origen'
                  : '🔴 Toca el mapa para seleccionar destino'}
            </Text>
            <View style={styles.fullMapHeaderButtons}>
              {/* Botón recargar ubicación */}
              {!showRouteConfirmation && (
                <TouchableOpacity 
                  style={styles.reloadLocationButton}
                  onPress={() => {
                    if (coords) {
                      setSelectedMapLocation({
                        latitude: coords.latitude,
                        longitude: coords.longitude
                      });
                      Alert.alert(
                        '📍 Ubicación Actualizada',
                        'El mapa se ha centrado en tu ubicación actual',
                        [{ text: 'OK' }]
                      );
                    }
                  }}
                >
                  <Text style={styles.reloadLocationButtonText}>🔄</Text>
                </TouchableOpacity>
              )}
              
              {/* Botón cerrar */}
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
            showMarker={
              // Mostrar marcador si hay selectedMapLocation O si es origen y hay originCoords
              !!selectedMapLocation || (selectingType === 'origin' && !!originCoords)
            }
            markerPosition={
              selectedMapLocation || 
              (selectingType === 'origin' ? originCoords : undefined) ||
              undefined
            }
            // ✅ CORREGIDO: Usar tipo correcto según lo que se está seleccionando
            markerType={
              selectingType === 'origin' ? 'origin' : 
              selectingType === 'extra' ? 'default' : 
              'destination'
            }
            originMarker={selectingType !== 'origin' && originCoords ? originCoords : undefined}
            clientMarker={selectingType === 'origin' ? coords : undefined}
            // ✅ NUEVO: Pasar marcadores de paradas extras con colores
            extraStopMarkers={
              extraDestinations
                .map((dest, index) => ({
                  latitude: dest.coords?.latitude || 0,
                  longitude: dest.coords?.longitude || 0,
                  index: index + 1,
                  color: ['#FFA500', '#FFD700', '#00CED1', '#FF69B4', '#32CD32'][index % 5] // Colores variados
                }))
                .filter(marker => marker.latitude !== 0 && marker.longitude !== 0)
            }
            routeCoordinates={previewRoute}
            draggableMarker={true}
            onMarkerDragEnd={(newLocation) => {
              const type = selectingType === 'origin' ? 'origin' : 'destination';
              handleMarkerDragEnd(type, newLocation);
            }}
          />
          
          {/* Hint para mover el pin en modal */}
          {!showRouteConfirmation && (
            <View style={styles.dragHintCardModal}>
              <Text style={styles.dragHintText}>
                {selectingType === 'origin' 
                  ? '🔵 Arrastra el pin para elegir dónde te recogen'
                  : '🔴 Arrastra el pin para elegir tu destino'}
              </Text>
              {selectingType === 'origin' && (
                <Text style={styles.dragHintSubtext}>
                  📍 Tu ubicación actual también se muestra en el mapa
                </Text>
              )}
            </View>
          )}

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

        {/* ✅ NUEVO ORDEN: Botón agregar parada ANTES del destino */}
        {/* Botón agregar destino */}
        {extraDestinations.length < 3 && (
          <TouchableOpacity
            style={styles.addDestButton}
            onPress={() => setExtraDestinations([...extraDestinations, {address: '', coords: null}])}
            disabled={searchingDrivers}
          >
            <Text style={styles.addDestButtonText}>➕ Agregar parada adicional</Text>
          </TouchableOpacity>
        )}

        {/* Destinos adicionales */}
        {extraDestinations.map((dest, index) => (
          <View key={index} style={styles.inputContainer}>
            <View style={styles.inputHeader}>
              <Text style={styles.inputLabel}>🟡 Parada {index + 1}</Text>
              <View style={styles.headerButtons}>
                <TouchableOpacity 
                  style={styles.mapSelectButton}
                  onPress={() => {
                    setSelectingType('extra');
                    setIsSelectingOnMap(true);
                    setCurrentExtraDestIndex(index);
                  }}
                  disabled={searchingDrivers}
                >
                  <Text style={styles.mapSelectButtonText}>📍 Seleccionar en mapa</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.removeDestButton}
                  onPress={() => {
                    const newDests = [...extraDestinations];
                    newDests.splice(index, 1);
                    setExtraDestinations(newDests);
                  }}
                >
                  <Text style={styles.removeDestButtonText}>✕ Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Dirección de parada..."
              value={dest.address}
              onChangeText={(text) => {
                const newDests = [...extraDestinations];
                newDests[index].address = text;
                setExtraDestinations(newDests);
              }}
              editable={!searchingDrivers}
            />
          </View>
        ))}

        {/* Destino con Autocompletar - AHORA AL FINAL */}
        <View style={styles.inputContainer}>
          <View style={styles.inputHeader}>
            <Text style={styles.inputLabel}>🔴 Destino Final</Text>
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
          <View style={{ position: 'relative' }}>
            <TextInput
              style={styles.input}
              placeholder="Buscar dirección..."
              value={destination}
              onChangeText={(text) => {
                setDestinationSelected(false);
                setDestinationCoords(null);
                setDestination(text);
              }}
              onFocus={() => {
                setDestinationFocused(true);
                if (suggestions.length > 0 && !destinationSelected) {
                  setShowSuggestions(true);
                }
              }}
              onBlur={() => {
                setDestinationFocused(false);
                // no cerrar aquí para permitir tap en sugerencias; se controlará en overlay
                setTimeout(() => {
                  if (!isDestinationFocused) {
                    setShowSuggestions(false);
                  }
                }, 150);
              }}
              editable={!searchingDrivers}
            />
            {loadingSuggestions && (
              <View style={styles.suggestionsLoader}>
                <SkeletonLoader width={200} height={16} />
                <SkeletonLoader width={150} height={14} style={{ marginTop: 8 }} />
              </View>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <ScrollView keyboardShouldPersistTaps="always">
                  {suggestions.map((suggestion, index) => {
                    const mainText = suggestion.description
                      ?? suggestion?.structured_formatting?.main_text
                      ?? suggestion?.name
                      ?? '';
                    const secondaryText = suggestion.secondary_text
                      ?? suggestion?.structured_formatting?.secondary_text
                      ?? suggestion?.vicinity
                      ?? '';

                    return (
                      <TouchableOpacity
                        key={index}
                        style={styles.suggestionItem}
                        onPress={() => selectSuggestion(suggestion)}
                      >
                        <Text style={styles.suggestionIcon}>📍</Text>
                        <View style={styles.suggestionText}>
                          <Text style={styles.suggestionMain}>{mainText}</Text>
                          {secondaryText ? (
                            <Text style={styles.suggestionSecondary}>{secondaryText}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </View>

        {/* Selector de pasajeros */}
        <View style={styles.passengersContainer}>
          <Text style={styles.passengersLabel}>
            👥 Cantidad de pasajeros {vehicleType === 'moto' && '(Máx. 1 en moto)'}
          </Text>
          <View style={styles.passengersSelector}>
            <TouchableOpacity
              style={[styles.passengerButton, passengers <= 1 && styles.passengerButtonDisabled]}
              onPress={() => setPassengers(Math.max(1, passengers - 1))}
              disabled={passengers <= 1 || searchingDrivers}
            >
              <Text style={styles.passengerButtonText}>−</Text>
            </TouchableOpacity>
            <View style={styles.passengerCount}>
              <Text style={styles.passengerCountText}>{passengers}</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.passengerButton, 
                (passengers >= 6 || (vehicleType === 'moto' && passengers >= 1)) && styles.passengerButtonDisabled
              ]}
              onPress={() => {
                const maxPassengers = vehicleType === 'moto' ? 1 : 6;
                setPassengers(Math.min(maxPassengers, passengers + 1));
              }}
              disabled={passengers >= 6 || (vehicleType === 'moto' && passengers >= 1) || searchingDrivers}
            >
              <Text style={styles.passengerButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selector de método de pago */}
        <View style={styles.paymentContainer}>
          <Text style={styles.paymentTitle}>💳 Método de Pago</Text>
          <View style={styles.paymentButtons}>
            <TouchableOpacity
              style={[
                styles.paymentButton,
                paymentMethod === 'cash' && styles.paymentButtonActive,
              ]}
              onPress={() => setPaymentMethod('cash')}
            >
              <Text style={styles.paymentIcon}>💵</Text>
              <Text style={[
                styles.paymentButtonText,
                paymentMethod === 'cash' && styles.paymentButtonTextActive,
              ]}>Efectivo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.paymentButton,
                paymentMethod === 'card' && styles.paymentButtonActive,
              ]}
              onPress={() => setPaymentMethod('card')}
            >
              <Text style={styles.paymentIcon}>🏦</Text>
              <Text style={[
                styles.paymentButtonText,
                paymentMethod === 'card' && styles.paymentButtonTextActive,
              ]}>Tarjeta</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.paymentNote}>
            💡 Puedes cambiar a bancos locales (BAC, Banpro, etc.) después de confirmar el viaje
          </Text>
        </View>

        {/* Tipo de servicio */}
        <View style={styles.serviceTypeContainer}>
          <View style={styles.vehicleTypeContainer}>
            <Text style={styles.vehicleTypeTitle}>Tipo de Vehículo</Text>
            <View style={styles.vehicleTypeButtons}>
              <TouchableOpacity
                style={[
                  styles.vehicleTypeButton,
                  vehicleType === 'moto' && styles.vehicleTypeButtonActive,
                ]}
                onPress={() => setVehicleType('moto')}
              >
                <Text style={styles.vehicleTypeIcon}>🏍️</Text>
                <Text style={[
                  styles.vehicleTypeButtonText,
                  vehicleType === 'moto' && styles.vehicleTypeButtonTextActive,
                ]}>Moto</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.vehicleTypeButton,
                  vehicleType === 'auto' && styles.vehicleTypeButtonActive,
                ]}
                onPress={() => setVehicleType('auto')}
              >
                <Text style={styles.vehicleTypeIcon}>🚗</Text>
                <Text style={[
                  styles.vehicleTypeButtonText,
                  vehicleType === 'auto' && styles.vehicleTypeButtonTextActive,
                ]}>Auto</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.vehicleTypeButton,
                  vehicleType === 'designated_driver' && styles.vehicleTypeButtonActive,
                ]}
                onPress={() => {
                  Alert.alert(
                    '🚗 Conductor Designado',
                    'Este servicio consta de solicitar 2 conductores:\n\n1️⃣ Uno que maneje tu vehículo\n2️⃣ Otro que lleve el vehículo de los conductores\n\nAsí asegurando que llegues tú, tu gente y tu vehículo, de forma seguro a tus destinos.\n\n⚠️ No disponible para viajes de Motos',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Entendido', onPress: () => setVehicleType('designated_driver') },
                    ]
                  );
                }}
              >
                <Text style={styles.vehicleTypeIcon}>👨‍✈️</Text>
                <Text style={[
                  styles.vehicleTypeButtonText,
                  vehicleType === 'designated_driver' && styles.vehicleTypeButtonTextActive,
                ]}>Conductor{"\n"}Designado</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Foto del vehículo (solo para conductor designado) */}
          {vehicleType === 'designated_driver' && (
            <View style={styles.vehiclePhotoContainer}>
              <Text style={styles.vehiclePhotoTitle}>📸 Foto de tu Vehículo Sedan o 4x4</Text>
              <Text style={styles.vehiclePhotoSubtitle}>
                El conductor necesita ver tu vehículo para identificarlo
              </Text>
              
              {clientVehiclePhoto ? (
                <View style={styles.vehiclePhotoPreview}>
                  <Image
                    source={{ uri: clientVehiclePhoto }}
                    style={styles.vehiclePhotoImage}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.changePhotoButton}
                    onPress={handleTakeVehiclePhoto}
                  >
                    <Text style={styles.changePhotoButtonText}>Cambiar Foto</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.takePhotoButton}
                  onPress={handleTakeVehiclePhoto}
                >
                  <Text style={styles.takePhotoIcon}>📷</Text>
                  <Text style={styles.takePhotoText}>Tomar/Seleccionar Foto</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Sugerir Precio (SIEMPRE VISIBLE) */}
        <View style={styles.priceInputContainer}>
          <Text style={styles.priceInputLabel}>💰 Sugerir mi precio (opcional):</Text>
          <View style={styles.priceInputRow}>
            <Text style={styles.currencySymbol}>C$</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="Mínimo C$50"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={suggestedPrice}
              onChangeText={setSuggestedPrice}
            />
            {suggestedPrice && (
              <TouchableOpacity
                style={styles.clearPriceButton}
                onPress={() => setSuggestedPrice('')}
              >
                <Text style={styles.clearPriceButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {suggestedPrice && parseFloat(suggestedPrice) < 50 && (
            <Text style={styles.priceWarning}>⚠️ El precio mínimo es C$50</Text>
          )}
          {estimatedPrice > 0 && suggestedPrice && parseFloat(suggestedPrice) < estimatedPrice && parseFloat(suggestedPrice) >= 50 && (
            <Text style={styles.priceInfo}>
              💡 Estás ofreciendo C${(estimatedPrice - parseFloat(suggestedPrice)).toFixed(2)} menos que el estimado
            </Text>
          )}
          {estimatedPrice > 0 && suggestedPrice && parseFloat(suggestedPrice) > estimatedPrice && (
            <Text style={styles.priceInfo}>
              💰 Estás ofreciendo C${(parseFloat(suggestedPrice) - estimatedPrice).toFixed(2)} más que el estimado
            </Text>
          )}
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

        {/* Estimación REAL con Desglose Completo */}
        {estimatedPrice > 0 && !calculatingRoute && priceBreakdown && (
          <View style={styles.estimateCard}>
            <View style={styles.estimateHeader}>
              <Text style={styles.estimateTitle}>📊 Estimación de Viaje</Text>
              <View style={styles.vehicleTypeBadge}>
                <Text style={styles.vehicleTypeText}>
                  {getVehicleTypeName(priceBreakdown.vehicleType, priceBreakdown.rideType)}
                </Text>
              </View>
            </View>
            
            {/* Hora Pico Warning */}
            {priceBreakdown.isPeakHour && (
              <View style={styles.peakHourWarning}>
                <Text style={styles.peakHourIcon}>⚠️</Text>
                <View style={styles.peakHourTextContainer}>
                  <Text style={styles.peakHourTitle}>Hora Pico en Managua</Text>
                  <Text style={styles.peakHourText}>
                    Se agregaron {priceBreakdown.peakHourAdjustment} min al tiempo
                  </Text>
                </View>
              </View>
            )}
            
            {/* Desglose de Precio */}
            <View style={styles.priceBreakdownSection}>
              <View style={styles.estimateRow}>
                <Text style={styles.estimateLabel}>📏 Distancia:</Text>
                <Text style={styles.estimateValue}>{priceBreakdown.distanceKm} km</Text>
              </View>
              <View style={styles.estimateRow}>
                <Text style={styles.estimateLabel}>   × C${priceBreakdown.multiplier}/km</Text>
                <Text style={styles.estimateSubvalue}>C${priceBreakdown.distancePrice}</Text>
              </View>
              
              {priceBreakdown.extraStopsCharge > 0 && (
                <>
                  <View style={styles.dividerLine} />
                  <View style={styles.estimateRow}>
                    <Text style={styles.estimateLabel}>🛑 Paradas extras:</Text>
                    <Text style={styles.estimateSubvalue}>C${priceBreakdown.extraStopsCharge}</Text>
                  </View>
                </>
              )}
              
              <View style={styles.dividerLineBold} />
              
              <View style={styles.estimateRow}>
                <Text style={styles.estimateLabelBold}>💰 Total:</Text>
                <Text style={styles.estimatePrice}>C${priceBreakdown.finalPrice}</Text>
              </View>
              
              <View style={styles.commissionInfo}>
                <Text style={styles.commissionText}>
                  ℹ️ Comisión DriveAngel: {(priceBreakdown.commissionRate * 100).toFixed(1)}% (C${priceBreakdown.commission})
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Indicador de verificación automática de conductores */}
        {checkingDrivers && (
          <View style={styles.checkingDriversCard}>
            <ActivityIndicator size="small" color="#000" />
            <Text style={styles.checkingDriversText}>
              🔍 Verificando conductores disponibles...
            </Text>
          </View>
        )}

        {/* Mensaje de disponibilidad de conductores */}
        {driversAvailable === false && !requestingRide && !checkingDrivers && (
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
                  <Text style={styles.driverRating}>⭐ {driver.rating ? Number(driver.rating).toFixed(1) : '5.0'}</Text>
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
      
      {/* Modal de confirmación de ubicación movida */}
      <Modal
        visible={showLocationConfirmation}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelMarkerLocation}
      >
        <View style={styles.confirmLocationOverlay}>
          <View style={styles.confirmLocationCard}>
            <Text style={styles.confirmLocationTitle}>
              📍 {draggedMarkerType === 'origin' ? 'Confirmar Origen' : 'Confirmar Destino'}
            </Text>
            
            {loadingAddress ? (
              <View style={styles.loadingAddressContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingAddressText}>Obteniendo dirección...</Text>
              </View>
            ) : (
              <Text style={styles.confirmLocationAddress}>
                {tempLocation?.address || 'Ubicación seleccionada'}
              </Text>
            )}
            
            <View style={styles.confirmLocationButtons}>
              <TouchableOpacity
                style={styles.confirmLocationCancelButton}
                onPress={cancelMarkerLocation}
              >
                <Text style={styles.confirmLocationCancelText}>❌ Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.confirmLocationConfirmButton}
                onPress={confirmMarkerLocation}
                disabled={loadingAddress}
              >
                <Text style={styles.confirmLocationConfirmText}>✅ Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  estimateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  vehicleTypeBadge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  vehicleTypeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  peakHourWarning: {
    flexDirection: 'row',
    backgroundColor: '#FF9800' + '20',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  peakHourIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  peakHourTextContainer: {
    flex: 1,
  },
  peakHourTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF9800',
    marginBottom: 2,
  },
  peakHourText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  priceBreakdownSection: {
    marginTop: 8,
  },
  estimateSubvalue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dividerLine: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  dividerLineBold: {
    height: 2,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  estimateLabelBold: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  commissionInfo: {
    marginTop: 8,
    padding: 8,
    backgroundColor: colors.background,
    borderRadius: 6,
  },
  commissionText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
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
    top: 14,
    zIndex: 20,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: colors.card,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 6,
    maxHeight: 220,
    overflow: 'hidden',
    zIndex: 15,
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
  vehicleTypeContainer: {
    marginBottom: 0,
  },
  vehicleTypeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  vehicleTypeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  vehicleTypeButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  vehicleTypeButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  vehicleTypeIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  vehicleTypeButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  vehicleTypeButtonTextActive: {
    color: '#fff',
  },
  vehiclePhotoContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vehiclePhotoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  vehiclePhotoSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  vehiclePhotoPreview: {
    alignItems: 'center',
  },
  vehiclePhotoImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  changePhotoButton: {
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  changePhotoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  takePhotoButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  takePhotoIcon: {
    fontSize: 24,
  },
  takePhotoText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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
    fontSize: 12,
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
  fullMapHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reloadLocationButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(76, 175, 80, 0.9)', // Verde
    justifyContent: 'center',
    alignItems: 'center',
  },
  reloadLocationButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
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
  // Estilos para destinos adicionales
  addDestButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addDestButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  mapSelectButton: {
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  mapSelectButtonText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  removeDestButton: {
    backgroundColor: '#ff4444',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  removeDestButtonText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  // Estilos para selector de pasajeros
  passengersContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passengersLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  passengersSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  passengerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passengerButtonDisabled: {
    backgroundColor: colors.border,
    opacity: 0.5,
  },
  passengerButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  passengerCount: {
    minWidth: 60,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  passengerCountText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  checkingDriversCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  checkingDriversText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#1976D2',
    fontWeight: '600',
  },
  suggestPriceButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF9800',
    alignItems: 'center',
  },
  suggestPriceButtonText: {
    fontSize: 14,
    color: '#F57C00',
    fontWeight: '600',
  },
  priceInputContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  priceInputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
  },
  currencySymbol: {
    fontSize: 16,
    color: '#333',
    fontWeight: '700',
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  clearPriceButton: {
    padding: 4,
  },
  clearPriceButtonText: {
    fontSize: 18,
    color: '#999',
    fontWeight: '700',
  },
  priceWarning: {
    marginTop: 8,
    fontSize: 12,
    color: '#F44336',
  },
  priceInfo: {
    marginTop: 8,
    fontSize: 12,
    color: '#4CAF50',
  },
  // Estilos para selector de método de pago
  paymentContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  paymentButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  paymentButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  paymentIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  paymentButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  paymentButtonTextActive: {
    color: '#fff',
  },
  paymentNote: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // Estilos para hint de pin draggable
  dragHintCard: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(76, 175, 80, 0.95)',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  dragHintCardModal: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(76, 175, 80, 0.95)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dragHintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  dragHintSubtext: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '400',
    marginTop: 4,
    opacity: 0.9,
  },
  // Estilos para modal de confirmación de ubicación
  confirmLocationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmLocationCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 350,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  confirmLocationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  confirmLocationAddress: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingAddressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loadingAddressText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 10,
  },
  confirmLocationButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmLocationCancelButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmLocationCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  confirmLocationConfirmButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  confirmLocationConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
