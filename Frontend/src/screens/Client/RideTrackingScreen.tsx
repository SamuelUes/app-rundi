import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import DynamicMap from '../../components/DynamicMap';
import ETADisplay from '../../components/ETADisplay';
import firebaseTrackingService from '../../services/firebaseTrackingService';
import { useLocation } from '../../hooks/useLocation';
import backendConfig from '../../config/backendConfig';
import { formatNicaraguaTime } from '../../utils/dateUtils';

interface DriverLocation {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  timestamp: string;
}

export default function RideTrackingScreen({ route, navigation }: any) {
  const { rideId, driverId, driverName, vehiclePlate, estimatedFare } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { coords: clientCoords } = useLocation();

  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [rideStatus, setRideStatus] = useState('in_progress');
  const [statusMessage, setStatusMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isDeviated, setIsDeviated] = useState(false);
  const [deviationDistance, setDeviationDistance] = useState(0);

  useEffect(() => {
    // Suscribirse a la ubicación del conductor usando Firebase RTDB
    console.log('🎯 Iniciando tracking para viaje:', rideId);
    
    const unsubscribeLocation = firebaseTrackingService.subscribeToDriverLocation(
      driverId,
      (location) => {
        if (location) {
          console.log('📍 Nueva ubicación del conductor:', location);
          setDriverLocation({
            latitude: location.latitude,
            longitude: location.longitude,
            speed: location.speed,
            heading: location.heading,
            timestamp: new Date(location.timestamp).toISOString(),
          });
          setIsConnected(true);
        }
      }
    );

    // Suscribirse al estado del viaje
    const unsubscribeRide = firebaseTrackingService.subscribeToRideTracking(
      rideId,
      (tracking) => {
        if (tracking) {
          console.log('📢 Estado del viaje:', tracking.status);
          setRideStatus(tracking.status);

          if (tracking.status === 'completed') {
            // Navegar a pantalla de pago
            Alert.alert(
              'Viaje Completado',
              '¡Has llegado a tu destino! Procede con el pago.',
              [
                {
                  text: 'Pagar Ahora',
                  onPress: () => navigation.replace('Payment', { 
                    rideId,
                    amount: estimatedFare || 0,
                  }),
                },
              ]
            );
          }
        }
      }
    );

    // Cleanup
    return () => {
      console.log('🛑 Deteniendo tracking');
      unsubscribeLocation();
      unsubscribeRide();
    };
  }, [rideId, driverId]);

  // TODO: Verificar desvío de ruta cada 10 segundos
  // Comentado temporalmente hasta implementar Firebase Function
  /*
  useEffect(() => {
    if (!driverLocation) return;

    const checkDeviation = async () => {
      try {
        const backendUrl = backendConfig.getApiUrl();
        const response = await fetch(
          `${backendUrl}/tracking/deviation/${rideId}?lat=${driverLocation.latitude}&lng=${driverLocation.longitude}`
        );
        
        if (!response.ok) {
          // Endpoint no existe aún, silenciar error
          return;
        }
        
        const data = await response.json();

        if (data.success) {
          setIsDeviated(data.data.isDeviated);
          setDeviationDistance(data.data.deviationDistance);

          // Alerta si hay desvío
          if (data.data.isDeviated && !isDeviated) {
            Alert.alert(
              '⚠️ Desvío de Ruta',
              `El conductor se ha desviado ${data.data.deviationDistance}m de la ruta esperada.`,
              [
                { text: 'OK' },
                {
                  text: 'Contactar',
                  onPress: () => navigation.navigate('Chat', { rideId, driverId }),
                },
              ]
            );
          }
        }
      } catch (error) {
        // Silenciar error si el endpoint no existe
        // console.error('Error verificando desvío:', error);
      }
    };

    checkDeviation();
    const interval = setInterval(checkDeviation, 10000); // Cada 10s

    return () => clearInterval(interval);
  }, [driverLocation, rideId, isDeviated]);
  */

  const shareTrackingLink = async () => {
    try {
      const trackingUrl = `https://driveangel.ni/track/${rideId}`;
      
      await Share.share({
        message: `🚗 Estoy en un viaje con DriveAngel.ni\n\nRastreame en tiempo real:\n${trackingUrl}\n\nConductor: ${driverName}\nPlaca: ${vehiclePlate}`,
        url: trackingUrl,
        title: 'Compartir ubicación del viaje',
      });
    } catch (error) {
      console.error('Error compartiendo:', error);
    }
  };

  const cancelRide = () => {
    Alert.alert(
      'Cancelar Viaje',
      '¿Estás seguro que deseas cancelar este viaje?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              // Actualizar estado en Firebase RTDB
              await firebaseTrackingService.updateRideTracking(rideId, {
                status: 'cancelled',
              });
              navigation.goBack();
            } catch (error) {
              console.error('Error cancelando viaje:', error);
              Alert.alert('Error', 'No se pudo cancelar el viaje');
            }
          },
        },
      ]
    );
  };

  const getStatusText = () => {
    switch (rideStatus) {
      case 'accepted':
        return 'Conductor en camino';
      case 'arrived':
        return 'Conductor ha llegado';
      case 'in_progress':
        return 'Viaje en progreso';
      case 'completed':
        return 'Viaje completado';
      case 'canceled':
        return 'Viaje cancelado';
      default:
        return 'Conectando...';
    }
  };

  const getStatusColor = () => {
    switch (rideStatus) {
      case 'accepted':
        return '#FFA500';
      case 'arrived':
        return '#4CAF50';
      case 'in_progress':
        return '#2196F3';
      case 'completed':
        return '#4CAF50';
      case 'canceled':
        return '#F44336';
      default:
        return '#999';
    }
  };

  return (
    <View style={styles.container}>
      {/* Mapa con ubicación del conductor */}
      <View style={styles.mapContainer}>
        <DynamicMap
          latitude={driverLocation?.latitude || clientCoords?.latitude || 12.1364}
          longitude={driverLocation?.longitude || clientCoords?.longitude || -86.2514}
          style={styles.map}
          showMarker={!!driverLocation}
          markerPosition={driverLocation || undefined}
          markerType="car"
        />

        {/* Indicador de conexión */}
        <View style={[styles.connectionBadge, { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }]}>
          <Text style={styles.connectionText}>
            {isConnected ? '● En vivo' : '● Desconectado'}
          </Text>
        </View>
      </View>

      {/* Información del viaje */}
      <View style={styles.infoContainer}>
        {/* Estado */}
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>

        {statusMessage ? (
          <Text style={styles.statusMessage}>{statusMessage}</Text>
        ) : null}

        {/* Información del conductor */}
        <View style={styles.driverInfo}>
          <View style={styles.driverAvatar}>
            <Text style={styles.driverAvatarText}>{driverName?.charAt(0) || 'C'}</Text>
          </View>
          <View style={styles.driverDetails}>
            <Text style={styles.driverName}>{driverName || 'Conductor'}</Text>
            <Text style={styles.vehiclePlate}>🚗 {vehiclePlate || 'N/A'}</Text>
          </View>
        </View>

        {/* ETA Display - Solo cuando viaje está en progreso */}
        {rideStatus === 'in_progress' && driverLocation && (
          <ETADisplay
            rideId={rideId}
            currentLat={driverLocation.latitude}
            currentLng={driverLocation.longitude}
            updateInterval={30000}
          />
        )}

        {/* Alerta de desvío */}
        {isDeviated && (
          <View style={styles.deviationAlert}>
            <Text style={styles.deviationIcon}>⚠️</Text>
            <Text style={styles.deviationText}>
              Desvío detectado: {deviationDistance}m de la ruta
            </Text>
          </View>
        )}

        {/* Última actualización */}
        {driverLocation && (
          <View style={styles.lastUpdate}>
            <Text style={styles.lastUpdateText}>
              Última actualización: {formatNicaraguaTime(driverLocation.timestamp)}
            </Text>
            {driverLocation.speed !== undefined && (
              <Text style={styles.speedText}>
                Velocidad: {Math.round(driverLocation.speed)} km/h
              </Text>
            )}
          </View>
        )}

        {/* Botones */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={shareTrackingLink}
          >
            <Text style={styles.shareButtonText}>🔗 Compartir Ubicación</Text>
          </TouchableOpacity>

          {rideStatus !== 'completed' && rideStatus !== 'canceled' && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={cancelRide}
            >
              <Text style={styles.cancelButtonText}>Cancelar Viaje</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Botón flotante de chat - Solo disponible cuando el viaje es aceptado */}
      {(rideStatus === 'accepted' || rideStatus === 'driver_arrived' || rideStatus === 'in_progress') && (
        <TouchableOpacity
          style={styles.chatButton}
          onPress={() => navigation.navigate('Chat', { 
            rideId, 
            otherUserName: driverName 
          })}
        >
          <Text style={styles.chatButtonIcon}>💬</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  connectionBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  connectionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  infoContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  statusMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  driverAvatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  vehiclePlate: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  deviationAlert: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
    alignItems: 'center',
  },
  deviationIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  deviationText: {
    flex: 1,
    fontSize: 13,
    color: '#E65100',
    fontWeight: '600',
  },
  lastUpdate: {
    marginBottom: 16,
  },
  lastUpdateText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  speedText: {
    fontSize: 12,
    color: '#999',
  },
  buttonsContainer: {
    gap: 12,
  },
  shareButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  cancelButton: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ff4444',
  },
  chatButton: {
    position: 'absolute',
    bottom: 32,
    right: 16,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  chatButtonIcon: {
    fontSize: 28,
  },
});
