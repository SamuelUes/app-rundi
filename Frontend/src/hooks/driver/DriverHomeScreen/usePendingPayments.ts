import { useEffect, useState } from 'react';

interface UsePendingPaymentsOptions {
  userId: string | undefined;
  markTaskCompleted: (task: string) => void;
}

export interface PendingPayment {
  rideId: string;
  finalAmount?: number;
  amount?: number;
  method?: string;
  paymentMethod?: string;
  [key: string]: any;
}

export function usePendingPayments({ userId, markTaskCompleted }: UsePendingPaymentsOptions) {
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);

  useEffect(() => {
    if (!userId) {
      setPendingPayments([]);
      markTaskCompleted('pendingPayments');
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let isMounted = true;

    (async () => {
      try {
        const { initializeFirebase } = await import('../../../config/firebase');
        const { getDatabase, ref: dbRef, query, orderByChild, equalTo, onValue } = await import('firebase/database');
        const { app } = await initializeFirebase();
        if (!app) {
          console.warn('⚠️ [DriverHomeScreen] Firebase no inicializado');
          if (isMounted) {
            markTaskCompleted('pendingPayments');
          }
          return;
        }

        const db = getDatabase(app);
        const paymentStatusQuery = query(
          dbRef(db, 'paymentStatus'),
          orderByChild('driverId'),
          equalTo(userId),
        );

        unsubscribe = onValue(
          paymentStatusQuery,
          (snapshot) => {
            if (!isMounted) return;

            const data = snapshot.val();
            if (!data) {
              setPendingPayments([]);
              markTaskCompleted('pendingPayments');
              return;
            }

            const pending = Object.entries<any>(data)
              .filter(([, payment]) => {
                if (!payment) return false;

                const rawDriverId =
                  payment.driverId ??
                  payment.driver_id ??
                  (payment.ride && (payment.ride.driverId || payment.ride.driver_id)) ??
                  null;
                const normalizedDriverId =
                  rawDriverId != null ? String(rawDriverId).trim() : '';
                if (normalizedDriverId !== userId) return false;

                const status = String(payment.status || '').toLowerCase();
                const isPendingStatus = ['pending', 'pending_confirmation', 'in_progress', 'processing', 'pending_capture'].includes(status);
                if (!isPendingStatus) return false;

                const chargeTargetRaw = payment.chargeTarget || payment.charge_target || null;
                const requiresClientPaymentFlag =
                  payment.requiresClientPayment ?? payment.requires_client_payment;

                if (requiresClientPaymentFlag === false) return false;
                if (chargeTargetRaw === 'driver') return false;

                return true;
              })
              .map(([rideId, payment]) => ({ rideId, ...payment }));

            setPendingPayments(pending);
            markTaskCompleted('pendingPayments');
          },
          (err: any) => {
            if (!isMounted) return;

            const errorMsg = err?.message || String(err);
            if (errorMsg.includes('permission') || errorMsg.includes('Permission')) {
              console.warn('⚠️ [DriverHomeScreen] Sin permisos para leer paymentStatus, saltando verificación');
            } else {
              console.warn('⚠️ [DriverHomeScreen] Error escuchando pagos pendientes:', errorMsg);
            }

            setPendingPayments([]);
            markTaskCompleted('pendingPayments');
          },
        );
      } catch (err: any) {
        if (!isMounted) return;

        const errorMsg = err?.message || String(err);
        if (errorMsg.includes('permission') || errorMsg.includes('Permission')) {
          console.warn('⚠️ [DriverHomeScreen] Sin permisos para configurar listener de pagos');
        } else {
          console.warn('⚠️ [DriverHomeScreen] Error configurando listener de pagos:', errorMsg);
        }

        markTaskCompleted('pendingPayments');
      }
    })();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [userId, markTaskCompleted]);

  return { pendingPayments, setPendingPayments };
}
