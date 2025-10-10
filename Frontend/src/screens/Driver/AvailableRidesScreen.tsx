import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import MapView, { Marker, Callout } from 'react-native-maps';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from '../../hooks/useLocation';
import { useRideNotifications } from '../../hooks/useRideNotifications';
import { useNotifications } from '../../hooks/useNotifications';
import FilterModal, { Filters } from '../../components/FilterModal';
import ridesService from '../../services/ridesService';
import mapsService from '../../services/mapsService';

interface AvailableRide {
  id: string;
  originAddress: string;
  destinationAddress: string;
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedFare: number;
  rideType: string;
  createdAt: string;
  client: {
    name: string;
    phone: string;
  };
}

export default function AvailableRidesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { coords } = useLocation();
  const { connected, newRidesCount } = useRideNotifications(user?.id);
  const { notifyNewRide, setBadgeCount } = useNotifications();
  const [rides, setRides] = useState<AvailableRide[]>([]);
  const [filteredRides, setFilteredRides] = useState<AvailableRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedRide, setSelectedRide] = useState<AvailableRide | null>(null);
  const [filters, setFilters] = useState<Filters>({
    minDistance: 0,
    maxDistance: 100,
    minPrice: 0,
    maxPrice: 1000,
    rideType: 'all',
  });
  const previousRidesCount = useRef(0);

  useEffect(() => {
    loadAvailableRides();
    
    // Auto-refresh cada 30 segundos (reducido para menos carga)
    const interval = setInterval(loadAvailableRides, 30000);
    return () => clearInterval(interval);
  }, [coords]);

  // Aplicar filtros cuando cambien los viajes o los filtros
  useEffect(() => {
    applyFilters();
  }, [rides, filters]);

  const loadAvailableRides = async () => {
    try {
      if (!coords) {
        console.log('⚠️ No hay coordenadas disponibles');
        setRides([]);
        return;
      }

      const availableRides = await ridesService.getAvailableRides(
        coords.latitude,
        coords.longitude,
        10 // Radio de 10 km
      );
      
      const newRides = availableRides || [];
      
      // Detectar nuevos viajes y notificar
      if (previousRidesCount.current > 0 && newRides.length > previousRidesCount.current) {
        const latestRide = newRides[0];
        await notifyNewRide(latestRide);
        console.log('🔔 Notificación de nuevo viaje enviada');
      }
      
      previousRidesCount.current = newRides.length;
      setRides(newRides);
      
      // Actualizar badge
      await setBadgeCount(newRides.length);
    } catch (error: any) {
      // Silenciar error 404 (no hay viajes disponibles)
      if (error.response?.status !== 404) {
        console.error('❌ Error loading rides:', error.message);
      }
      setRides([]);
      previousRidesCount.current = 0;
      await setBadgeCount(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = () => {
    const filtered = rides.filter((ride) => {
      const distanceKm = ride.estimatedDistance / 1000;
      const price = ride.estimatedFare;
      
      // Filtrar por distancia
      if (distanceKm < filters.minDistance || distanceKm > filters.maxDistance) {
        return false;
      }
      
      // Filtrar por precio
      if (price < filters.minPrice || price > filters.maxPrice) {
        return false;
      }
      
      // Filtrar por tipo
      if (filters.rideType !== 'all' && ride.rideType !== filters.rideType) {
        return false;
      }
      
      return true;
    });
    
    setFilteredRides(filtered);
  };

  const handleFilterApply = (newFilters: Filters) => {
    setFilters(newFilters);
    console.log('🎛️ Filtros aplicados:', newFilters);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAvailableRides();
  };

  const handleAcceptRide = async (ride: AvailableRide) => {
    Alert.alert(
      'Aceptar Viaje',
      `¿Deseas aceptar este viaje?\n\nOrigen: ${ride.originAddress}\nDestino: ${ride.destinationAddress}\nPrecio: C$${ride.estimatedFare}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceptar',
          onPress: async () => {
            try {
              setLoading(true);
              
              if (!coords) {
                Alert.alert('Error', 'No se pudo obtener tu ubicación');
                return;
              }

              await ridesService.acceptRide(ride.id, {
                driverId: user!.id,
                vehicleId: 'temp-vehicle-id', // TODO: Obtener del perfil del conductor
                currentLocation: {
                  lat: coords.latitude,
                  lng: coords.longitude,
                },
              });

              // Navegar a la pantalla de viaje activo
              navigation.navigate('ActiveRide', { rideId: ride.id });
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'No se pudo aceptar el viaje');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const renderRideItem = ({ item }: { item: AvailableRide }) => {
    const distanceKm = (item.estimatedDistance / 1000).toFixed(1);
    const durationMin = Math.round(item.estimatedDuration / 60);
    const timeAgo = getTimeAgo(item.createdAt);

    return (
      <TouchableOpacity
        style={styles.rideCard}
        onPress={() => handleAcceptRide(item)}
        activeOpacity={0.7}
      >
        <View style={styles.rideHeader}>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{item.client?.name || 'Cliente'}</Text>
            <Text style={styles.timeAgo}>{timeAgo}</Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>Precio</Text>
            <Text style={styles.price}>C${item.estimatedFare}</Text>
          </View>
        </View>

        <View style={styles.locationContainer}>
          <View style={styles.locationRow}>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>🔵</Text>
            </View>
            <View style={styles.addressContainer}>
              <Text style={styles.addressLabel}>Origen</Text>
              <Text style={styles.address} numberOfLines={1}>
                {item.originAddress}
              </Text>
            </View>
          </View>

          <View style={styles.locationRow}>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>🔴</Text>
            </View>
            <View style={styles.addressContainer}>
              <Text style={styles.addressLabel}>Destino</Text>
              <Text style={styles.address} numberOfLines={1}>
                {item.destinationAddress}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Distancia</Text>
            <Text style={styles.infoValue}>{distanceKm} km</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Duración</Text>
            <Text style={styles.infoValue}>{durationMin} min</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Tipo</Text>
            <Text style={styles.infoValue}>{item.rideType}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.acceptButton} onPress={() => handleAcceptRide(item)}>
          <Text style={styles.acceptButtonText}>Aceptar Viaje</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Hace un momento';
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
    return `Hace ${Math.floor(seconds / 3600)} h`;
  };

  if (loading && rides.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>Buscando viajes disponibles...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Viajes Disponibles</Text>
            <Text style={styles.subtitle}>
              {filteredRides.length} de {rides.length} {rides.length === 1 ? 'viaje' : 'viajes'}
            </Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setFilterModalVisible(true)}
            >
              <Text style={styles.filterButtonText}>🎛️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
            >
              <Text style={styles.filterButtonText}>
                {viewMode === 'list' ? '🗺️' : '📋'}
              </Text>
            </TouchableOpacity>
            <View style={styles.connectionStatus}>
              <View style={[styles.statusDot, connected ? styles.statusConnected : styles.statusDisconnected]} />
              <Text style={styles.statusText}>
                {connected ? 'En línea' : 'Desconectado'}
              </Text>
            </View>
          </View>
        </View>
        {newRidesCount > 0 && (
          <View style={styles.notificationBanner}>
            <Text style={styles.notificationText}>
              🔔 {newRidesCount} {newRidesCount === 1 ? 'nuevo viaje' : 'nuevos viajes'}
            </Text>
          </View>
        )}
      </View>

      {viewMode === 'map' ? (
        // Vista de Mapa
        <View style={styles.mapContainer}>
          {coords && (
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: coords.latitude,
                longitude: coords.longitude,
                latitudeDelta: 0.1,
                longitudeDelta: 0.1,
              }}
              showsUserLocation
              showsMyLocationButton
            >
              {/* Pins de viajes disponibles */}
              {filteredRides.map((ride: any) => (
                <Marker
                  key={ride.id}
                  coordinate={{
                    latitude: ride.origin?.lat || 0,
                    longitude: ride.origin?.lng || 0,
                  }}
                  pinColor="#4CAF50"
                  onPress={() => setSelectedRide(ride)}
                >
                  <Callout onPress={() => handleAcceptRide(ride)}>
                    <View style={styles.calloutContainer}>
                      <Text style={styles.calloutTitle}>
                        C${ride.estimatedFare?.toFixed(0)}
                      </Text>
                      <Text style={styles.calloutText} numberOfLines={2}>
                        {ride.originAddress}
                      </Text>
                      <Text style={styles.calloutDistance}>
                        {(ride.estimatedDistance / 1000).toFixed(1)} km
                      </Text>
                    </View>
                  </Callout>
                </Marker>
              ))}
            </MapView>
          )}
          
          {/* Card flotante del viaje seleccionado */}
          {selectedRide && (
            <View style={styles.selectedRideCard}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedRide(null)}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
              <Text style={styles.selectedRidePrice}>
                C${selectedRide.estimatedFare?.toFixed(0)}
              </Text>
              <Text style={styles.selectedRideAddress} numberOfLines={1}>
                📍 {selectedRide.originAddress}
              </Text>
              <Text style={styles.selectedRideAddress} numberOfLines={1}>
                🎯 {selectedRide.destinationAddress}
              </Text>
              <View style={styles.selectedRideInfo}>
                <Text style={styles.selectedRideInfoText}>
                  {(selectedRide.estimatedDistance / 1000).toFixed(1)} km
                </Text>
                <Text style={styles.selectedRideInfoText}>•</Text>
                <Text style={styles.selectedRideInfoText}>
                  {Math.round(selectedRide.estimatedDuration / 60)} min
                </Text>
              </View>
              <TouchableOpacity
                style={styles.acceptButtonMap}
                onPress={() => handleAcceptRide(selectedRide)}
              >
                <Text style={styles.acceptButtonMapText}>Aceptar Viaje</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : filteredRides.length === 0 ? (
        // Vista vacía
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🚗</Text>
          <Text style={styles.emptyTitle}>No hay viajes disponibles</Text>
          <Text style={styles.emptyText}>
            Estamos buscando solicitudes cerca de ti.{'\n'}
            La lista se actualizará automáticamente.
          </Text>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
            <Text style={styles.refreshButtonText}>Actualizar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Vista de Lista
        <FlatList
          data={filteredRides}
          renderItem={renderRideItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}

      <FilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        onApply={handleFilterApply}
        currentFilters={filters}
      />
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
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusConnected: {
    backgroundColor: '#4CAF50',
  },
  statusDisconnected: {
    backgroundColor: '#ff4444',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  notificationBanner: {
    backgroundColor: '#FFF9E6',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
  },
  notificationText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  listContent: {
    padding: 16,
  },
  rideCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  timeAgo: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  priceLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2196F3',
  },
  locationContainer: {
    marginBottom: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconContainer: {
    width: 32,
    alignItems: 'center',
  },
  icon: {
    fontSize: 16,
  },
  addressContainer: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  address: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
    marginBottom: 16,
  },
  infoItem: {
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  acceptButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  refreshButton: {
    marginTop: 24,
    backgroundColor: '#000',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filterButton: {
    backgroundColor: '#000',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonText: {
    fontSize: 20,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  calloutContainer: {
    width: 200,
    padding: 8,
  },
  calloutTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 4,
  },
  calloutText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  calloutDistance: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  selectedRideCard: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  selectedRidePrice: {
    fontSize: 32,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 12,
  },
  selectedRideAddress: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
  },
  selectedRideInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  selectedRideInfoText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  acceptButtonMap: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  acceptButtonMapText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
