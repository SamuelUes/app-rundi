import { useEffect, useRef, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import { changePaymentMethod as changePaymentMethodV2 } from '../../../api/payments';
import { liveTripDocId } from '../../../live/tripIds';

interface UsePaymentMethodListenerOptions {
  rideId: string;
  isPendingPayment: boolean;
  onMethodChange?: (newMethod: string) => void;
}

export function usePaymentMethodListener({
  rideId,
  isPendingPayment,
  onMethodChange,
}: UsePaymentMethodListenerOptions) {
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState<string>('cash');
  const currentPaymentMethodRef = useRef<string>('cash');
  const isNavigatingRef = useRef(false);
  const [changingPaymentMethod, setChangingPaymentMethod] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    const setup = async () => {
      try {
        const db = await getFirebaseFirestore();
        if (cancelled) return;

        const handleMethodChange = (newMethod?: string) => {
          if (isPendingPayment) {
            currentPaymentMethodRef.current = 'cash';
            setCurrentPaymentMethod('cash');
            isNavigatingRef.current = false;
            return;
          }

          if (!newMethod) return;
          const normalizedMethod: 'card' | 'cash' =
            newMethod === 'card' || newMethod === 'card_local' ? 'card' : 'cash';

          if (normalizedMethod === currentPaymentMethodRef.current) {
            isNavigatingRef.current = false;
            return;
          }

          currentPaymentMethodRef.current = normalizedMethod;
          setCurrentPaymentMethod(normalizedMethod);
          onMethodChange?.(normalizedMethod);
        };

        const unsubTrip = onSnapshot(
          doc(db, FS_COL.tripsLive, await liveTripDocId(rideId)),
          (snap) => {
            const data = snap.data();
            handleMethodChange(data?.paymentType ?? data?.paymentMethod);
          },
          (err) => console.warn('[usePaymentMethodListener] trips_live:', err),
        );

        const unsubPayment = onSnapshot(
          doc(db, FS_COL.paymentsLive, await liveTripDocId(rideId)),
          (snap) => {
            const data = snap.data();
            handleMethodChange(data?.method ?? data?.paymentMethod ?? data?.paymentType);
          },
          (err) => console.warn('[usePaymentMethodListener] payments_live:', err),
        );

        return () => {
          unsubTrip();
          unsubPayment();
        };
      } catch (error) {
        console.error('Error configurando listener de método de pago:', error);
      }
    };

    setup().then((unsub) => {
      if (unsub) unsubscribe = unsub;
    });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [rideId, isPendingPayment, onMethodChange]);

  const changePaymentMethod = useCallback(
    async (method: 'card' | 'cash', _reason?: string) => {
      if (changingPaymentMethod) return;

      if (method !== 'cash') return;

      if (isPendingPayment && method === 'cash') return;

      if (currentPaymentMethodRef.current === method) return;

      try {
        setChangingPaymentMethod(true);
        await changePaymentMethodV2(rideId, method);
      } catch (error: any) {
        console.error('Error cambiando método de pago desde cliente:', error);
        throw error;
      } finally {
        setChangingPaymentMethod(false);
      }
    },
    [rideId, isPendingPayment, changingPaymentMethod],
  );

  return {
    currentPaymentMethod,
    setCurrentPaymentMethod,
    currentPaymentMethodRef,
    isNavigatingRef,
    changingPaymentMethod,
    changePaymentMethod,
  };
}
