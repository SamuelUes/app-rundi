import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { RideListSkeleton } from '../../components/SkeletonLoader';
import { NoHistoryEmptyState } from '../../components/EmptyState';
import { useRideHistory } from '../../hooks/shared/ride/useRideHistory';
import { safeString, safeFormatDateTime } from '../../utils/safeFormatters';
import { useTranslation } from 'react-i18next';

interface HistoricalRide {
  id: string;
  originAddress: string;
  destinationAddress: string;
  allAddresses?: string[];
  hasMultipleStops?: boolean;
  waypointsCount?: number;
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

const STATUS_KEY_MAP: Record<string, string> = {
  completed: 'completed',
  canceled: 'canceled',
  in_progress: 'inProgress',
  requested: 'requested',
  accepted: 'accepted',
};

const arrowWhiteUpIcon = require('../../assets/icons/arrow/arrowwhiteup2x.png');
const arrowBlackDownIcon = require('../../assets/icons/arrow/arrrowblackup2x.png');

export default function RideHistoryScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const isDriverRole = user?.role === 'driver' || user?.role === 'designated_driver';
  const userType = isDriverRole ? 'driver' : 'client';
  const { rides, loading, refreshing, filter, setFilter, handleRefresh, getStatusColor, formatDate } = useRideHistory(user?.id, userType);

  const getStatusText = (status: string) => {
    const key = STATUS_KEY_MAP[status] ?? 'default';
    return t(`shared.rideHistory.status.${key}`, { status });
  };

  const formatDriverDate = (dateString: any): string => {
    return formatDate(dateString, t('shared.rideHistory.labels.noDate'));
  };

  // Función para sanitizar datos del ride
  const sanitizeRideData = (item: any) => {
    return {
      ...item,
      id: String(item.id || ''),
      originAddress: typeof item.originAddress === 'string' ? item.originAddress : t('shared.rideHistory.labels.originFallback'),
      destinationAddress: typeof item.destinationAddress === 'string' ? item.destinationAddress : t('shared.rideHistory.labels.destinationFallback'),
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
      const formattedDate = formatDriverDate(item.updatedAt || item.createdAt);

      const resolveRideTypeLabel = (type: string) => {
        switch (type) {
          case 'designated_driver':
            return t('shared.rideHistory.labels.typeDesignated');
          case 'moto':
            return t('shared.rideHistory.labels.typeMoto');
          default:
            return t('shared.rideHistory.labels.typeAuto');
        }
      };

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
                  <MaterialIcons name={idx === 0 ? 'circle' : idx === item.allAddresses.length - 1 ? 'place' : 'location-on'} size={16} color={idx === 0 ? '#2196F3' : idx === item.allAddresses.length - 1 ? '#F44336' : '#FF9800'} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {String(address || t('shared.rideHistory.labels.unknownLocation'))}
                  </Text>
                </View>
                {idx < item.allAddresses.length - 1 && <View style={styles.locationDivider} />}
              </View>
            ))
          ) : (
            // Si no hay múltiples paradas, mostrar origen y destino
            <>
              <View style={styles.locationRow}>
                <MaterialIcons name="circle" size={16} color="#2196F3" />
                <Text style={styles.locationText} numberOfLines={1}>
                  {String(item.originAddress || t('shared.rideHistory.labels.originFallback'))}
                </Text>
              </View>
              <View style={styles.locationDivider} />
              <View style={styles.locationRow}>
                <MaterialIcons name="place" size={16} color="#F44336" />
                <Text style={styles.locationText} numberOfLines={1}>
                  {String(item.destinationAddress || t('shared.rideHistory.labels.destinationFallback'))}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Info del viaje */}
        <View style={styles.rideInfo}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('shared.rideHistory.labels.distance')}</Text>
            <Text style={styles.infoValue}>{`${distanceKm} km`}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>
              {item.finalFare ? t('shared.rideHistory.labels.priceFinal') : t('shared.rideHistory.labels.priceEstimated')}
            </Text>
            <Text style={[styles.infoValue, item.finalFare ? { color: '#4CAF50', fontWeight: '700' as '700' } : null]}>
              {item.finalFare 
                ? `C$${parseFloat(String(item.finalFare)).toFixed(2)}`
                : `C$${price.toFixed(2)}`}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('shared.rideHistory.labels.type')}</Text>
            <Text style={styles.infoValue}>
              {resolveRideTypeLabel(String(item.rideType))}
            </Text>
          </View>
          {item.passengers && item.passengers > 1 && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>{t('shared.rideHistory.labels.passengers')}</Text>
              <Text style={styles.infoValue}>{String(item.passengers)}</Text>
            </View>
          )}
        </View>


        {/* Info de conductor/cliente */}
        {isDriver && item.client && item.client.name && (
          <View style={styles.personInfo}>
            <Text style={styles.personLabel}>{t('shared.rideHistory.labels.client')}</Text>
            <Text style={styles.personName}>{String(item.client.name)}</Text>
          </View>
        )}
        {!isDriver && item.driver && item.driver.name && (
          <View style={styles.personInfo}>
            <Text style={styles.personLabel}>{t('shared.rideHistory.labels.driver')}</Text>
            <Text style={styles.personName}>{String(item.driver.name)}</Text>
            {item.driver.rating && typeof item.driver.rating !== 'object' && parseFloat(String(item.driver.rating)) > 0 && (
              <Text style={styles.personRating}>⭐ {parseFloat(String(item.driver.rating)).toFixed(1)}</Text>
            )}
          </View>
        )}

        {/* Rating */}
        {item.rating && typeof item.rating === 'number' && item.rating > 0 && (
          <View style={styles.ratingContainer}>
            <Text style={styles.ratingLabel}>{t('shared.rideHistory.labels.yourRating')}</Text>
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
            <Text style={styles.rateButtonText}>{t('shared.rideHistory.actions.rateRide')}</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      );
    } catch (error) {
      console.error('❌ Error renderizando ride:', rawItem?.id, error);
      return (
        <View style={styles.rideCard}>
          <Text style={styles.emptyTitle}>{t('shared.rideHistory.errors.loadRide')}</Text>
          <Text style={styles.emptySubtitle}>
            {t('shared.rideHistory.errors.idLabel', { id: String(rawItem?.id || 'unknown') })}
          </Text>
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
      <View style={styles.topSection}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Image
            source={require('../../assets/icons/back_button/back_button2x.png')}
            style={styles.backIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <View style={styles.navigationButtons}>
        <TouchableOpacity
          style={styles.primaryNavButton}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('RechargeFunds')}
        >
          <Image source={arrowWhiteUpIcon} style={[styles.navIcon, styles.navIconWhite]} resizeMode="contain" />
          <Text style={styles.primaryNavText}>{t('shared.rideHistory.nav.commissions')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryNavButton}
          activeOpacity={0.9}
          onPress={() => {}}
        >
          <Image source={arrowBlackDownIcon} style={[styles.navIcon, styles.navIconDark]} resizeMode="contain" />
          <Text style={styles.secondaryNavText}>{t('shared.rideHistory.nav.history')}</Text>
        </TouchableOpacity>
        </View>

        {/* Filtros */}
        <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            {t('shared.rideHistory.filters.all')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'completed' && styles.filterButtonActive]}
          onPress={() => setFilter('completed')}
        >
          <Text style={[styles.filterText, filter === 'completed' && styles.filterTextActive]}>
            {t('shared.rideHistory.filters.completed')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'canceled' && styles.filterButtonActive]}
          onPress={() => setFilter('canceled')}
        >
          <Text style={[styles.filterText, filter === 'canceled' && styles.filterTextActive]}>
            {t('shared.rideHistory.filters.canceled')}
          </Text>
        </TouchableOpacity>
      </View>
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
            <MaterialIcons name="assignment" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>{t('shared.rideHistory.empty.title')}</Text>
            <Text style={styles.emptySubtitle}>
              {filter === 'all'
                ? t('shared.rideHistory.empty.subtitleAll')
                : t(
                    filter === 'completed'
                      ? 'shared.rideHistory.empty.subtitleCompleted'
                      : 'shared.rideHistory.empty.subtitleCanceled',
                  )}
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
    topSection: {
      marginTop: 10,
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 4,
      elevation: 1,
    },
    filterContainer: {
      flexDirection: 'row',
      padding: 0,
      paddingTop: 8,
      gap: 8,
      backgroundColor: 'transparent',
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface || colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    backIcon: {
      width: 26,
      height: 26,
    },
    navigationButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
      gap: 12,
      backgroundColor: 'transparent',
      marginTop: 0,
    },
    primaryNavButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface || colors.background,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      gap: 8,
    },
    primaryNavText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    secondaryNavButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingVertical: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: colors.text,
      backgroundColor: colors.text,
    },
    secondaryNavText: {
      color: colors.background,
      fontSize: 13,
      fontWeight: '700',
    },
    navIcon: {
      width: 14,
      height: 14,
    },
    navIconWhite: {
      tintColor: colors.text,
    },
    navIconDark: {
      tintColor: colors.background,
      transform: [{ rotate: '90deg' }],
    },
    filterButton: {
      flex: 1,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: colors.surface || colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    filterButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    filterTextActive: {
      color: '#fff',
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 18,
    },
    rideCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.02,
      shadowRadius: 3,
      elevation: 1,
    },
    rideHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    dateText: {
      fontSize: 12,
      color: colors.textSecondary,
      letterSpacing: 0.3,
    },
    statusBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#fff',
    },
    locationContainer: {
      marginBottom: 10,
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
      fontSize: 13,
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
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    infoItem: {
      alignItems: 'center',
      flex: 1,
    },
    infoLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 3,
      textAlign: 'center',
    },
    infoValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    personInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    personLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    personName: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    personRating: {
      fontSize: 13,
      color: colors.primary,
    },
    ratingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    ratingLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    ratingValue: {
      fontSize: 16,
    },
    rateButton: {
      backgroundColor: colors.primary,
      paddingVertical: 9,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: 8,
    },
    rateButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: '#fff',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 34,
      marginHorizontal: 16,
      paddingVertical: 44,
      paddingHorizontal: 20,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
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
