import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DynamicMap from '../../components/map/DynamicMap';
import { MapSkeleton } from '../../components/ui/SkeletonLoader';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useLocation, DRIVER_LOCATION_OPTIONS } from '../../hooks/shared/location/useLocation';
import { useRideData } from '../../hooks/shared/ride/useRideData';
import backgroundLocationService from '../../services/backgroundLocationService';
import { ensureVehicleIconSource, extractVehicleTypeFromInfo } from '../../utils/vehicleIcons';
import { isFollowerWaitingPayment, shouldShowSeparateCrewMarkers } from '../../utils/designatedCrew';

export default function FollowerActiveRideScreen({ route, navigation }: any) {
  const { rideId } = route.params as { rideId: string };
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { coords } = useLocation(DRIVER_LOCATION_OPTIONS);
  const { ride, loading, normalizedStatus } = useRideData(
    rideId,
    t('driver.activeRide.alerts.rideNotFound'),
  );
  const exitedRef = useRef(false);

  const followerStatus = ride?.follower?.status;
  const isMine = ride?.followerId === user?.id;
  const isActive = isMine && followerStatus === 'active';

  useEffect(() => {
    if (!user?.id || !isActive) {
      void backgroundLocationService.updateTrackingRideId(null);
      return;
    }
    (async () => {
      const tracking = await backgroundLocationService.isTrackingActive();
      if (tracking) {
        await backgroundLocationService.updateTrackingRideId(rideId, 'follower');
      } else {
        await backgroundLocationService.startBackgroundLocationTracking(user.id, 'driver', rideId);
        await backgroundLocationService.updateTrackingRideId(rideId, 'follower');
      }
    })();
    return () => {
      void backgroundLocationService.updateTrackingRideId(null);
    };
  }, [rideId, user?.id, isActive]);

  useEffect(() => {
    if (loading || exitedRef.current) return;
    const finished = !ride || !isMine || ['pending_rating', 'rating_completed', 'completed', 'canceled'].includes(normalizedStatus);
    if (finished) {
      exitedRef.current = true;
      navigation.reset({ index: 0, routes: [{ name: 'DriverHome' }] });
    }
  }, [loading, ride, isMine, normalizedStatus, navigation]);

  if (loading || !ride) {
    return (
      <View style={styles.center}>
        <LoadingIcon size={32} color={colors.primary} />
      </View>
    );
  }

  const captainLocation = ride.driverLocation;
  const separate = shouldShowSeparateCrewMarkers(ride);
  const clientVehicleIcon = ensureVehicleIconSource(ride.designatedDriverVehicle || 'auto');
  const arrivalVehicleIcon = ensureVehicleIconSource(extractVehicleTypeFromInfo(user));
  const banner = followerStatus === 'abandoned'
    ? t('driver.crew.follower.abandoned')
    : isFollowerWaitingPayment(normalizedStatus)
      ? t('driver.crew.follower.waitingPayment')
      : t('driver.crew.follower.readOnly');

  return (
    <View style={styles.container}>
      <View style={styles.map}>
        {coords ? (
          <DynamicMap
            latitude={coords.latitude}
            longitude={coords.longitude}
            showMarker
            markerType="car"
            markerPosition={{ latitude: coords.latitude, longitude: coords.longitude }}
            markerVehicleIconSource={arrivalVehicleIcon}
            markerVehicleHeading={typeof coords.heading === 'number' ? coords.heading : undefined}
            nearbyDrivers={
              separate && captainLocation
                ? [{
                    id: 'crew-captain',
                    latitude: captainLocation.latitude,
                    longitude: captainLocation.longitude,
                    heading: captainLocation.heading ?? undefined,
                    vehicleIconSource: clientVehicleIcon,
                  }]
                : []
            }
            originMarker={ride.origin ? { latitude: ride.origin.lat ?? ride.origin.latitude, longitude: ride.origin.lng ?? ride.origin.longitude } : undefined}
            destinationMarker={ride.destination ? { latitude: ride.destination.lat ?? ride.destination.latitude, longitude: ride.destination.lng ?? ride.destination.longitude } : undefined}
          />
        ) : (
          <MapSkeleton />
        )}
      </View>
      <View style={styles.sheet}>
        <View style={styles.row}>
          <Ionicons name="people" size={20} color="#B38737" />
          <Text style={styles.title}>{t('driver.crew.follower.title')}</Text>
        </View>
        <Text style={styles.meta}>{t('driver.crew.follower.captain', { name: ride.driver?.name ?? '' })}</Text>
        <Text style={styles.meta}>{t(`driver.activeRide.status.${normalizedStatus}`, { defaultValue: t('driver.activeRide.status.default') })}</Text>
        <Text style={styles.address} numberOfLines={2}>{ride.origin?.address}</Text>
        <Text style={styles.address} numberOfLines={2}>{ride.destination?.address}</Text>
        <View style={styles.banner}>
          {isFollowerWaitingPayment(normalizedStatus) && <LoadingIcon size={16} color="#241A09" />}
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    map: { flex: 1 },
    sheet: { padding: 20, gap: 8, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.card ?? colors.background },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 17, fontWeight: '700', color: colors.text },
    meta: { fontSize: 14, color: colors.textSecondary },
    address: { fontSize: 14, color: colors.text },
    banner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: '#B38737' },
    bannerText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#241A09' },
  });
