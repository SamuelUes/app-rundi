import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { RideListSkeleton } from '../../components/SkeletonLoader';
import { NoHistoryEmptyState } from '../../components/EmptyState';
import ridesService from '../../services/ridesService';
import { formatNicaraguaRelativeDate } from '../../utils/dateUtils';
import { safeString, safeFormatDateTime } from '../../utils/safeFormatters';

interface HistoricalRide {
  id: string;
  originAddress: string;
  destinationAddress: string;
  allAddresses?: string[];  // ✅ NUEVO: Todas las direcciones (origin, waypoints, destination)
  hasMultipleStops?: boolean;  // ✅ NUEVO: Indica si hay múltiples paradas
  waypointsCount?: number;  // ✅ NUEVO: Cantidad de paradas intermedias
  estimatedDistance: number;
  estimatedFare: number;
  finalFare: number;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  rideType: string;
  passengers: number;
  client?: { name: string };
  driver?: { name: string; rating: number };
  rating?: number;
}

export default function RideHistoryScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [rides, setRides] = useState<HistoricalRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'completed' | 'canceled'>('all');

  useEffect(() => {
    loadRides();
  }, [filter]);

  const loadRides = async () => {
    try {
      if (!user?.id) return;
      
      console.log(`📋 [RideHistoryScreen] Cargando viajes para ${user.role}: ${user.id}`);
      setLoading(true);
      const userType = user.role === 'driver' ? 'driver' : 'client';
      const rides = await ridesService.getMyRides(user.id, userType);
      
      console.log(`✅ [RideHistoryScreen] Viajes cargados: ${rides?.length || 0}`);
      if (rides && Array.isArray(rides)) {
        let filteredRides: any[] = rides;
        
        if (filter === 'completed') {
          filteredRides = rides.filter((r: any) => r.status === 'completed');
        } else if (filter === 'canceled') {
          filteredRides = rides.filter((r: any) => r.status === 'canceled');
        }
        
        setRides(filteredRides as HistoricalRide[]);
      }
    } catch (error) {
      console.error('❌ Error loading rides:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRides();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'canceled': return '#F44336';
      case 'in_progress': return '#FF9800';
      default: return colors.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Completado';
      case 'canceled': return 'Cancelado';
      case 'in_progress': return 'En progreso';
      case 'requested': return 'Solicitado';
      case 'accepted': return 'Aceptado';
      default: return status;
    }
  };

  const formatDate = (dateString: any): string => {
    if (!dateString || typeof dateString === 'object') return 'Sin fecha';
    try {
      const formatted = formatNicaraguaRelativeDate(dateString);
      return typeof formatted === 'string' ? formatted : 'Sin fecha';
    } catch (error) {
      return 'Sin fecha';
    }
  };

  // Función para sanitizar datos del ride
  const sanitizeRideData = (item: any) => {
    return {
      ...item,
      id: String(item.id || ''),
      originAddress: typeof item.originAddress === 'string' ? item.originAddress : 'Origen desconocido',
      destinationAddress: typeof item.destinationAddress === 'string' ? item.destinationAddress : 'Destino desconocido',
      // ✅ NUEVO: Soportar múltiples direcciones
      allAddresses: Array.isArray(item.allAddresses) ? item.allAddresses : [],
      hasMultipleStops: typeof item.hasMultipleStops === 'boolean' ? item.hasMultipleStops : false,
      waypointsCount: typeof item.waypointsCount === 'number' ? item.waypointsCount : 0,
      estimatedDistance: typeof item.estimatedDistance === 'number' ? item.estimatedDistance : 0,
      estimatedFare: typeof item.estimatedFare === 'number' || typeof item.estimatedFare === 'string' ? item.estimatedFare : 0,
      finalFare: item.finalFare && (typeof item.finalFare === 'number' || typeof item.finalFare === 'string') ? item.finalFare : null,
      status: typeof item.status === 'string' ? item.status : 'unknown',
      rideType: typeof item.rideType === 'string' ? item.rideType : 'auto',
      passengers: typeof item.passengers === 'number' ? item.passengers : 1,
      rating: typeof item.rating === 'number' ? item.rating : null,
      client: item.client && typeof item.client.name === 'string' ? item.client : null,
      driver: item.driver && typeof item.driver.name === 'string' ? item.driver : null,
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
    };
  };

  const renderRideItem = ({ item: rawItem }: { item: HistoricalRide }) => {
    try {
      // Validación inicial
      if (!rawItem || !rawItem.id || typeof rawItem !== 'object') {
        return null;
      }

      // Sanitizar datos
      const item = sanitizeRideData(rawItem);
      
      // Validación post-sanitización
      if (!item || !item.id) {
        return null;
      }
      
      const isDriver = user?.role === 'driver';
      const distanceKm = ((Number(item.estimatedDistance) || 0) / 1000).toFixed(1);
      const price = Number(item.estimatedFare) || 0;
      const formattedDate = formatDate(item.updatedAt || item.createdAt);

      return (
      <TouchableOpacity
        style={styles.rideCard}
        onPress={() => navigation.navigate('RideDetails', { rideId: String(item.id) })}
        activeOpacity={0.7}
      >
        {/* Header con fecha y estado */}
        <View style={styles.rideHeader}>
          <Text style={styles.dateText}>{String(formattedDate)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(String(item.status)) }]}>
            <Text style={styles.statusText}>{getStatusText(String(item.status))}</Text>
          </View>
        </View>

        {/* Ubicaciones - Soportar múltiples destinos */}
        <View style={styles.locationContainer}>
          {/* Si hay múltiples paradas, mostrar todas */}
          {item.hasMultipleStops && item.allAddresses && item.allAddresses.length > 0 ? (
            item.allAddresses.map((address: string, idx: number) => (
              <View key={`${item.id}-addr-${idx}`}>
                <View style={styles.locationRow}>
                  <Text style={styles.locationIcon}>
                    {idx === 0 ? '🔵' : idx === item.allAddresses.length - 1 ? '🔴' : '📍'}
                  </Text>
                  <Text style={styles.locationText} numberOfLines={1}>
                    {String(address || 'Ubicación desconocida')}
                  </Text>
                </View>
                {idx < item.allAddresses.length - 1 && <View style={styles.locationDivider} />}
              </View>
            ))
          ) : (
            // Si no hay múltiples paradas, mostrar origen y destino
            <>
              <View style={styles.locationRow}>
                <Text style={styles.locationIcon}>🔵</Text>
                <Text style={styles.locationText} numberOfLines={1}>
                  {String(item.originAddress || 'Origen desconocido')}
                </Text>
              </View>
              <View style={styles.locationDivider} />
              <View style={styles.locationRow}>
                <Text style={styles.locationIcon}>🔴</Text>
                <Text style={styles.locationText} numberOfLines={1}>
                  {String(item.destinationAddress || 'Destino desconocido')}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Info del viaje */}
        <View style={styles.rideInfo}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Distancia</Text>
            <Text style={styles.infoValue}>{`${distanceKm} km`}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>
              {item.finalFare ? 'Precio Final' : 'Precio Est.'}
            </Text>
            <Text style={[styles.infoValue, item.finalFare ? { color: '#4CAF50', fontWeight: '700' as '700' } : null]}>
              {item.finalFare 
                ? `C$${parseFloat(String(item.finalFare)).toFixed(2)}`
                : `C$${price.toFixed(2)}`}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Tipo</Text>
            <Text style={styles.infoValue}>
              {item.rideType === 'designated_driver' ? '🚗 CD' : item.rideType === 'moto' ? '🏍️ Moto' : '🚕 Auto'}
            </Text>
          </View>
          {item.passengers && item.passengers > 1 && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Pasajeros</Text>
              <Text style={styles.infoValue}>{String(item.passengers)}</Text>
            </View>
          )}
        </View>


        {/* Info de conductor/cliente */}
        {isDriver && item.client && item.client.name && (
          <View style={styles.personInfo}>
            <Text style={styles.personLabel}>Cliente:</Text>
            <Text style={styles.personName}>{String(item.client.name)}</Text>
          </View>
        )}
        {!isDriver && item.driver && item.driver.name && (
          <View style={styles.personInfo}>
            <Text style={styles.personLabel}>Conductor:</Text>
            <Text style={styles.personName}>{String(item.driver.name)}</Text>
            {item.driver.rating && typeof item.driver.rating !== 'object' && parseFloat(String(item.driver.rating)) > 0 && (
              <Text style={styles.personRating}>⭐ {parseFloat(String(item.driver.rating)).toFixed(1)}</Text>
            )}
          </View>
        )}

        {/* Rating */}
        {item.rating && typeof item.rating === 'number' && item.rating > 0 && (
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingLabel}>Tu calificación:</Text>
            <Text style={styles.ratingValue}>
              {'⭐'.repeat(Math.round(item.rating))}
            </Text>
          </View>
        )}

        {/* Botón de calificar si no tiene rating */}
        {item.status === 'completed' && !item.rating && (
          <TouchableOpacity
            style={styles.rateButton}
            onPress={() => navigation.navigate('Rating', { rideId: item.id })}
          >
            <Text style={styles.rateButtonText}>⭐ Calificar</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      );
    } catch (error) {
      console.error('❌ Error renderizando ride:', rawItem?.id, error);
      return (
        <View style={styles.rideCard}>
          <Text style={styles.emptyTitle}>Error al cargar viaje</Text>
          <Text style={styles.emptySubtitle}>{`ID: ${String(rawItem?.id || 'unknown')}`}</Text>
        </View>
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <RideListSkeleton count={5} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Filtros */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Todos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'completed' && styles.filterButtonActive]}
          onPress={() => setFilter('completed')}
        >
          <Text style={[styles.filterText, filter === 'completed' && styles.filterTextActive]}>
            Completados
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'canceled' && styles.filterButtonActive]}
          onPress={() => setFilter('canceled')}
        >
          <Text style={[styles.filterText, filter === 'canceled' && styles.filterTextActive]}>
            Cancelados
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lista */}
      <FlatList
        data={rides}
        renderItem={renderRideItem}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>📋</Text>
            <Text style={styles.emptyTitle}>Sin viajes</Text>
            <Text style={styles.emptySubtitle}>
              {filter === 'all'
                ? 'Aún no tienes viajes en tu historial'
                : `No tienes viajes ${filter === 'completed' ? 'completados' : 'cancelados'}`}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    filterContainer: {
      flexDirection: 'row',
      padding: 16,
      gap: 8,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    filterButton: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    filterButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    filterTextActive: {
      color: '#fff',
    },
    listContent: {
      padding: 16,
    },
    rideCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rideHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    dateText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#fff',
    },
    locationContainer: {
      marginBottom: 12,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    locationIcon: {
      fontSize: 16,
    },
    locationText: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
    },
    locationDivider: {
      width: 2,
      height: 20,
      backgroundColor: colors.border,
      marginLeft: 7,
      marginVertical: 4,
    },
    rideInfo: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 12,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
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
    personInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    personLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    personName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    personRating: {
      fontSize: 14,
      color: colors.primary,
    },
    ratingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    ratingLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    ratingValue: {
      fontSize: 16,
    },
    rateButton: {
      backgroundColor: colors.primary,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 8,
    },
    rateButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#fff',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    emptyText: {
      fontSize: 64,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
