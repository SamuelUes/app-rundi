import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';

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

const PENDING_STATUSES = new Set([
  'pending',
  'pending_confirmation',
  'in_progress',
  'processing',
  'pending_capture',
]);

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
        const db = await getFirebaseFirestore();
        // REALTIME_payments_live — driverId top-level (proyección del consumer);
        // reglas permiten leer docs donde soy participante.
        unsubscribe = onSnapshot(
          query(collection(db, FS_COL.paymentsLive), where('driverId', '==', userId)),
          (snapshot) => {
            if (!isMounted) return;

            const pending = snapshot.docs
              .map((d) => ({ rideId: d.data()?.rideId ?? d.id, ...d.data() }))
              .filter((payment: any) => {
                const status = String(payment.status || '').toLowerCase();
                return PENDING_STATUSES.has(status);
              });

            setPendingPayments(pending as PendingPayment[]);
            markTaskCompleted('pendingPayments');
          },
          (err: any) => {
            if (!isMounted) return;
            console.warn('⚠️ [DriverHomeScreen] Error escuchando pagos pendientes:', err?.message || err);
            setPendingPayments([]);
            markTaskCompleted('pendingPayments');
          },
        );
      } catch (err: any) {
        if (!isMounted) return;
        console.warn('⚠️ [DriverHomeScreen] Error configurando listener de pagos:', err?.message || err);
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
