import { useEffect, useRef, useState, useCallback } from 'react';
import { initializeFirebase } from '../../../config/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import sessionService from '../../../services/sessionService';

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

    const setup = async () => {
      try {
        const { app } = await initializeFirebase();
        if (!app) return;
        const { getDatabase, ref, onValue, off } = await import('firebase/database');
        const db = getDatabase(app);
        const rideRef = ref(db, `activeRides/${rideId}`);
        const paymentStatusRef = ref(db, `paymentStatus/${rideId}`);

        const handleMethodChange = (newMethod?: string) => {
          if (isPendingPayment) {
            currentPaymentMethodRef.current = 'cash';
            setCurrentPaymentMethod('cash');
            isNavigatingRef.current = false;
            return;
          }

          if (!newMethod) return;
          const normalizedMethod: 'card' | 'cash' = 'cash';

          if (normalizedMethod === currentPaymentMethodRef.current) {
            isNavigatingRef.current = false;
            return;
          }

          currentPaymentMethodRef.current = normalizedMethod;
          setCurrentPaymentMethod(normalizedMethod);
          onMethodChange?.(normalizedMethod);
        };

        const unsubscribeRide = onValue(rideRef, (snapshot) => {
          const data = snapshot.val();
          handleMethodChange(data?.paymentMethod);
        });

        const unsubscribePayment = onValue(paymentStatusRef, (snapshot) => {
          const paymentData = snapshot.val();
          const methodFromStatus = paymentData?.method || paymentData?.paymentMethod;
          handleMethodChange(methodFromStatus);
        });

        return () => {
          if (unsubscribeRide) {
            unsubscribeRide();
          } else {
            off(rideRef);
          }
          if (unsubscribePayment) {
            unsubscribePayment();
          } else {
            off(paymentStatusRef);
          }
        };
      } catch (error) {
        console.error('Error configurando listener de método de pago:', error);
      }
    };

    setup().then((unsub) => {
      if (unsub) unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [rideId, isPendingPayment, onMethodChange]);

  const changePaymentMethod = useCallback(
    async (method: 'card' | 'cash', reason?: string) => {
      if (changingPaymentMethod) return;

      if (method !== 'cash') return;

      if (isPendingPayment && method === 'cash') return;

      if (currentPaymentMethodRef.current === method) return;

      try {
        setChangingPaymentMethod(true);

        const { app } = await initializeFirebase();
        if (!app) throw new Error('Firebase no inicializado');

        const functions = getFunctions(app);
        const changePaymentMethodFn = httpsCallable(functions, 'changePaymentMethod');

        const deviceId = await sessionService.getDeviceId();
        await changePaymentMethodFn({
          rideId,
          newPaymentMethod: method,
          reason: reason || (method === 'cash' ? 'Cliente prefiere pagar en efectivo' : 'Cliente prefiere pagar con tarjeta'),
          deviceId,
        });
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
