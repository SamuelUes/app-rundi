import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import DynamicMap from '../../components/DynamicMap';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { useRouteTracking } from '../../hooks/useRouteTracking';
import ETADisplay from '../../components/ETADisplay';
import ridesService from '../../services/ridesService';
import mapsService from '../../services/mapsService';

export default function ActiveRideScreen({ route, navigation }: any) {
  const { rideId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { coords } = useLocation();
  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [rideStartTime, setRideStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Hook de tracking automático
  const { isTracking, totalPoints } = useRouteTracking({
    rideId,
    isActive: ride?.status === 'in_progress',
    interval: 5000, // Guardar cada 5 segundos
  });

  useEffect(() => {
    loadRideDetails();
    
    // Polling cada 5 segundos
    const interval = setInterval(loadRideDetails, 5000);
    return () => clearInterval(interval);
  }, [rideId]);

  // Timer del viaje
  useEffect(() => {
    if (!rideStartTime) return;

    const timer = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - rideStartTime.getTime()) / 1000);
      setElapsedTime(diff);
    }, 1000);

    return () => clearInterval(timer);
  }, [rideStartTime]);

  const loadRideDetails = async () => {
    try {
      const rideData = await ridesService.getRideDetails(rideId);
      setRide(rideData);
      
      // Si el viaje fue cancelado o completado, volver atrás
      if (rideData.status === 'canceled' || rideData.status === 'completed') {
        Alert.alert(
          'Viaje Finalizado',
          `El viaje ha sido ${rideData.status === 'canceled' ? 'cancelado' : 'completado'}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (error) {
      console.error('Error loading ride:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartRide = async () => {
    try {
      setUpdating(true);
      await ridesService.updateRideStatus(rideId, 'in_progress');
      setRideStartTime(new Date());
      Alert.alert('¡Viaje Iniciado!', 'El viaje ha comenzado');
      loadRideDetails();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'No se pudo iniciar el viaje');
    } finally {
      setUpdating(false);
    }
  };

  const handleCompleteRide = async () => {
    Alert.alert(
      'Completar Viaje',
      '¿Has llegado al destino?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, completar',
          onPress: async () => {
            try {
              setUpdating(true);
              await ridesService.updateRideStatus(rideId, 'completed');
              Alert.alert(
                '¡Viaje Completado!',
                'El cliente realizará el pago ahora',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'No se pudo completar el viaje');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelRide = () => {
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
              setUpdating(true);
              await ridesService.cancelRide(rideId, 'Cancelado por el conductor');
              Alert.alert(
                'Viaje Cancelado',
                'El viaje ha sido cancelado',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'No se pudo cancelar el viaje');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenChat = () => {
    navigation.navigate('Chat', {
      rideId,
      otherUserName: ride?.client?.name || 'Cliente',
    });
  };

  const handleCallClient = () => {
    if (!ride?.client?.phone) {
      Alert.alert('Error', 'No hay número de teléfono disponible');
      return;
    }

    const phoneUrl = `tel:${ride.client.phone}`;
    Linking.canOpenURL(phoneUrl)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(phoneUrl);
        } else {
          Alert.alert('Error', 'No se puede realizar la llamada');
        }
      })
      .catch((err) => console.error('Error al llamar:', err));
  };

  const handleNavigate = () => {
    if (!ride?.destination) {
      Alert.alert('Error', 'No hay destino disponible');
      return;
    }

    const { lat, lng } = ride.destination;
    const label = encodeURIComponent(ride.destinationAddress || 'Destino');

    Alert.alert(
      'Navegar',
      '¿Cómo quieres navegar?',
      [
        {
          text: 'Google Maps',
          onPress: () => {
            const url = Platform.select({
              ios: `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`,
              android: `google.navigation:q=${lat},${lng}&mode=d`,
            });
            Linking.openURL(url || `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
          },
        },
        {
          text: 'Waze',
          onPress: () => {
            const url = `waze://?ll=${lat},${lng}&navigate=yes`;
            Linking.canOpenURL(url).then((supported) => {
              if (supported) {
                Linking.openURL(url);
              } else {
                Linking.openURL(`https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`);
              }
            });
          },
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading || !ride) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>Cargando detalles...</Text>
      </View>
    );
  }

  const isAccepted = ride.status === 'accepted';
  const isInProgress = ride.status === 'in_progress';

  return (
    <View style={styles.container}>
      {/* Mapa */}
      {coords && ride && (
        <View style={styles.mapContainer}>
          <DynamicMap
            latitude={coords.latitude}
            longitude={coords.longitude}
            style={styles.map}
            showMarker={true}
            markerPosition={coords}
            markerType="car"
            originMarker={ride.origin ? { latitude: ride.origin.lat, longitude: ride.origin.lng } : undefined}
            routeCoordinates={ride.destination ? [
              { latitude: coords.latitude, longitude: coords.longitude },
              { latitude: ride.destination.lat, longitude: ride.destination.lng }
            ] : undefined}
          />
        </View>
      )}

      <ScrollView style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Viaje Activo</Text>
            {isInProgress && rideStartTime && (
              <Text style={styles.timerText}>
                ⏱️ Tiempo: {formatTime(elapsedTime)}
              </Text>
            )}
          </View>
          <View style={[styles.statusBadge, isInProgress ? styles.statusInProgress : styles.statusAccepted]}>
            <Text style={styles.statusText}>
              {isInProgress ? 'En Progreso' : 'Aceptado'}
            </Text>
          </View>
        </View>

      {/* Detalles del viaje */}
      <View style={styles.detailsContainer}>
        <View style={styles.locationContainer}>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔵</Text>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Origen</Text>
              <Text style={styles.locationAddress}>{ride.originAddress}</Text>
            </View>
          </View>

          <View style={styles.locationDivider} />

          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔴</Text>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Destino</Text>
              <Text style={styles.locationAddress}>{ride.destinationAddress}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Distancia</Text>
            <Text style={styles.infoValue}>{(ride.estimatedDistance / 1000).toFixed(1)} km</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Precio</Text>
            <Text style={styles.infoValue}>C${ride.estimatedFare}</Text>
          </View>
        </View>

        {/* Info del cliente */}
        {ride.client && (
          <View style={styles.clientInfo}>
            <Text style={styles.clientLabel}>Cliente:</Text>
            <Text style={styles.clientName}>{ride.client.name}</Text>
          </View>
        )}

        {/* ETA Display - Solo cuando el viaje está en progreso */}
        {isInProgress && coords && (
          <ETADisplay
            rideId={rideId}
            currentLat={coords.latitude}
            currentLng={coords.longitude}
            updateInterval={30000}
          />
        )}

        {/* Tracking Status */}
        {isInProgress && (
          <View style={styles.trackingInfo}>
            <Text style={styles.trackingText}>
              {isTracking ? '🟢' : '⚪'} Tracking: {isTracking ? 'Activo' : 'Inactivo'}
            </Text>
            <Text style={styles.trackingPoints}>
              📍 {totalPoints} puntos guardados
            </Text>
          </View>
        )}

        {/* Advertencia de auto-cancelación */}
        {isAccepted && (
          <View style={styles.warningBox}>
            <Text style={styles.warningIcon}>⏰</Text>
            <Text style={styles.warningText}>
              Debes iniciar el viaje en los próximos 10 minutos o se cancelará automáticamente
            </Text>
          </View>
        )}
      </View>

      {/* Botones de acción */}
      <View style={styles.actionsContainer}>
        {/* Botones de llamada y navegación */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={handleCallClient}
          >
            <Text style={styles.quickActionIcon}>📞</Text>
            <Text style={styles.quickActionText}>Llamar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={handleNavigate}
          >
            <Text style={styles.quickActionIcon}>🧭</Text>
            <Text style={styles.quickActionText}>Navegar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={handleOpenChat}
          >
            <Text style={styles.quickActionIcon}>💬</Text>
            <Text style={styles.quickActionText}>Chat</Text>
          </TouchableOpacity>
        </View>
        {isAccepted && (
          <TouchableOpacity
            style={[styles.primaryButton, updating && styles.buttonDisabled]}
            onPress={handleStartRide}
            disabled={updating}
          >
            <Text style={styles.primaryButtonText}>
              {updating ? 'Iniciando...' : '🚗 Iniciar Viaje'}
            </Text>
          </TouchableOpacity>
        )}

        {isInProgress && (
          <TouchableOpacity
            style={[styles.primaryButton, updating && styles.buttonDisabled]}
            onPress={handleCompleteRide}
            disabled={updating}
          >
            <Text style={styles.primaryButtonText}>
              {updating ? 'Completando...' : '✅ Completar Viaje'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.cancelButton, updating && styles.buttonDisabled]}
          onPress={handleCancelRide}
          disabled={updating}
        >
          <Text style={styles.cancelButtonText}>Cancelar Viaje</Text>
        </TouchableOpacity>

        {/* Info de pago */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            💳 El cliente realizará el pago al finalizar el viaje
          </Text>
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
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
  header: {
    backgroundColor: colors.card,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusAccepted: {
    backgroundColor: '#FFA726',
  },
  statusInProgress: {
    backgroundColor: '#2196F3',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  detailsContainer: {
    backgroundColor: colors.card,
    margin: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationContainer: {
    marginBottom: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  locationDivider: {
    height: 20,
    width: 2,
    backgroundColor: '#e0e0e0',
    marginLeft: 10,
    marginVertical: 8,
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
    marginBottom: 12,
  },
  infoCard: {
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  clientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  clientLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: 8,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#E65100',
    lineHeight: 18,
  },
  trackingInfo: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackingText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  trackingPoints: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  actionsContainer: {
    padding: 16,
  },
  primaryButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  chatButton: {
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  chatButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
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
  buttonDisabled: {
    opacity: 0.5,
  },
  footer: {
    backgroundColor: '#E3F2FD',
    padding: 12,
    alignItems: 'center',
    marginTop: 16,
    borderRadius: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '600',
  },
  // Nuevos estilos
  mapContainer: {
    height: 250,
  },
  map: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  timerText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '600',
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
});
