import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { liveTripDocId, sqlRideIdForTrip } from '../../../live/tripIds';
import { mergeName } from '../../../utils/driver/driverInfo';
import { mergeRating } from '../../../utils/ride/rating';
import { FS_COL as FS_COL_V2 } from '../../../constants/firestore';

const EMPTY: Record<string, any> = {};

export interface OfferItem {
  driverId: string;
  offeredPrice?: number;
  status?: 'pending' | 'accepted' | 'rejected';
  estimatedArrivalTime?: string;
  driver: {
    name: string;
    rating: number | null;
    photoURL: string | null;
    vehicle?: any;
  };
}

export function useRideOffers(
  initialRideId: string | null,
  userId: string | undefined,
  serviceAreaId: string | null,
  driverFallbackName: string,
) {
  const inputScope = JSON.stringify([userId, initialRideId]);
  const inputRef = useRef({ scope: inputScope, generation: 0 });
  if (inputRef.current.scope !== inputScope) {
    inputRef.current = { scope: inputScope, generation: inputRef.current.generation + 1 };
  }
  const inputKey = `${inputScope}:${inputRef.current.generation}`;
  const [rideState, setRideState] = useState({ inputKey, rideId: initialRideId });
  const rideId = rideState.inputKey === inputKey ? rideState.rideId : initialRideId;
  const scope = JSON.stringify([userId, rideId]);
  const scopeRef = useRef({ scope, generation: 0 });
  if (scopeRef.current.scope !== scope) {
    scopeRef.current = { scope, generation: scopeRef.current.generation + 1 };
  }
  const [attempt, setAttempt] = useState(0);
  const key = `${scope}:${scopeRef.current.generation}:${attempt}`;
  const [offerState, setOfferState] = useState<{ key: string; data: Record<string, any> }>({ key, data: {} });
  const [driverState, setDriverState] = useState<{ key: string; data: Record<string, any> }>({ key, data: {} });
  const [selection, setSelection] = useState<{ key: string; id: string | null }>({ key, id: null });
  const selectedDriverId = selection.key === key ? selection.id : null;
  const setSelectedDriverId = useCallback((value: React.SetStateAction<string | null>) => {
    setSelection((prev) => {
      const id = typeof value === 'function' ? value(prev.key === key ? prev.id : null) : value;
      return prev.key === key && prev.id === id ? prev : { key, id };
    });
  }, [key]);
  const [loadingState, setLoadingState] = useState({ key, loading: true });
  const loading = loadingState.key === key ? loadingState.loading : true;
  const [errorState, setErrorState] = useState<{ key: string; error: unknown | null }>({ key, error: null });
  const error = errorState.key === key ? errorState.error : null;
  const [snapshotState, setSnapshotState] = useState<{ key: string; data: any | null }>({ key, data: null });
  const rideSnapshot = snapshotState.key === key ? snapshotState.data : null;
  const driversInfo = driverState.key === key ? driverState.data : EMPTY;
  const offersData = offerState.key === key ? offerState.data : EMPTY;
  const driversRaw = useMemo<Record<string, any>>(() => ({}), []);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  // Resolve current rideId if not provided — una sola lectura del shard del
  // área (activeRides tiene .read:false a nivel raíz; la suscripción con
  // off()+setTimeout anterior nunca hacía cleanup y quedaba viva).
  useEffect(() => {
    if (rideId || !userId || !serviceAreaId) return;

    let cancelled = false;
    setLoadingState({ key, loading: true });
    setErrorState({ key, error: null });
    (async () => {
      try {
        const db = await getFirebaseFirestore();
        if (cancelled) return;
        const snap = await getDocs(
          query(collection(db, FS_COL_V2.tripsLive), where('clientId', '==', userId)),
        );
        if (cancelled) return;
        const mine = snap.docs.find((d) =>
          ['requested', 'driver_offered', 'accepted'].includes(d.data()?.status),
        );
        // Preferir el UUID SQL proyectado (rideId) — REST y la query de
        // ofertas lo esperan; trips_live lo resuelve internamente.
        if (mine) {
          setRideState({ inputKey, rideId: mine.data()?.rideId ?? mine.id });
        } else {
          setLoadingState({ key, loading: false });
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[useRideOffers] Error resolviendo rideId activo:', err);
          setErrorState({ key, error: err });
          setLoadingState({ key, loading: false });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [rideId, userId, serviceAreaId, inputKey, key]);

  useEffect(() => {
    let active = true;
    let rideActive = true;
    let offersActive = true;
    let rideReady = false;
    let offersReady = false;
    const setLoading = (loading: boolean) => setLoadingState({ key, loading });
    const cleanup: Array<() => void> = [];
    const profiles = new Map<string, { unsubscribe: () => void }>();
    setSelectedDriverId(null);
    if (!rideId || !userId) {
      return () => { active = false; };
    }
    setLoading(true);
    setErrorState({ key, error: null });
    const stop = () => {
      active = false;
      cleanup.splice(0).forEach((unsub) => unsub());
      const subscriptions = [...profiles.values()];
      profiles.clear();
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
    const fail = (error: unknown) => {
      if (!active) return;
      stop();
      setOfferState({ key, data: {} });
      setDriverState({ key, data: {} });
      setSnapshotState({ key, data: null });
      setErrorState({ key, error });
      setLoading(false);
      console.warn('[useRideOffers] Error escuchando viaje u ofertas:', error);
    };

    (async () => {
      try {
        const db = await getFirebaseFirestore();
        if (!active) return;
        const liveId = await liveTripDocId(rideId);
        if (!active) return;
        const sqlId = await sqlRideIdForTrip(rideId);
        if (!active) return;
        const offersQuery = query(
          collection(db, FS_COL_V2.driverOffers),
          where('clientId', '==', userId),
          where('rideId', '==', sqlId),
        );
        const unsubRide = onSnapshot(doc(db, FS_COL_V2.tripsLive, liveId), (snap) => {
          if (!active || !rideActive) return;
          const data = snap.exists() ? snap.data() : null;
          if (data && data.clientId !== userId) {
            fail(new Error('Trip does not belong to the current client'));
            return;
          }
          setSnapshotState({ key, data: data?.clientId === userId
            ? { id: data.rideId ?? snap.id, liveId: snap.id, ...data } : null });
          rideReady = true;
          if (offersReady) setLoading(false);
        }, (error) => {
          if (!active || !rideActive) return;
          rideActive = false;
          fail(error);
        });
        if (!active) { unsubRide(); return; }
        cleanup.push(unsubRide);
        const unsubOffers = onSnapshot(offersQuery, (snap) => {
          if (!active || !offersActive) return;
          const next: Record<string, any> = {};
          snap.docs.forEach((d) => {
            const data = d.data();
            const driverId = data?.driverId ?? d.id;
            const status = String(data?.status || 'pending').toLowerCase();
            if (!['rejected', 'canceled', 'cancelled', 'expired'].includes(status)) next[driverId] = data;
          });
          const ids = new Set(Object.keys(next));
          for (const [id, subscription] of profiles) {
            if (!ids.has(id)) {
              profiles.delete(id);
              subscription.unsubscribe();
            }
          }
          setDriverState((prev) => ({
            key,
            data: Object.fromEntries(Object.entries(prev.key === key ? prev.data : {}).filter(([id]) => ids.has(id))),
          }));
          for (const id of ids) {
            if (profiles.has(id)) continue;
            const subscription = { unsubscribe: () => {} };
            profiles.set(id, subscription);
            subscription.unsubscribe = onSnapshot(doc(db, FS_COL_V2.driverPublic, id), (profile) => {
              if (!active || profiles.get(id) !== subscription) return;
              setDriverState((prev) => ({
                key,
                data: { ...(prev.key === key ? prev.data : {}), [id]: profile.exists() ? profile.data() : {} },
              }));
            }, (error) => {
              if (!active || profiles.get(id) !== subscription) return;
              profiles.delete(id);
              subscription.unsubscribe();
              setDriverState((prev) => {
                if (prev.key !== key) return prev;
                const { [id]: _removed, ...remaining } = prev.data;
                return { key, data: remaining };
              });
              console.warn('[useRideOffers] Error leyendo perfil:', error);
            });
          }
          setOfferState({ key, data: next });
          offersReady = true;
          if (rideReady) setLoading(false);
        }, (error) => {
          if (!active || !offersActive) return;
          offersActive = false;
          fail(error);
        });
        if (!active) { unsubOffers(); return; }
        cleanup.push(unsubOffers);
      } catch (error) {
        fail(error);
      }
    })();
    return stop;
  }, [rideId, userId, key, setSelectedDriverId]);

  const offers = useMemo<OfferItem[]>(() => Object.entries<any>(offersData).map(([driverId, offer]) => {
    const info = driversInfo[driverId] || {};
    return {
      driverId,
      offeredPrice: offer?.offeredPrice,
      status: offer?.status || 'pending',
      estimatedArrivalTime: offer?.estimatedArrivalTime,
      driver: {
        name: mergeName(driverFallbackName, info, {}, offer?.driver),
        rating: mergeRating(info, {}, offer?.driver ?? offer),
        photoURL: info?.profilePhoto || info?.photoURL || info?.photoUrl || offer?.driver?.photoURL || null,
        vehicle: info?.vehicle || info?.activeVehicle || info?.currentVehicle || offer?.driver?.vehicle || undefined,
      },
    };
  }).sort((a, b) => {
    const sa = a.status === 'accepted' ? 0 : 1;
    const sb = b.status === 'accepted' ? 0 : 1;
    return sa !== sb ? sa - sb : (a.offeredPrice ?? 0) - (b.offeredPrice ?? 0);
  }), [offersData, driversInfo, driverFallbackName]);

  useEffect(() => {
    setSelectedDriverId((prev) => prev && offers.some((offer) => offer.driverId === prev)
      ? prev : offers.find((offer) => offer.status === 'accepted')?.driverId ?? null);
  }, [offers, setSelectedDriverId]);

  const reset = useCallback(() => {
    setRideState({ inputKey, rideId: null });
    setSnapshotState({ key, data: null });
    setOfferState({ key, data: {} });
    setDriverState({ key, data: {} });
    setSelectedDriverId(null);
    setLoadingState({ key, loading: true });
    setErrorState({ key, error: null });
  }, [inputKey, key, setSelectedDriverId]);

  return {
    rideId,
    offers,
    selectedDriverId,
    setSelectedDriverId,
    loading,
    error,
    retry,
    rideSnapshot,
    driversInfo,
    driversRaw,
    reset,
  };
}
