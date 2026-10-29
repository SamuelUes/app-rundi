import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import ridesService from '../../services/ridesService';
import { formatNicaraguaTime } from '../../utils/dateUtils';
import rideHistoryService from '../../services/rideHistoryService';

interface Ride {
  id: string;
  origin_address: string;
  destination_address: string;
  estimated_distance: number;
  final_fare: number;
  status: string;
  created_at: string;
  completed_at: string;
}

export default function TodayRidesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, getToken } = useAuth();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ trips: 0, earnings: 0 });

  useEffect(() => {
    loadTodayRides();
  }, []);

  const loadTodayRides = async () => {
    try {
      if (!user) return;

      const token = await getToken();
      if (!token) {
        console.error('No se pudo obtener el token');
        return;
      }

      const response = await rideHistoryService.getTodayRides();
      
      const todayRides = response || [];
      setRides(todayRides);

      // Calcular estadísticas
      const completedRides = todayRides.filter((r: Ride) => r.status === 'completed');
      const totalEarnings = completedRides.reduce((sum: number, r: Ride) => sum + (r.final_fare || 0), 0);
      
      setStats({
        trips: completedRides.length,
        earnings: totalEarnings,
      });
    } catch (error) {
      console.error('Error cargando viajes del día:', error);
      setRides([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadTodayRides();
  };

  const formatTime = (dateString: string) => {
    return formatNicaraguaTime(dateString);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return colors.success;
      case 'canceled': return colors.error;
      case 'in_progress': return colors.warning;
      default: return colors.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Completado';
      case 'canceled': return 'Cancelado';
      case 'in_progress': return 'En progreso';
      case 'accepted': return 'Aceptado';
      default: return status;
    }
  };

  const renderRide = ({ item }: { item: Ride }) => (
    <TouchableOpacity
      style={[styles.rideCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => navigation.navigate('RideDetails', { rideId: item.id })}
    >
      <View style={styles.rideHeader}>
        <Text style={[styles.rideTime, { color: colors.text }]}>
          {formatTime(item.created_at)}
        </Text>
        <Text style={[styles.rideStatus, { color: getStatusColor(item.status) }]}>
          {getStatusText(item.status)}
        </Text>
      </View>

      <View style={styles.rideInfo}>
        <Text style={[styles.rideLabel, { color: colors.textSecondary }]}>Origen:</Text>
        <Text style={[styles.rideAddress, { color: colors.text }]} numberOfLines={1}>
          {item.origin_address}
        </Text>
      </View>

      <View style={styles.rideInfo}>
        <Text style={[styles.rideLabel, { color: colors.textSecondary }]}>Destino:</Text>
        <Text style={[styles.rideAddress, { color: colors.text }]} numberOfLines={1}>
          {item.destination_address}
        </Text>
      </View>

      <View style={styles.rideFooter}>
        <Text style={[styles.rideDistance, { color: colors.textSecondary }]}>
          {(item.estimated_distance / 1000).toFixed(1)} km
        </Text>
        <Text style={[styles.rideFare, { color: colors.success }]}>
          C${item.final_fare?.toFixed(0) || '0'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const createStyles = (colors: any) => StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      backgroundColor: colors.background,
    },
    header: {
      backgroundColor: colors.card,
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: '700',
      marginBottom: 16,
      color: colors.text,
    },
    statsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.primary,
    },
    statLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    list: {
      padding: 16,
    },
    rideCard: {
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
    },
    rideHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    rideTime: {
      fontSize: 16,
      fontWeight: '600',
    },
    rideStatus: {
      fontSize: 14,
      fontWeight: '600',
    },
    rideInfo: {
      marginBottom: 8,
    },
    rideLabel: {
      fontSize: 12,
      marginBottom: 2,
    },
    rideAddress: {
      fontSize: 14,
      fontWeight: '500',
    },
    rideFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rideDistance: {
      fontSize: 14,
    },
    rideFare: {
      fontSize: 18,
      fontWeight: '700',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
    },
    emptyText: {
      fontSize: 18,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 16,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}><MaterialIcons name="bar-chart" size={24} color={colors.text} /> Viajes de Hoy</Text>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.trips}</Text>
            <Text style={styles.statLabel}>Viajes</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>C${stats.earnings.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Ganancias</Text>
          </View>
        </View>
      </View>

      {rides.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="directions-car" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyText}>
            No has realizado viajes hoy
          </Text>
        </View>
      ) : (
        <FlatList
          data={rides}
          renderItem={renderRide}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}
