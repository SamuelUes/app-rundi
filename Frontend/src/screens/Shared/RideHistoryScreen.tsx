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
import ridesService from '../../services/ridesService';
import { formatNicaraguaRelativeDate } from '../../utils/dateUtils';

interface HistoricalRide {
  id: string;
  originAddress: string;
  destinationAddress: string;
  estimatedDistance: number;
  estimatedFare: number;
  finalFare: number;
  status: string;
  createdAt: string;
  rideType: string;
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
      
      setLoading(true);
      const rides = await ridesService.getMyRides(user.id);
      
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
      console.error('Error loading rides:', error);
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

  const formatDate = (dateString: string) => {
    return formatNicaraguaRelativeDate(dateString);
  };

  const renderRideItem = ({ item }: { item: HistoricalRide }) => {
    const isDriver = user?.role === 'driver';
    const distanceKm = (item.estimatedDistance / 1000).toFixed(1);
    const price = item.finalFare || item.estimatedFare;

    return (
      <TouchableOpacity
        style={styles.rideCard}
        onPress={() => navigation.navigate('RideDetails', { rideId: item.id })}
        activeOpacity={0.7}
      >
        {/* Header con fecha y estado */}
        <View style={styles.rideHeader}>
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
          </View>
        </View>

        {/* Ubicaciones */}
        <View style={styles.locationContainer}>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔵</Text>
            <Text style={styles.locationText} numberOfLines={1}>
              {item.originAddress}
            </Text>
          </View>
          <View style={styles.locationDivider} />
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔴</Text>
            <Text style={styles.locationText} numberOfLines={1}>
              {item.destinationAddress}
            </Text>
          </View>
        </View>

        {/* Info del viaje */}
        <View style={styles.rideInfo}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Distancia</Text>
            <Text style={styles.infoValue}>{distanceKm} km</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Precio</Text>
            <Text style={styles.infoValue}>C${price}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Tipo</Text>
            <Text style={styles.infoValue}>
              {item.rideType === 'designated_driver' ? '🚗 CD' : '🚕'}
            </Text>
          </View>
        </View>

        {/* Info de conductor/cliente */}
        {isDriver ? (
          item.client && (
            <View style={styles.personInfo}>
              <Text style={styles.personLabel}>Cliente:</Text>
              <Text style={styles.personName}>{item.client.name}</Text>
            </View>
          )
        ) : (
          item.driver && (
            <View style={styles.personInfo}>
              <Text style={styles.personLabel}>Conductor:</Text>
              <Text style={styles.personName}>{item.driver.name}</Text>
              {item.driver.rating && (
                <Text style={styles.personRating}>⭐ {item.driver.rating.toFixed(1)}</Text>
              )}
            </View>
          )
        )}

        {/* Rating */}
        {item.rating && (
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
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
        keyExtractor={(item) => item.id}
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
