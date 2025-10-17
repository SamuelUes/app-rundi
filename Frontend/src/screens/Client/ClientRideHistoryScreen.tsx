import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ridesService from '../../services/ridesService';

interface Ride {
  id: string;
  status: string;
  originAddress?: string;
  destinationAddress?: string;
  estimatedDistance?: number;
  estimatedFare?: number;
  finalFare?: number | null;
  rideType?: string;
  passengers?: number;
  createdAt?: string;
  updatedAt?: string;
  driver?: {
    id: string;
    name: string;
    rating?: number;
    email?: string;
    phone?: string;
    licenseNumber?: string;
    photo?: string;
  };
}

export default function ClientRideHistoryScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [rides, setRides] = useState<Ride[]>([]);
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
      const data = await ridesService.getMyRides(user.id);
      
      if (data && Array.isArray(data)) {
        let filtered = data;
        
        if (filter === 'completed') {
          filtered = data.filter((r: any) => r.status === 'completed');
        } else if (filter === 'canceled') {
          filtered = data.filter((r: any) => r.status === 'canceled');
        }
        
        setRides(filtered);
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

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      
      if (diffHours < 24) {
        return 'Hoy';
      } else if (diffHours < 48) {
        return 'Ayer';
      } else {
        return date.toLocaleDateString('es-NI', { 
          day: '2-digit', 
          month: 'short' 
        });
      }
    } catch {
      return 'Sin fecha';
    }
  };

  const getStatusText = (status: string): string => {
    const statusMap: { [key: string]: string } = {
      completed: 'Completado',
      canceled: 'Cancelado',
      requested: 'Solicitado',
      accepted: 'Aceptado',
      started: 'En curso',
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string): string => {
    const colorMap: { [key: string]: string } = {
      completed: '#4CAF50',
      canceled: '#F44336',
      requested: '#FF9800',
      accepted: '#2196F3',
      started: '#9C27B0',
    };
    return colorMap[status] || '#757575';
  };

  const renderRideItem = ({ item }: { item: Ride }) => {
    const distanceKm = ((item.estimatedDistance || 0) / 1000).toFixed(1);
    const price = item.finalFare || item.estimatedFare || 0;

    return (
      <TouchableOpacity
        style={[styles.rideCard, { backgroundColor: colors.surface }]}
        onPress={() => navigation.navigate('RideDetails', { rideId: item.id })}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>
            {formatDate(item.updatedAt || item.createdAt || '')}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
          </View>
        </View>

        {/* Locations */}
        <View style={styles.locations}>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔵</Text>
            <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={1}>
              {typeof item.originAddress === 'string' ? item.originAddress : 'Origen'}
            </Text>
          </View>
          <View style={styles.locationDivider} />
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔴</Text>
            <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={1}>
              {typeof item.destinationAddress === 'string' ? item.destinationAddress : 'Destino'}
            </Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Distancia</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{distanceKm} km</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Precio</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              C${price.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Driver */}
        {item.driver && typeof item.driver === 'object' && item.driver.name && (
          <View style={styles.driverInfo}>
            <Text style={[styles.driverLabel, { color: colors.textSecondary }]}>
              Conductor:
            </Text>
            <Text style={[styles.driverName, { color: colors.text }]}>
              {typeof item.driver.name === 'string' ? item.driver.name : 'Conductor'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Filters */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'all' && { backgroundColor: colors.primary },
          ]}
          onPress={() => setFilter('all')}
        >
          <Text
            style={[
              styles.filterText,
              { color: filter === 'all' ? '#FFF' : colors.text },
            ]}
          >
            Todos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'completed' && { backgroundColor: colors.primary },
          ]}
          onPress={() => setFilter('completed')}
        >
          <Text
            style={[
              styles.filterText,
              { color: filter === 'completed' ? '#FFF' : colors.text },
            ]}
          >
            Completados
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'canceled' && { backgroundColor: colors.primary },
          ]}
          onPress={() => setFilter('canceled')}
        >
          <Text
            style={[
              styles.filterText,
              { color: filter === 'canceled' ? '#FFF' : colors.text },
            ]}
          >
            Cancelados
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
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
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Sin viajes
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {filter === 'all'
                ? 'Aún no tienes viajes en tu historial'
                : filter === 'completed'
                ? 'No tienes viajes completados'
                : 'No tienes viajes cancelados'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
  },
  rideCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  locations: {
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
  },
  locationDivider: {
    width: 2,
    height: 20,
    backgroundColor: '#E0E0E0',
    marginLeft: 7,
    marginVertical: 4,
  },
  info: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  driverLabel: {
    fontSize: 14,
  },
  driverName: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
});
