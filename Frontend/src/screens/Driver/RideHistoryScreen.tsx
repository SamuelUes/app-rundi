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
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { RideListSkeleton } from '../../components/ui/SkeletonLoader';
import { NoHistoryEmptyState } from '../../components/ui/EmptyState';
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

      const resolveRideTypeIcon = (type: string): keyof typeof MaterialIcons.glyphMap => {
        switch (type) {
          case 'designated_driver':
            return 'drive-eta';
          case 'moto':
            return 'two-wheeler';
          default:
            return 'local-taxi';
        }
      };

      const statusColor = getStatusColor(String(item.status));

      const renderRouteMarker = (kind: 'origin' | 'stop' | 'destination') => {
        if (kind === 'origin') {
          return <View style={styles.routeRing} />;
        }
        if (kind === 'destination') { 
          return <View style={[styles.routeRing, { borderColor: colors.error }]} />;
        }
        return <View style={styles.routeStopDot} />;
      };

      const addresses: string[] =
        item.hasMultipleStops && item.allAddresses && item.allAddresses.length > 0
          ? item.allAddresses
          : [
              String(item.originAddress || t('shared.rideHistory.labels.originFallback')),
              String(item.destinationAddress || t('shared.rideHistory.labels.destinationFallback')),
            ];

      return (
      <TouchableOpacity
        style={styles.rideCard}
        onPress={() => navigation.navigate('RideDetails', { rideId: String(item.id) })}
        activeOpacity={0.7}
      >
        {/* Header con fecha y estado */}
        <View style={styles.rideHeader}>
          <Text style={styles.dateText}>{String(formattedDate)}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '26' }]}>
            <View style={[styles.statusPillDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusPillText, { color: statusColor }]}>
              {getStatusText(String(item.status))}
            </Text>
          </View>
        </View>

        {/* Ruta - timeline con paradas */}
        <View style={styles.routeContainer}>
          {addresses.map((address: string, idx: number) => {
            const kind =
              idx === 0 ? 'origin' : idx === addresses.length - 1 ? 'destination' : 'stop';
            return (
              <View key={`${item.id}-addr-${idx}`}>
                <View style={styles.routeRow}>
                  <View style={styles.routeMarkerCol}>{renderRouteMarker(kind)}</View>
                  <Text style={styles.locationText} numberOfLines={1}>
                    {String(address || t('shared.rideHistory.labels.unknownLocation'))}
                  </Text>
                </View>
                {idx < addresses.length - 1 && <View style={styles.routeConnector} />}
              </View>
            );
          })}
        </View>

        {/* Stats del viaje */}
        <View style={styles.statsBand}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('shared.rideHistory.labels.distance')}</Text>
            <Text style={styles.statValue}>{`${distanceKm} km`}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>
              {item.finalFare ? t('shared.rideHistory.labels.priceFinal') : t('shared.rideHistory.labels.priceEstimated')}
            </Text>
            <Text style={[styles.statValue, styles.statFare, item.finalFare ? { color: colors.success } : null]}>
              {item.finalFare 
                ? `C$${parseFloat(String(item.finalFare)).toFixed(2)}`
                : `C$${price.toFixed(2)}`}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('shared.rideHistory.labels.type')}</Text>
            <View style={styles.statTypeRow}>
              <MaterialIcons
                name={resolveRideTypeIcon(String(item.rideType))}
                size={14}
                color={colors.textSecondary}
              />
              <Text style={styles.statValue}>
                {resolveRideTypeLabel(String(item.rideType))}
              </Text>
            </View>
          </View>
          {item.passengers && item.passengers > 1 && (
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('shared.rideHistory.labels.passengers')}</Text>
              <Text style={styles.statValue}>{String(item.passengers)}</Text>
            </View>
          )}
        </View>

        {/* Info de conductor/cliente */}
        {isDriver && item.client && item.client.name && (
          <View style={styles.personRow}>
            <MaterialIcons name="person-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.personLabel}>{t('shared.rideHistory.labels.client')}</Text>
            <Text style={styles.personName} numberOfLines={1}>{String(item.client.name)}</Text>
          </View>
        )}
        {!isDriver && item.driver && item.driver.name && (
          <View style={styles.personRow}>
            <MaterialIcons name="drive-eta" size={15} color={colors.textSecondary} />
            <Text style={styles.personLabel}>{t('shared.rideHistory.labels.driver')}</Text>
            <Text style={styles.personName} numberOfLines={1}>{String(item.driver.name)}</Text>
            {item.driver.rating && typeof item.driver.rating !== 'object' && parseFloat(String(item.driver.rating)) > 0 && (
              <View style={styles.ratingChip}>
                <MaterialIcons name="star" size={13} color="#FFC107" />
                <Text style={styles.ratingChipText}>{parseFloat(String(item.driver.rating)).toFixed(1)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Rating */}
        {item.rating && typeof item.rating === 'number' && item.rating > 0 && (
          <View style={styles.ratingContainer}>
            <Text style={styles.personLabel}>{t('shared.rideHistory.labels.yourRating')}</Text>
            <View style={styles.ratingStars}>
              {Array.from({ length: Math.max(0, Math.round(item.rating)) }).map((_, starIdx) => (
                <MaterialIcons key={`${item.id}-star-${starIdx}`} name="star" size={15} color="#FFC107" />
              ))}
            </View>
          </View>
        )}

        {/* Botón de calificar si no tiene rating */}
        {item.status === 'completed' && !item.rating && (
          <TouchableOpacity
            style={styles.rateButton}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Rating', { rideId: item.id })}
          >
            <MaterialIcons name="star" size={15} color="#FFC107" />
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
      <View style={styles.headerArea}>
        <View style={styles.headerRow}>
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

          <View style={styles.segRail}>
            <TouchableOpacity
              style={styles.segItem}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('RechargeFunds')}
            >
              <Image source={arrowWhiteUpIcon} style={[styles.navIcon, styles.navIconInactive]} resizeMode="contain" />
              <Text style={styles.segText}>{t('shared.rideHistory.nav.commissions')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segItem, styles.segItemActive]}
              activeOpacity={0.9}
              onPress={() => {}}
            >
              <Image source={arrowBlackDownIcon} style={[styles.navIcon, styles.navIconActive]} resizeMode="contain" />
              <Text style={[styles.segText, styles.segTextActive]}>{t('shared.rideHistory.nav.history')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Filtros */}
        <View style={styles.segRail}>
          <TouchableOpacity
            style={[styles.segItem, filter === 'all' && styles.segItemActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.segText, filter === 'all' && styles.segTextActive]}>
              {t('shared.rideHistory.filters.all')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segItem, filter === 'completed' && styles.segItemActive]}
            onPress={() => setFilter('completed')}
          >
            <Text style={[styles.segText, filter === 'completed' && styles.segTextActive]}>
              {t('shared.rideHistory.filters.completed')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segItem, filter === 'canceled' && styles.segItemActive]}
            onPress={() => setFilter('canceled')}
          >
            <Text style={[styles.segText, filter === 'canceled' && styles.segTextActive]}>
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
            <View style={styles.emptyIconWrap}>
              <MaterialIcons name="assignment" size={30} color={colors.textSecondary} />
            </View>
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
    headerArea: {
      marginTop: 60,
      marginHorizontal: 16,
      marginBottom: 8,
      gap: 10,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
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
    },
    backIcon: {
      width: 26,
      height: 26,
    },
    segRail: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      padding: 3,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface || colors.background,
    },
    segItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: 11,
    },
    segItemActive: {
      backgroundColor: colors.primary,
    },
    segText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    segTextActive: {
      color: '#1A1206',
    },
    navIcon: {
      width: 12,
      height: 12,
    },
    navIconInactive: {
      tintColor: colors.text,
    },
    navIconActive: {
      tintColor: '#1A1206',
      transform: [{ rotate: '90deg' }],
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 18,
    },
    rideCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
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
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
      letterSpacing: 0.3,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
    },
    statusPillDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: '700',
    },
    routeContainer: {
      marginBottom: 12,
    },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 20,
    },
    routeMarkerCol: {
      width: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    routeRing: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2.5,
      borderColor: colors.secondary,
    },
    routeStopDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2.5,
      borderColor: colors.warning,
    },
    routeConnector: {
      width: 2,
      height: 14,
      borderRadius: 1,
      backgroundColor: colors.border,
      marginLeft: 8,
      marginVertical: 3,
    },
    locationText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
    },
    statsBand: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface || colors.background,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      marginBottom: 12,
    },
    statItem: {
      flex: 1,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textSecondary,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 3,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    statFare: {
      fontSize: 15,
      fontWeight: '700',
    },
    statTypeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    personRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    personLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    personName: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    ratingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginLeft: 'auto',
    },
    ratingChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    ratingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
    },
    ratingStars: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    rateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 12,
    },
    rateButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#1A1206',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 34,
      marginHorizontal: 16,
      paddingVertical: 40,
      paddingHorizontal: 20,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface || colors.background,
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
    },
  });
