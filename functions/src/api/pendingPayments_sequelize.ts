/**
 * Pending Payments API (Client side)
 * Scans Realtime DB paymentStatus and correlates with active/completed rides
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const getPendingPayments = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const userId = context.auth.uid;
    const db = admin.database();

    // Read all paymentStatus
    const paymentsSnap = await db.ref('paymentStatus').once('value');
    const payments = paymentsSnap.val() || {};

    const pendingStatuses = new Set(['pending', 'pending_confirmation', 'payment_in_progress', 'in_progress']);

    const result: Array<{
      rideId: string;
      amount: number;
      paymentMethod: string;
      createdAt: number;
      origin: string | null;
      destination: string | null;
      driverName: string | null;
      driverId: string | null;
      driverPhoto: string | null;
    }> = [];

    let totalDebt = 0;

    const entries = Object.entries<any>(payments);
    for (const [rideId, payment] of entries) {
      try {
        const status: string = String(payment?.status || '').toLowerCase();
        if (!pendingStatuses.has(status)) continue;

        const amount = Number(payment?.finalAmount ?? payment?.amount ?? payment?.chargeAmount ?? 0) || 0;
        const requiresClientPayment =
          payment?.requiresClientPayment === true ||
          payment?.chargeTarget === 'client' ||
          (typeof payment?.chargeType === 'string' && payment.chargeType.includes('client')) ||
          (typeof payment?.canceledBy === 'string' && payment.canceledBy === 'client' && amount > 0) ||
          (amount > 0 && typeof payment?.cancelReason === 'string' && payment.cancelReason.toLowerCase().includes('cliente'));

        if (!requiresClientPayment) {
          console.log(
            `ℹ️ [getPendingPayments] Omitiendo ${rideId}: requiresClientPayment=${payment?.requiresClientPayment}, chargeTarget=${payment?.chargeTarget}, amount=${amount}`
          );
          continue;
        }

        if (amount <= 0) {
          console.log(`ℹ️ [getPendingPayments] Omitiendo ${rideId} porque amount=${amount} <= 0`);
          continue;
        }

        // Lookup ride
        let ride: any = null;
        const activeSnap = await db.ref(`activeRides/${rideId}`).once('value');
        ride = activeSnap.val();
        if (!ride) {
          const completedSnap = await db.ref(`completedRides/${rideId}`).once('value');
          ride = completedSnap.val();
        }
        if (!ride) continue;

        // Only this client
        if (ride.clientId !== userId) continue;

        const normalizedAmount = amount || Number(ride?.finalFare ?? ride?.estimatedPrice ?? 0) || 0;
        const driverId = ride?.driverId ?? ride?.driver_id ?? ride?.driver?.id ?? null;
        const driverPhoto =
          ride?.driver?.photoURL ??
          ride?.driver?.photoUrl ??
          ride?.driver?.photo ??
          ride?.driver?.avatar ??
          null;
        const method = String(payment?.paymentMethod || payment?.method || ride?.paymentMethod || 'card');
        const createdAt = Number(payment?.createdAt || ride?.completedAt || ride?.updatedAt || Date.now());

        result.push({
          rideId,
          amount: Number(normalizedAmount.toFixed(2)),
          paymentMethod: method,
          createdAt,
          origin: ride?.origin?.address ?? ride?.originAddress ?? null,
          destination: ride?.destination?.address ?? ride?.destinationAddress ?? null,
          driverName: ride?.driver?.name ?? null,
          driverId,
          driverPhoto,
        });
        totalDebt += Number(normalizedAmount.toFixed(2));
      } catch (perPaymentErr) {
        console.warn('⚠️ [getPendingPayments] Error procesando pago', rideId, perPaymentErr);
      }
    }

    return {
      success: true,
      count: result.length,
      hasPendingPayments: result.length > 0,
      totalDebt: Number(totalDebt.toFixed(2)),
      payments: result,
    };
  } catch (error: any) {
    console.error('❌ [getPendingPayments] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
