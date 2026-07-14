import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  Image,
  Modal,
  TextInput,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { getDatabase, ref, onValue, get } from 'firebase/database';
import priceNegotiationService from '../../services/priceNegotiationService';
import ridesService, {
  extractRideVehicleTypeForMatching,
  normalizeVehicleTypeForMatching,
  rideMatchesVehicleType,
} from '../../services/ridesService';
import { RideListSkeleton } from '../../components/SkeletonLoader';
import alertService from '../../services/alertService';
import { fetchClientProfile, ClientProfile } from '../../services/clientProfilesService';
import { hasSavedCard } from '../../utils/cardUtils';
import { useLocation } from '../../hooks/useLocation';
import { useAcceptedRideListener } from '../../hooks/useAcceptedRideListener';
import rechargeFundsService from '../../services/rechargeFundsService';
import { getPreflightResult } from '../../state/preflightStore';
import { RIDES_RADIUS_KM } from '../../constants/rideRadius';
import { useTranslation } from 'react-i18next';

const SCREEN_ENTRY_WINDOW_MS = 3000;
let screenEntryCountInWindow = 0;
let screenEntryWindowStartTs = 0;

const DEFAULT_COORDINATE: { lat: number; lng: number } = { lat: 0, lng: 0 };

const normalizeOptionalText = (value: any): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

type RawLocation =
  | { lat?: number; lng?: number; address?: string }
  | { latitude?: number; longitude?: number; address?: string }
  | { coords?: { latitude?: number; longitude?: number; address?: string }; address?: string }
  | undefined
  | null;

const parseCoordinate = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeLocation = (
  raw: RawLocation,
  fallbackLatValues: any[] = [],
  fallbackLngValues: any[] = [],
  fallbackAddress?: string,
): { lat: number; lng: number; address?: string } => {
  let lat: number | null = null;
  let lng: number | null = null;
  let address: string | undefined = fallbackAddress;

  if (raw && typeof raw === 'object') {
    if ('coords' in raw && raw.coords) {
      lat = parseCoordinate(raw.coords?.latitude);
      lng = parseCoordinate(raw.coords?.longitude);
      address = raw.address ?? address;
    } else {
      lat = parseCoordinate((raw as any).lat ?? (raw as any).latitude);
      lng = parseCoordinate((raw as any).lng ?? (raw as any).longitude);
      address = (raw as any).address ?? address;
    }
  }

  if (lat === null) {
    for (const candidate of fallbackLatValues) {
      const parsed = parseCoordinate(candidate);
      if (parsed !== null) {
        lat = parsed;
        break;
      }
    }
  }

  if (lng === null) {
    for (const candidate of fallbackLngValues) {
      const parsed = parseCoordinate(candidate);
      if (parsed !== null) {
        lng = parsed;
        break;
      }
    }
  }

  return {
    lat: lat ?? DEFAULT_COORDINATE.lat,
    lng: lng ?? DEFAULT_COORDINATE.lng,
    address,
  };
};

const normalizeStops = (stops: any[] | undefined | null): Array<{ lat: number; lng: number; address?: string }> => {
  if (!Array.isArray(stops) || stops.length === 0) {
    return [];
  }

  return stops
    .map((stop) =>
      normalizeLocation(stop as RawLocation, [stop?.lat, stop?.latitude], [stop?.lng, stop?.longitude], stop?.address),
    )
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
};

const extractProgrammedRideId = (input: string): string | null => {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const uuidRegex =
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
  const uuidMatch = trimmed.match(uuidRegex);
  if (uuidMatch && uuidMatch[0]) {
    return uuidMatch[0].toLowerCase();
  }

  const genericMatch = trimmed.match(/[A-Za-z0-9_-]{10,}/g);
  if (genericMatch && genericMatch.length) {
    return genericMatch[genericMatch.length - 1];
  }

  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
};
const BACK_ICON = require('../../assets/icons/back_button/back_button2x.png');

const resolveSelectedDriverVehicleType = (driverInfo: any): 'moto' | 'auto' | null => {
  if (!driverInfo || typeof driverInfo !== 'object') {
    return null;
  }

  const selectedVehicleId =
    (typeof driverInfo.vehicle === 'string' ? driverInfo.vehicle : null) ??
    driverInfo?.vehicle?.id ??
    driverInfo?.activeVehicle?.id ??
    null;

  const candidateTypes: Array<string | null | undefined> = [
    driverInfo?.currentVehicle?.type,
    driverInfo?.activeVehicle?.type,
    driverInfo?.vehicle?.type,
    driverInfo?.vehicleType,
    driverInfo?.active_vehicle?.type,
  ];

  if (selectedVehicleId && Array.isArray(driverInfo?.vehicles)) {
    const selectedVehicle = driverInfo.vehicles.find(
      (vehicle: any) => String(vehicle?.id ?? '') === String(selectedVehicleId),
    );
    candidateTypes.push(selectedVehicle?.type);
  } else if (selectedVehicleId && driverInfo?.vehicles && typeof driverInfo.vehicles === 'object') {
    const selectedVehicle = Object.values<any>(driverInfo.vehicles).find(
      (vehicle: any) => String(vehicle?.id ?? '') === String(selectedVehicleId),
    );
    candidateTypes.push(selectedVehicle?.type);
  }

  if (Array.isArray(driverInfo?.vehicles)) {
    const activeVehicle = driverInfo.vehicles.find((vehicle: any) => vehicle?.is_active || vehicle?.isActive);
    candidateTypes.push(activeVehicle?.type);
  } else if (driverInfo?.vehicles && typeof driverInfo.vehicles === 'object') {
    const activeVehicle = Object.values<any>(driverInfo.vehicles).find(
      (vehicle: any) => vehicle?.is_active || vehicle?.isActive,
    );
    candidateTypes.push(activeVehicle?.type);
  }

  for (const candidate of candidateTypes) {
    const normalized = normalizeVehicleTypeForMatching(candidate ?? null);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

interface Ride {
  id: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  origin: { lat: number; lng: number; address?: string };
  destination: { lat: number; lng: number; address?: string };
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedPrice: number;
  status: string;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number | null;
  driverOfferStatus?: string | null;
  passengers?: number;
  rideType?: string;
  vehicleType?: string;
  paymentMethod?: 'cash' | 'card';
  requestedAt: number;
  extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
  waypointsCount?: number;
  hasMultipleDestinations?: boolean;
  clientVehiclePhoto?: string | null;
  clientComment?: string;
}

export default function AvailableRidesScreeNewDesign({ navigation }: any) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { coords } = useLocation();
  const { settings: voiceSettings, speak: speakVoice, stopCategory: stopCategory } = useVoiceAssistant();

  const preflightSummary = getPreflightResult();
  const initialRegion = preflightSummary?.role === 'driver' ? preflightSummary.region : undefined;
  const [serviceAreaId] = useState<string | null>(initialRegion?.serviceAreaId ?? null);

  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [clientProfiles, setClientProfiles] = useState<Record<string, ClientProfile | null>>({});
  const [rechargeFundsSummary, setRechargeFundsSummary] = useState<{ availableBalance: number; blocked: boolean } | null>(
    () => {
      const summary = preflightSummary?.preflightData?.rechargeFunds;
      if (!summary) {
        return null;
      }
      return {
        availableBalance: Number(summary.availableBalance ?? 0),
        blocked: Boolean(summary.blocked),
      };
    },
  );
  const [activeRideGuard, setActiveRideGuard] = useState<{ id: string } | null>(null);
  const isScreenFocusedRef = useRef(false);
  const [photoModalUrl, setPhotoModalUrl] = useState<string | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignRideIdInput, setAssignRideIdInput] = useState('');
  const [assigningProgrammedRide, setAssigningProgrammedRide] = useState(false);
  const [selectedDriverVehicleType, setSelectedDriverVehicleType] = useState<'moto' | 'auto' | null>(null);
  const ridesSnapshotsRef = useRef<Record<string, Record<string, any> | null | undefined>>({});
  const normalizedAssignRideId = useMemo(
    () => extractProgrammedRideId(assignRideIdInput),
    [assignRideIdInput],
  );

  const hasRideEntries = (data: Record<string, any> | null | undefined) =>
    Boolean(data && typeof data === 'object' && Object.keys(data).length > 0);

  useEffect(() => {
    const focusUnsubscribe = navigation.addListener('focus', () => {
      isScreenFocusedRef.current = true;

      const now = Date.now();
      if (!screenEntryWindowStartTs || now - screenEntryWindowStartTs > SCREEN_ENTRY_WINDOW_MS) {
        screenEntryWindowStartTs = now;
        screenEntryCountInWindow = 1;
      } else {
        screenEntryCountInWindow += 1;
      }

      console.log('🟣 [AvailableRidesScreeNewDesign] ENTRADAS AL SCREEN EN VENTANA DE 3s', {
        countInWindow: screenEntryCountInWindow,
        windowStartedAt: screenEntryWindowStartTs,
        now,
        elapsedMsSinceWindowStart: now - screenEntryWindowStartTs,
      });
    });
    const blurUnsubscribe = navigation.addListener('blur', () => {
      isScreenFocusedRef.current = false;
    });

    return () => {
      focusUnsubscribe();
      blurUnsubscribe();
    };
  }, [navigation]);

  useEffect(() => {
    if (!voiceSettings.enabled) return;
    if (!isScreenFocusedRef.current) return;
    if (loading) return;

    const count = rides.length;
    speakVoice(t('driver.available.voice.ridesAvailable', { count }), 'status', undefined, true);
  }, [rides.length, loading, voiceSettings.enabled, speakVoice]);

  useEffect(() => {
    return () => {
      stopCategory('navigation');
      stopCategory('status');
    };
  }, [stopCategory]);

  // Monitorear rides aceptados globalmente
  useAcceptedRideListener(navigation);

  useEffect(() => {
    if (!user?.id) {
      setSelectedDriverVehicleType(null);
      return;
    }

    const db = getDatabase();
    const infoRef = ref(db, `driversInfo/${user.id}`);

    const unsubscribe = onValue(
      infoRef,
      (snapshot) => {
        const info = snapshot.val();
        const resolvedType = resolveSelectedDriverVehicleType(info);
        setSelectedDriverVehicleType(resolvedType);
      },
      (error) => {
        console.warn('[AvailableRides] Error leyendo vehículo activo del conductor:', error);
      },
    );

    return () => unsubscribe();
  }, [user?.id]);

  // 🔒 Guard: Si ya tengo un viaje activo (accepted/driver_on_route/in_progress), redirigir y bloquear esta pantalla
  useEffect(() => {
    if (!user?.id) return;

    const db = getDatabase();
    const path = serviceAreaId ? `activeRidesByArea/${serviceAreaId}` : 'activeRides';
    const activeRef = ref(db, path);

    const unsubscribe = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setActiveRideGuard(null);
        return;
      }

      let found: string | null = null;
      for (const [id, ride] of Object.entries<any>(data)) {
        const status = String(ride?.status || '').toLowerCase();
        if (ride?.driverId === user.id && ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'].includes(status)) {
          found = id;
          break;
        }
      }

      if (found) {
        setActiveRideGuard({ id: found });
        navigation.replace('ActiveRide', { rideId: found });
      } else {
        setActiveRideGuard(null);
      }
    });

    return () => unsubscribe();
  }, [user?.id, navigation, serviceAreaId]);

  const selectSnapshotData = useCallback((): Record<string, any> | null => {
    if (serviceAreaId) {
      const areaKey = `area:${serviceAreaId}`;
      const areaData = ridesSnapshotsRef.current[areaKey];
      if (hasRideEntries(areaData)) {
        return areaData!;
      }
      const globalData = ridesSnapshotsRef.current.global;
      if (hasRideEntries(globalData)) {
        return globalData!;
      }
      if (areaData !== undefined) {
        return areaData ?? null;
      }
      return globalData ?? null;
    }
    return ridesSnapshotsRef.current.global ?? null;
  }, [serviceAreaId]);

  const applySnapshot = useCallback(
    (data: Record<string, any> | null | undefined) => {
      const rideKeys = data ? Object.keys(data) : [];
      console.log('📦 [AvailableRides] Snapshot recibido', {
        totalKeys: rideKeys.length,
        keysPreview: rideKeys.slice(0, 5),
      });

      if (!data) {
        setRides([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const availableRides: Ride[] = [];

      Object.entries(data).forEach(([rideId, rideData]: [string, any]) => {
        const statusRaw = typeof rideData?.status === 'string' ? rideData.status.trim().toLowerCase() : '';
        const driverId = rideData?.driverId ?? rideData?.driver_id ?? null;

        const isCancelled =
          statusRaw.startsWith('cancel') ||
          statusRaw === 'cancelled' ||
          Boolean(rideData?.cancelReason) ||
          rideData?.paymentCanceled === true ||
          rideData?.cancelled === true ||
          rideData?.canceled === true;
        if (isCancelled) {
          console.log('⏭️ [AvailableRides] Ride omitido (cancelado)', rideId, {
            statusRaw,
            driverId,
            cancelReason: rideData?.cancelReason,
            paymentCanceled: rideData?.paymentCanceled,
          });
          return;
        }

        const isRequested = statusRaw === 'requested' && !driverId;
        const isNegotiatingWithMe = Boolean(user?.id) && driverId === user?.id && ['pending_confirm', 'driver_assigned'].includes(statusRaw);

        if (!(isRequested || isNegotiatingWithMe)) {
          console.log('⏭️ [AvailableRides] Ride omitido (no elegible)', rideId, {
            statusRaw,
            driverId,
            userId: user?.id,
            isRequested,
            isNegotiatingWithMe,
          });
          return;
        }

        const rideVehicleType = extractRideVehicleTypeForMatching(rideData);
        const vehicleTypeMatches = rideMatchesVehicleType(rideData, selectedDriverVehicleType);
        if (!vehicleTypeMatches) {
          console.log('⏭️ [AvailableRides] Ride omitido (vehicleType no coincide)', rideId, {
            selectedDriverVehicleType,
            rideVehicleType,
            rideVehicleTypeRaw: rideData?.vehicleType ?? rideData?.vehicle_type ?? rideData?.vehicle?.type ?? null,
            serviceId: rideData?.serviceId ?? rideData?.service_id ?? null,
          });
          return;
        }

        const offers = rideData.offers || {};
        const myOffer = user?.id ? offers[user.id] : null;

        const origin = normalizeLocation(
          rideData.origin as RawLocation,
          [rideData.originLat, rideData.originLatitude, rideData.pickupLat, rideData.pickupLatitude],
          [rideData.originLng, rideData.originLongitude, rideData.pickupLng, rideData.pickupLongitude],
          rideData.originAddress,
        );
        const destination = normalizeLocation(
          rideData.destination as RawLocation,
          [rideData.destinationLat, rideData.destinationLatitude, rideData.dropoffLat, rideData.dropoffLatitude],
          [rideData.destinationLng, rideData.destinationLongitude, rideData.dropoffLng, rideData.dropoffLongitude],
          rideData.destinationAddress,
        );

        const extraStops = normalizeStops(rideData.extraDestinations || rideData.extra_stops || rideData.additionalStops);

        const requestedAtRaw = rideData.requestedAt ?? rideData.createdAt ?? rideData.created_at ?? Date.now();
        const requestedAt = typeof requestedAtRaw === 'number' ? requestedAtRaw : parseInt(requestedAtRaw, 10) || 0;

        // Filtrar por radio de búsqueda del conductor si tenemos coordenadas válidas
        const driverLat = coords?.latitude ?? null;
        const driverLng = coords?.longitude ?? null;

        if (
          driverLat !== null &&
          driverLng !== null &&
          Number.isFinite(origin.lat) &&
          Number.isFinite(origin.lng)
        ) {
          const distanceKm = haversineKm(driverLat, driverLng, origin.lat, origin.lng);
          if (!Number.isFinite(distanceKm) || distanceKm > RIDES_RADIUS_KM) {
            console.log('⏭️ [AvailableRides] Ride omitido (fuera de radio)', rideId, {
              distanceKm,
              RIDES_RADIUS_KM,
            });
            return;
          }
        }

        availableRides.push({
          id: rideId,
          clientId: rideData.clientId || '',
          clientName: rideData.clientName || rideData.client?.name || rideData.clientInfo?.name,
          clientPhone: rideData.clientPhone || rideData.client?.phone || rideData.clientInfo?.phone,
          origin,
          destination,
          estimatedDistance: rideData.estimatedDistance || 0,
          estimatedDuration: rideData.estimatedDuration || 0,
          estimatedPrice: rideData.estimatedPrice || 0,
          status: statusRaw || 'requested',
          clientSuggestedPrice: rideData.clientSuggestedPrice,
          driverOfferedPrice: myOffer?.offeredPrice ?? null,
          driverOfferStatus: myOffer?.status ?? null,
          passengers: rideData.passengers || 1,
          rideType: rideData.rideType || 'normal',
          vehicleType: rideVehicleType ?? undefined,
          paymentMethod: rideData.paymentMethod,
          requestedAt,
          extraDestinations: extraStops,
          waypointsCount: rideData.waypointsCount || extraStops.length || 0,
          hasMultipleDestinations: rideData.hasMultipleDestinations || extraStops.length > 0,
          clientVehiclePhoto: rideData.clientVehiclePhoto || null,
          clientComment: normalizeOptionalText(rideData.clientComment ?? rideData.comment ?? rideData.notes),
        });
        console.log('✅ [AvailableRides] Ride agregado a lista', rideId, {
          statusRaw,
          driverId,
          isRequested,
          isNegotiatingWithMe,
          negotiationStatus: rideData?.negotiationStatus,
        });
      });

      availableRides.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));

      setRides(availableRides);
      setSelectedRideId((current) => (current && availableRides.some((ride) => ride.id === current) ? current : null));
      setLoading(false);
      setRefreshing(false);
    },
    [user?.id, coords?.latitude, coords?.longitude, selectedDriverVehicleType],
  );

  const applySnapshotRef = useRef(applySnapshot);
  useEffect(() => {
    applySnapshotRef.current = applySnapshot;
  }, [applySnapshot]);

  const selectSnapshotDataRef = useRef(selectSnapshotData);
  useEffect(() => {
    selectSnapshotDataRef.current = selectSnapshotData;
  }, [selectSnapshotData]);

  useEffect(() => {
    applySnapshot(selectSnapshotData());
  }, [applySnapshot, selectSnapshotData, selectedDriverVehicleType]);

  useEffect(() => {
    const db = getDatabase();
    const pathConfigs = serviceAreaId
      ? [
          { key: `area:${serviceAreaId}`, path: `activeRidesByArea/${serviceAreaId}` },
          { key: 'global', path: 'activeRides' },
        ]
      : [{ key: 'global', path: 'activeRides' }];

    const unsubscribes = pathConfigs.map(({ key, path }) => {
      const ridesRef = ref(db, path);
      return onValue(
        ridesRef,
        (snapshot) => {
          const raw = snapshot.val();
          const normalized = raw && typeof raw === 'object' ? raw : null;
          ridesSnapshotsRef.current[key] = normalized;
          const selector = selectSnapshotDataRef.current;
          const handler = applySnapshotRef.current;
          if (handler && selector) {
            handler(selector());
          }
        },
        (error) => {
          console.error(`❌ [AvailableRides] Error escuchando ${path}:`, error);
          ridesSnapshotsRef.current[key] = null;
          const selector = selectSnapshotDataRef.current;
          const handler = applySnapshotRef.current;
          if (handler && selector) {
            handler(selector());
          }
          setLoading(false);
          setRefreshing(false);
        },
      );
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // ignore
        }
      });
    };
  }, [navigation, serviceAreaId]);

  // ✅ Realtime DB: resumen de fondos del conductor
  useEffect(() => {
    if (!user?.id) return;
    const db = getDatabase();
    const walletRef = ref(db, `drivers/${user.id}/wallet`);
    let active = true;

    const unsubscribe = onValue(
      walletRef,
      (snapshot) => {
        if (!active) return;
        const data = snapshot.val() || {};
        const availableBalance = Number(
          data.availableBalance ?? data.balance ?? data.currentBalance ?? data.currentRechargeBalance ?? 0,
        );
        setRechargeFundsSummary({
          availableBalance: Number.isFinite(availableBalance) ? availableBalance : 0,
          blocked: Boolean(data.blocked) || Number(availableBalance || 0) <= 0,
        });
      },
      (err) => {
        console.error('❌ [AvailableRidesScreeNewDesign] Error escuchando wallet del conductor:', err);
      },
    );

    const navUnsubscribe = navigation?.addListener?.('focus', async () => {
      try {
        const summary = await rechargeFundsService.getSummary(10);
        setRechargeFundsSummary({
          availableBalance: Number(summary.availableBalance || 0),
          blocked: Boolean(summary.blocked),
        });
      } catch (error) {
        console.warn('⚠️ [AvailableRidesScreeNewDesign] No se pudo refrescar resumen de fondos:', error);
      }
    });

    return () => {
      active = false;
      unsubscribe();
      navUnsubscribe?.();
    };
  }, [navigation, user?.id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const db = getDatabase();
      const pathConfigs = serviceAreaId
        ? [
            { key: `area:${serviceAreaId}`, path: `activeRidesByArea/${serviceAreaId}` },
            { key: 'global', path: 'activeRides' },
          ]
        : [{ key: 'global', path: 'activeRides' }];

      await Promise.all(
        pathConfigs.map(async ({ key, path }) => {
          const ridesRef = ref(db, path);
          const snapshot = await get(ridesRef);
          const raw = snapshot.val();
          ridesSnapshotsRef.current[key] = raw && typeof raw === 'object' ? raw : null;
        }),
      );
      applySnapshot(selectSnapshotData());
    } catch (error) {
      console.error('❌ [AvailableRides] Error refrescando manualmente:', error);
    } finally {
      setRefreshing(false);
    }
  }, [applySnapshot, selectSnapshotData, serviceAreaId]);

  const ensureCardForCardPayments = async (ride: Ride): Promise<boolean> => {
    const ridePaymentMethod = ride?.paymentMethod || ride?.rideType;
    if ((ridePaymentMethod || '').toLowerCase() !== 'card') {
      return true;
    }

    if (await hasSavedCard()) {
      return true;
    }

    alertService.showConfirmAlert(
      t('driver.available.alerts.cardRequiredTitle'),
      t('driver.available.alerts.cardRequiredBody'),
      () => {
        // navigation.navigate('PaymentMethods');
      },
      undefined,
      t('driver.available.alerts.cardRequiredConfirm'),
      t('driver.available.alerts.cardRequiredCancel'),
    );

    return false;
  };

  const handleAcceptRide = async (ride: Ride) => {
    try {
      if (!rideMatchesVehicleType(ride, selectedDriverVehicleType)) {
        alertService.showErrorAlert(t('driver.available.alerts.errorAcceptRide'));
        return;
      }

      // 🔒 Bloquear aceptar si ya tengo un viaje activo
      if (activeRideGuard) {
        alertService.showInfoAlert(
          t('driver.available.alerts.activeRideTitle'),
          t('driver.available.alerts.activeRideBody'),
          () => navigation.replace('ActiveRide', { rideId: activeRideGuard.id })
        );
        return;
      }

      // ✅ Bloquear aceptar si no hay fondos disponibles
      if (rechargeFundsSummary && (Number(rechargeFundsSummary.availableBalance) <= 0 || rechargeFundsSummary.blocked)) {
        const currentBalance = Number(rechargeFundsSummary.availableBalance || 0).toFixed(2);
        alertService.showInfoAlert(
          t('driver.available.alerts.rechargeRequiredTitle'),
          t('driver.available.alerts.rechargeRequiredBody', { amount: currentBalance }),
          () => navigation.navigate('RechargeFunds'),
        );
        return;
      }

      if (!(await ensureCardForCardPayments(ride))) {
        return;
      }

      if (
        (typeof ride.clientSuggestedPrice === 'number' &&
          Number.isFinite(ride.clientSuggestedPrice) &&
          ride.clientSuggestedPrice > 0) ||
        (typeof ride.estimatedPrice === 'number' &&
          Number.isFinite(ride.estimatedPrice) &&
          ride.estimatedPrice > 0)
      ) {
        try {
          const priceToShow =
            typeof ride.clientSuggestedPrice === 'number' &&
            Number.isFinite(ride.clientSuggestedPrice) &&
            ride.clientSuggestedPrice > 0
              ? ride.clientSuggestedPrice
              : ride.estimatedPrice;

          await priceNegotiationService.acceptClientPrice(ride.id);

          alertService.showSuccessAlert(
            t('driver.available.alerts.offerSentTitle'),
            t('driver.available.alerts.offerAcceptedBody', { amount: Number(priceToShow).toFixed(2) }),
          );

          navigation.replace('WaitingClientConfirmation', {
            rideId: ride.id,
            clientId: ride.clientId,
            origin: ride.origin,
            destination: ride.destination,
            estimatedFare: ride.clientSuggestedPrice,
            extraDestinations: (ride.extraDestinations || []).map((stop) => ({
              lat: stop.lat,
              lng: stop.lng,
              address: stop.address,
            })),
          });
        } catch (error: any) {
          console.error('❌ Error completo:', error);
          alertService.showErrorAlert(error?.message || t('driver.available.alerts.errorSendOffer'));
        }
      } else {
        try {
          const acceptData = {
            driverId: user?.id || '',
            vehicleId: 'temp-vehicle-id',
            currentLocation: { lat: 0, lng: 0 },
          };

          await ridesService.acceptRide(ride.id, acceptData);

          alertService.showSuccessAlert(
            t('driver.available.alerts.offerSentTitle'),
            t('driver.available.alerts.offerGenericBody'),
          );

          navigation.replace('WaitingClientConfirmation', {
            rideId: ride.id,
            clientId: ride.clientId,
            origin: ride.origin,
            destination: ride.destination,
            estimatedFare: ride.estimatedPrice,
            extraDestinations: (ride.extraDestinations || []).map((stop) => ({
              lat: stop.lat,
              lng: stop.lng,
              address: stop.address,
            })),
          });
        } catch (error: any) {
          alertService.showErrorAlert(error?.message || t('driver.available.alerts.errorAcceptRide'));
        }
      }
    } catch (error: any) {
      alertService.showErrorAlert(error?.message || t('driver.available.alerts.errorAcceptRide'));
    }
  };

  const groupedRides = useMemo(() => {
    const designated: Ride[] = [];
    const standard: Ride[] = [];

    rides.forEach((ride) => {
      if ((ride.rideType || '').toLowerCase() === 'designated_driver') {
        designated.push(ride);
      } else {
        standard.push(ride);
      }
    });

    return { designated, standard };
  }, [rides]);

  type SectionItem = { id: string; type: 'section' };
  type RideListItem = Ride | SectionItem;

  const listData = useMemo<RideListItem[]>(() => {
    const items: RideListItem[] = [...groupedRides.standard];
    if (groupedRides.designated.length > 0) {
      items.push({ id: 'section-designated', type: 'section' });
      items.push(...groupedRides.designated);
    }
    return items;
  }, [groupedRides]);

  useEffect(() => {
    const missingClientIds = rides
      .map((ride) => ride.clientId)
      .filter((id): id is string => Boolean(id) && !(id in clientProfiles));

    if (missingClientIds.length === 0) {
      return;
    }

    let cancelled = false;

    const loadProfiles = async () => {
      const entries: Array<[string, ClientProfile | null]> = await Promise.all(
        missingClientIds.map(async (clientId) => {
          try {
            const profile = await fetchClientProfile(clientId);
            return [clientId, profile ?? null];
          } catch (error) {
            console.warn('[AvailableRides] Error cargando perfil de cliente', clientId, error);
            return [clientId, null];
          }
        })
      );

      if (!cancelled && entries.length) {
        setClientProfiles((prev) => {
          const next = { ...prev };
          entries.forEach(([id, profile]) => {
            next[id] = profile;
          });
          return next;
        });
      }
    };

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [rides, clientProfiles]);

  const handleSelectRide = (rideId: string) => {
    setSelectedRideId((current) => (current === rideId ? null : rideId));
  };

  const handleViewRideDetails = (ride: Ride) => {
    if (typeof navigation?.navigate !== 'function') {
      return;
    }

    const originLat = ride.origin?.lat ?? 0;
    const originLng = ride.origin?.lng ?? 0;
    const destinationLat = ride.destination?.lat ?? 0;
    const destinationLng = ride.destination?.lng ?? 0;

    const payload = {
      id: ride.id,
      clientId: ride.clientId,
      clientName: ride.clientName,
      clientPhone: ride.clientPhone,
      origin: {
        lat: originLat,
        lng: originLng,
        address: ride.origin?.address || t('driver.available.rideCard.placeholders.originAddress'),
      },
      destination: {
        lat: destinationLat,
        lng: destinationLng,
        address: ride.destination?.address || t('driver.available.rideCard.placeholders.destinationAddress'),
      },
      extraDestinations: (ride.extraDestinations || []).map((stop) => ({
        lat: stop.lat,
        lng: stop.lng,
        address: stop.address,
      })),
      estimatedPrice: ride.estimatedPrice || 0,
      estimatedDistance: ride.estimatedDistance,
      estimatedDuration: ride.estimatedDuration,
      clientSuggestedPrice: ride.clientSuggestedPrice,
      driverOfferedPrice: ride.driverOfferedPrice,
      paymentMethod: ride.paymentMethod,
      rideType: ride.rideType,
      clientVehiclePhoto: ride.clientVehiclePhoto || null,
      clientComment: ride.clientComment,
    };

    navigation.navigate('RidePreview', { ride: payload });
  };

  const getInitials = (name?: string, fallback: string = 'CL') => {
    if (!name) return fallback;
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  const haversineKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const R = 6371; // km
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const renderRideItem = ({ item }: { item: RideListItem }) => {
    if ((item as any).type === 'section') {
      return (
        <View
          style={[
            styles.designatedSection,
            isDark ? styles.designatedSectionDark : styles.designatedSectionLight,
          ]}
        >
          <Text style={styles.sectionLabel}>{t('driver.available.sections.designatedTitle')}</Text>
          <Text style={[styles.sectionSubLabel, { color: colors.text + '99' }]}>
            {t('driver.available.sections.designatedSubtitle')}
          </Text>
        </View>
      );
    }

    const ride = item as Ride;
    const profile = ride.clientId ? clientProfiles[ride.clientId] : undefined;
    const name = profile?.fullName || ride.clientName || t('driver.available.rideCard.clientFallback');
    const photoUrl = profile?.photoUrl || null;

    const originLat = ride?.origin?.lat ?? 0;
    const originLng = ride?.origin?.lng ?? 0;
    const destLat = ride?.destination?.lat ?? 0;
    const destLng = ride?.destination?.lng ?? 0;

    const originAddress = ride?.origin?.address || `${originLat.toFixed(4)}, ${originLng.toFixed(4)}`;
    const destinationAddress = ride?.destination?.address || `${destLat.toFixed(4)}, ${destLng.toFixed(4)}`;

    const price = ride.clientSuggestedPrice ?? ride.estimatedPrice ?? 0;
    const stopsCount = (ride.extraDestinations || []).length;
    const isDesignatedRide = (ride.rideType || '').toLowerCase() === 'designated_driver';
    const clientVehiclePhoto = ride.clientVehiclePhoto;

    // Distancia y ETA del conductor al origen del viaje
    const driverLat = coords?.latitude ?? null;
    const driverLng = coords?.longitude ?? null;
    const distanceToOriginKm =
      driverLat !== null && driverLng !== null
        ? haversineKm(driverLat, driverLng, originLat, originLng)
        : 0;
    const AVERAGE_SPEED_KMH = 28; // velocidad urbana estimada
    const etaToOriginMin = distanceToOriginKm > 0 ? Math.max(1, Math.round((distanceToOriginKm / AVERAGE_SPEED_KMH) * 60)) : 0;

    const isSelected = selectedRideId === ride.id;

    return (
      <Pressable
        style={[
          styles.rideCard,
          isDark ? styles.rideCardDark : styles.rideCardLight,
          isDesignatedRide && (isDark ? styles.designatedCardDark : styles.designatedCard),
          isSelected && styles.selectedCardHighlight,
        ]}
        onPress={() => handleSelectRide(ride.id)}
      >
        <View style={styles.cardRow}>
          <View
            style={[
              styles.avatarPlaceholder,
              isDark ? styles.avatarPlaceholderDark : styles.avatarPlaceholderLight,
            ]}
          >
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarInitials, { color: colors.text }]}>
                {getInitials(name, t('driver.available.rideCard.initialFallback'))}
              </Text>
            )}
          </View>

          <View style={styles.detailsColumn}>
            <View
              style={[
                styles.distancePill,
                isDark ? styles.distancePillDark : styles.distancePillLight,
              ]}
            >
              <Text style={[styles.distancePillText, { color: isDark ? '#FFD666' : '#5D4B00' }]}>
                {distanceToOriginKm > 0
                  ? t('driver.available.rideCard.distanceToOrigin', { distance: distanceToOriginKm.toFixed(1) })
                  : t('driver.available.rideCard.calculating')}
              </Text>
            </View>
            <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
              {t('driver.available.rideCard.origin', { address: originAddress })}
            </Text>
            <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
              {t('driver.available.rideCard.destination', { address: destinationAddress })}
            </Text>
            {stopsCount > 0 ? (
              <Text style={[styles.detailLine, { color: colors.text + '99' }]} numberOfLines={1}>
                {t('driver.available.rideCard.stops', { count: stopsCount })}
              </Text>
            ) : null}
            {ride.clientComment ? (
              <Text style={[styles.detailLine, { color: colors.text + 'B3' }]} numberOfLines={2}>
                {`Nota: ${ride.clientComment}`}
              </Text>
            ) : null}
            <Text style={[styles.detailLine, styles.priceLine, { color: colors.text + 'B3' }]} numberOfLines={1}>
              {t('driver.available.rideCard.price', { amount: Number(price).toFixed(2) })}
            </Text>

            <View style={styles.cardBottomRow}>
              <Text style={[styles.distanceSubLabel, { color: colors.text + '99' }]}>
                {distanceToOriginKm > 0 ? t('driver.available.rideCard.etaToOrigin', { minutes: etaToOriginMin }) : ''}
              </Text>
              <View style={styles.metaActions}>
                {isDesignatedRide && clientVehiclePhoto ? (
                  <TouchableOpacity
                    style={[styles.vehicleButton, { borderColor: colors.primary }]}
                    onPress={() => setPhotoModalUrl(clientVehiclePhoto)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.vehicleButtonText, { color: colors.primary }]}>
                      {t('driver.available.rideCard.viewVehicle')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {isSelected && (
                  <TouchableOpacity
                    onPress={() => handleViewRideDetails(ride)}
                    style={[styles.viewButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.viewButtonText}>{t('driver.available.rideCard.view')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <View style={[styles.header, { borderBottomColor: colors.border }]}> 
        <TouchableOpacity
          style={[
            styles.backButton,
            isDark ? styles.backButtonDark : styles.backButtonLight,
            { borderColor: isDark ? '#343434' : '#E8E8E8' },
          ]}
          onPress={() => navigation.goBack?.()}
          activeOpacity={0.8}
        > 
          <View style={[styles.backButtonInner, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF' }]}>
            <Image source={BACK_ICON} style={[styles.backIconImage, { tintColor: isDark ? '#FFFFFF' : colors.text }]} resizeMode="contain" />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('driver.available.header.title')}</Text>
      </View>

      <View style={styles.assignBar}>
        <TouchableOpacity
          style={[
            styles.assignButton,
            {
              borderColor: colors.border,
              backgroundColor: isDark ? '#212121' : '#FFFFFF',
              shadowColor: isDark ? '#000000' : '#B87F1E',
            },
          ]}
          onPress={() => {
            setAssignRideIdInput('');
            setAssignModalVisible(true);
          }}
          activeOpacity={0.85}
        >
          <View style={styles.assignButtonContent}>
            <View style={[styles.assignButtonAccent, { backgroundColor: colors.primary }]} />
            <Text style={[styles.assignButtonText, { color: colors.text }]}>
              {t('driver.available.assignModal.assignProgrammedButton')}
            </Text>
            <View style={[styles.assignButtonPlus, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F4EFE4' }]}>
              <Text style={[styles.assignButtonPlusText, { color: colors.primary }]}>+</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <FlatList
        data={listData}
        renderItem={renderRideItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, listData.length === 0 && styles.listContentEmpty]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={loading ? (
          <RideListSkeleton />
        ) : (
          <View
            style={[
              styles.emptyStateCard,
              {
                backgroundColor: isDark ? '#1D1D1D' : '#FFFFFF',
                borderColor: isDark ? '#333333' : '#E9E9E9',
              },
            ]}
          >
            <View style={[styles.emptyStateGlow, { backgroundColor: isDark ? 'rgba(212,175,55,0.18)' : '#F9EDCC' }]} />
            <Text style={styles.emptyStateIcon}>🚗</Text>
            <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
              {t('common.components.emptyState.noRides.title')}
            </Text>
            <Text style={[styles.emptyStateMessage, { color: colors.text + '99' }]}>
              {t('common.components.emptyState.noRides.message')}
            </Text>
            <TouchableOpacity
              onPress={handleRefresh}
              style={[styles.emptyStateButton, { backgroundColor: colors.primary }]}
              activeOpacity={0.86}
            >
              <Text style={styles.emptyStateButtonText}>{t('common.components.emptyState.noRides.action')}</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={!!photoModalUrl} transparent animationType="fade" onRequestClose={() => setPhotoModalUrl(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#1F1F1F' : '#FFFFFF' }]}
          >
            <Image
              source={{ uri: photoModalUrl || undefined }}
              style={styles.modalImage}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={[styles.closeModalButton, { backgroundColor: colors.primary }]}
              onPress={() => setPhotoModalUrl(null)}
            >
              <Text style={styles.closeModalText}>{t('driver.available.modal.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={assignModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!assigningProgrammedRide) {
            setAssignModalVisible(false);
          }
        }}
      >
        <View style={styles.assignOverlay}>
          <View
            style={[
              styles.assignModalCard,
              {
                backgroundColor: isDark ? '#1F1F1F' : '#FFFFFF',
                borderColor: isDark ? '#353535' : '#E9E0CF',
              },
            ]}
          >
            <View style={[styles.assignModalTopAccent, { backgroundColor: colors.primary }]} />
            <Text style={[styles.assignModalTitle, { color: colors.text }]}>
              {t('driver.available.assignModal.title')}
            </Text>
            <Text style={[styles.assignModalSubtitle, { color: colors.text + '99' }]}>
              {t('driver.available.assignModal.subtitle')}
            </Text>
            <View
              style={[
                styles.assignInputWrap,
                {
                  borderColor: colors.border,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                },
              ]}
            >
              <Text style={[styles.assignInputLabel, { color: colors.text + 'AA' }]}>Ride ID</Text>
              <TextInput
                value={assignRideIdInput}
                onChangeText={setAssignRideIdInput}
                placeholder={t('driver.available.assignModal.placeholder')}
                placeholderTextColor={colors.text + '66'}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!assigningProgrammedRide}
                style={[
                  styles.assignInput,
                  {
                    color: colors.text,
                  },
                ]}
              />
            </View>

            <View style={styles.assignActionsRow}>
              <TouchableOpacity
                style={[styles.assignActionButton, styles.assignCancelButton, { borderColor: colors.border }]}
                disabled={assigningProgrammedRide}
                onPress={() => setAssignModalVisible(false)}
              >
                <Text style={[styles.assignActionText, { color: colors.text }]}>{t('driver.available.assignModal.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.assignActionButton, { backgroundColor: colors.primary }]}
                disabled={assigningProgrammedRide || !normalizedAssignRideId}
                onPress={async () => {
                  const rideId = normalizedAssignRideId;
                  if (!rideId) {
                    alertService.showErrorAlert(t('driver.available.alerts.assignInvalidId'));
                    return;
                  }

                  setAssigningProgrammedRide(true);
                  try {
                    const result = await ridesService.assignDriverToProgrammedRide(rideId);
                    if (!result?.success) {
                      throw new Error(result?.message || 'No se pudo asignar el viaje programado.');
                    }
                    alertService.showSuccessAlert(
                      t('driver.available.alerts.assignSuccessTitle'),
                      t('driver.available.alerts.assignSuccessBody'),
                      {
                        duration: 3500,
                      },
                    );
                    setAssignModalVisible(false);
                    setAssignRideIdInput('');
                  } catch (err: any) {
                    alertService.showErrorAlert(
                      err?.message || t('driver.available.alerts.assignError'),
                    );
                  } finally {
                    setAssigningProgrammedRide(false);
                  }
                }}
              >
                <Text style={styles.assignActionTextPrimary}>
                  {assigningProgrammedRide
                    ? t('driver.available.assignModal.assigning')
                    : t('driver.available.assignModal.confirm')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  assignBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  assignButton: {
    borderWidth: 1,
    borderRadius: 17,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  assignButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  assignButtonAccent: {
    width: 5,
    height: 24,
    borderRadius: 99,
  },
  assignButtonText: {
    flex: 1,
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'left',
    letterSpacing: -0.1,
  },
  assignButtonPlus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignButtonPlusText: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 21,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 20,
  },
  backButton: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  backButtonLight: {
    backgroundColor: '#F6F6F6',
  },
  backButtonDark: {
    backgroundColor: '#242424',
  },
  backButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIconImage: {
    width: 16,
    height: 16,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    marginRight: 40,
    letterSpacing: -0.3,
  },
  designatedSection: {
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  designatedSectionLight: {
    backgroundColor: '#FFF7E5',
    borderColor: '#F5D38C',
  },
  designatedSectionDark: {
    backgroundColor: 'rgba(209,138,27,0.15)',
    borderColor: '#D18A1B',
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D18A1B',
  },
  sectionSubLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  rideCard: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  rideCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E5E5',
  },
  rideCardDark: {
    backgroundColor: '#1F1F1F',
    borderColor: '#303030',
    shadowOpacity: 0.2,
  },
  designatedCard: {
    borderColor: '#E3C580',
    backgroundColor: '#FFF9F0',
  },
  designatedCardDark: {
    borderColor: '#D4AF37',
    backgroundColor: '#2B2007',
  },
  selectedCardHighlight: {
    borderColor: '#D4AF37',
    borderWidth: 1.5,
    shadowColor: '#D4AF37',
    shadowOpacity: 0.2,
    elevation: 3,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 13,
  },
  avatarPlaceholderLight: {
    backgroundColor: '#F2F2F2',
  },
  avatarPlaceholderDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatarInitials: {
    fontSize: 17,
    fontWeight: '700',
  },
  detailsColumn: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 1,
    marginTop: 1,
    letterSpacing: -0.2,
  },
  detailLine: {
    fontSize: 14,
    lineHeight: 17,
  },
  priceLine: {
    marginTop: 1,
  },
  cardBottomRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  metaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 1,
    gap: 8,
  },
  distancePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 2,
  },
  distancePillLight: {
    backgroundColor: '#FFF1CC',
  },
  distancePillDark: {
    backgroundColor: 'rgba(212,175,55,0.25)',
  },
  distancePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  distanceSubLabel: {
    fontSize: 11,
    flex: 1,
    fontWeight: '600',
  },
  viewButton: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderWidth: 1,
  },
  vehicleButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 5,
    backgroundColor: 'transparent',
  },
  vehicleButtonText: {
    fontWeight: '700',
    fontSize: 12,
  },
  viewButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyStateCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 22,
    alignItems: 'center',
    overflow: 'hidden',
  },
  emptyStateGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    top: -55,
    right: -35,
  },
  emptyStateIcon: {
    fontSize: 52,
    marginBottom: 8,
  },
  emptyStateTitle: {
    fontSize: 31,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  emptyStateMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
    maxWidth: 300,
  },
  emptyStateButton: {
    borderRadius: 14,
    paddingHorizontal: 26,
    paddingVertical: 11,
    minWidth: 130,
    alignItems: 'center',
  },
  emptyStateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  modalImage: {
    width: '100%',
    height: 320,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#000',
  },
  closeModalButton: {
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  closeModalText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },

  assignOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  assignModalCard: {
    width: '100%',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  assignModalTopAccent: {
    alignSelf: 'center',
    width: 56,
    height: 4,
    borderRadius: 99,
    marginBottom: 12,
  },
  assignModalTitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  assignModalSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 14,
  },
  assignInputWrap: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 8,
  },
  assignInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  assignInput: {
    paddingVertical: 0,
    fontSize: 14,
  },
  assignActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  assignActionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignCancelButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  assignActionText: {
    fontWeight: '800',
    fontSize: 14,
  },
  assignActionTextPrimary: {
    fontWeight: '800',
    fontSize: 14,
    color: '#FFFFFF',
  },
});
