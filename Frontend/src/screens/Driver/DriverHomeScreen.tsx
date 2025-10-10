import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Switch, ScrollView, Alert } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import DynamicMap from '../../components/DynamicMap';
import { useLocation } from '../../hooks/useLocation';
import { formatNicaraguaTime } from '../../utils/dateUtils';
import { useAuth } from '../../context/AuthContext';
import mapsService from '../../services/mapsService';
import ridesService from '../../services/ridesService';
import driversService from '../../services/driversService';

export default function DriverHomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { coords, loading: locationLoading, error, refreshLocation } = useLocation();
  
  const [isAvailable, setIsAvailable] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [rideRequests, setRideRequests] = useState<any[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [todayStats, setTodayStats] = useState({ trips: 0, earnings: 0 });

  // Consultar proveedor de mapas al backend
  useEffect(() => {
    mapsService.fetchProviderFromBackend();
  }, []);

  // Manejar cambio de disponibilidad
  const handleAvailabilityChange = async (newValue: boolean) => {
    if (!user) {
      Alert.alert('Error', 'Debes iniciar sesión para cambiar tu estado');
      return;
    }

    if (!coords) {
      Alert.alert('Error', 'No se pudo obtener tu ubicación');
      return;
    }

    setUpdatingStatus(true);
    try {
      const status = newValue ? 'available' : 'offline';
      await driversService.updateStatus(status, coords);
      setIsAvailable(newValue);
      setLastUpdate(new Date());
      console.log(`✅ Estado actualizado: ${status}`);
      
      // Feedback visual
      if (newValue) {
        Alert.alert('✅ Disponible', 'Ahora estás visible para los pasajeros');
      }
    } catch (error: any) {
      console.error('❌ Error actualizando estado:', error.message);
      Alert.alert(
        'Error', 
        error.message || 'No se pudo actualizar tu estado. Por favor, intenta de nuevo.'
      );
    } finally {
      setUpdatingStatus(false);
    }
  };
  // Obtener dirección actual
  useEffect(() => {
    if (!coords) return;

    const fetchAddress = async () => {
      const address = await mapsService.reverseGeocode(coords);
      if (address) {
        setCurrentAddress(address);
      }
    };

    fetchAddress();
  }, [coords]);

  // Obtener solicitudes de viaje disponibles
  useEffect(() => {
    if (!coords || !isAvailable) {
      setRideRequests([]);
      return;
    }

    let isMounted = true;

    const fetchRideRequests = async () => {
      try {
        const rides = await ridesService.getAvailableRides(
          coords.latitude,
          coords.longitude,
          10 // 10 km de radio
        );
        if (isMounted) {
          if (rides && rides.length > 0) {
            console.log('✅ Viajes disponibles:', rides.length);
            setRideRequests(rides);
          } else {
            setRideRequests([]);
          }
          setLastUpdate(new Date());
        }
      } catch (error: any) {
        if (isMounted) {
          // Silenciar completamente error 404 (no hay viajes disponibles)
          if (error.response?.status !== 404) {
            console.error('❌ Error buscando viajes:', error.message);
          }
          setRideRequests([]);
        }
      }
    };

    fetchRideRequests();
    const interval = setInterval(fetchRideRequests, 30000); // Cada 30 segundos (reducido de 10s)

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [coords, isAvailable]);

  if (locationLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>Obteniendo ubicación...</Text>
      </View>
    );
  }

  if (error || !coords) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>❌ {error || 'No se pudo obtener la ubicación'}</Text>
        <TouchableOpacity onPress={refreshLocation} style={styles.retryButton}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header flotante con menú */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Conductor</Text>
          {/* Botón de Emergencia */}
          <TouchableOpacity 
            style={styles.emergencyButton}
            onPress={() => Alert.alert('SOS', '¿Necesitas ayuda de emergencia?', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Llamar 911', onPress: () => console.log('Llamando 911') }
            ])}
          >
            <Text style={styles.emergencyButtonText}>🆘 SOS</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Botones de navegación debajo del header */}
      <View style={styles.navButtonsContainer}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Profile')}
        >
          <Text style={styles.navButtonIcon}>👤</Text>
          <Text style={styles.navButtonText}>Perfil</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Earnings')}
        >
          <Text style={styles.navButtonIcon}>💰</Text>
          <Text style={styles.navButtonText}>Ganancias</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('RideHistory')}
        >
          <Text style={styles.navButtonIcon}>📋</Text>
          <Text style={styles.navButtonText}>Historial</Text>
        </TouchableOpacity>
      </View>

      {/* Mapa */}
      <DynamicMap
        latitude={coords.latitude}
        longitude={coords.longitude}
        style={styles.map}
        showMarker={true}
        markerPosition={{ latitude: coords.latitude, longitude: coords.longitude }}
        markerType="car"
      />

      {/* Panel de información */}
      <View style={styles.infoPanel}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Estado de disponibilidad */}
          <View style={styles.availabilityCard}>
            <View style={styles.availabilityHeader}>
              <View>
                <Text style={styles.availabilityTitle}>
                  {isAvailable ? '🟢 Disponible' : '⚪ No disponible'}
                </Text>
                {updatingStatus && (
                  <Text style={styles.updatingText}>Actualizando...</Text>
                )}
              </View>
              <Switch
                value={isAvailable}
                onValueChange={handleAvailabilityChange}
                trackColor={{ false: '#ccc', true: '#4CAF50' }}
                thumbColor={isAvailable ? '#fff' : '#f4f3f4'}
                disabled={updatingStatus}
              />
            </View>
            {isAvailable && (
              <View>
                <Text style={styles.availabilitySubtext}>
                  Estás visible para los pasajeros
                </Text>
                <Text style={styles.lastUpdateText}>
                  Última actualización: {formatNicaraguaTime(lastUpdate)}
                </Text>
              </View>
            )}
          </View>

          {/* Estadísticas del día */}
          <View style={styles.statsCard}>
            <Text style={styles.cardTitle}>📊 Hoy</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{todayStats.trips}</Text>
                <Text style={styles.statLabel}>Viajes</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>C${todayStats.earnings}</Text>
                <Text style={styles.statLabel}>Ganancias</Text>
              </View>
            </View>
          </View>

          {/* Dirección actual */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📍 Tu ubicación actual</Text>
            <Text style={styles.addressText}>{currentAddress || 'Obteniendo dirección...'}</Text>
          </View>

          {/* Estado del conductor */}
          {isAvailable && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🚗 Estado</Text>
              <Text style={styles.statusText}>
                Estás visible para los pasajeros cercanos
              </Text>
              {rideRequests.length > 0 && (
                <Text style={styles.requestsText}>
                  {rideRequests.length} solicitud{rideRequests.length > 1 ? 'es' : ''} disponible{rideRequests.length > 1 ? 's' : ''}
                </Text>
              )}
            </View>
          )}

          {/* Solicitudes de viaje */}
          {isAvailable && rideRequests.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🚕 Viajes Disponibles</Text>
              {rideRequests.map((request, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.requestCard}
                  onPress={() => navigation.navigate('AvailableRides')}
                >
                  <Text style={styles.requestText}>
                    {request.origin?.address || 'Origen'} → {request.destination?.address || 'Destino'}
                  </Text>
                  <Text style={styles.requestPrice}>C${request.estimatedPrice || 0}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={() => navigation.navigate('AvailableRides')}
              >
                <Text style={styles.viewAllText}>Ver todos los viajes</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: colors.card,
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 20,
  },
  navButtonsContainer: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    zIndex: 9,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navButton: {
    alignItems: 'center',
    padding: 8,
  },
  navButtonIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  navButtonText: {
    fontSize: 11,
    color: colors.text,
    fontWeight: '600',
  },
  map: {
    height: '40%',
  },
  infoPanel: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.card,
  },
  errorText: {
    fontSize: 16,
    color: '#ff4444',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  availabilityCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  availabilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  availabilityTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  availabilitySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  updatingText: {
    fontSize: 12,
    color: '#2196F3',
    marginTop: 4,
  },
  lastUpdateText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  statsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  addressText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  statusText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  requestsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  requestText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  requestPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  viewAllButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  viewAllText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emergencyButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  emergencyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
