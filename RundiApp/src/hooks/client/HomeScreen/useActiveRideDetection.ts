import { useEffect, useState } from 'react';
import { isRideCanceledLocally } from '../../../utils/ride/clientRideState';

const ACTIVE_RIDE_STATUSES = [
  'requested', 'driver_offered', 'accepted', 'driver_on_route',
  'driver_arrived', 'in_progress', 'pending_payment',
];

export function useActiveRideDetection(
  userId: string | undefined,
  activeRidesData: Record<string, any> | null,
  navigation: any,
): any | null {
  const [activeRide, setActiveRide] = useState<any>(null);

  useEffect(() => {
    if (!userId || !activeRidesData) {
      return;
    }

    const checkActiveRides = async () => {
      try {
        let activeRideFound = false;

        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const savedRideId = await AsyncStorage.getItem('ACTIVE_RIDE_ID');

        if (savedRideId && activeRidesData[savedRideId]) {
          const rideData = activeRidesData[savedRideId];

          if (rideData.clientId === userId && ACTIVE_RIDE_STATUSES.includes(rideData.status)
            && !isRideCanceledLocally(savedRideId)) {
            setActiveRide({ ...rideData, id: savedRideId });
            activeRideFound = true;
          } else {
            await AsyncStorage.removeItem('ACTIVE_RIDE_ID');
          }
        }

        if (!activeRideFound) {
          const clientRides = Object.entries(activeRidesData).filter(
            ([id, ride]: [string, any]) =>
              ride.clientId === userId && ACTIVE_RIDE_STATUSES.includes(ride.status)
              && !isRideCanceledLocally(id),
          );

          if (clientRides.length > 0) {
            const [activeRideId, activeRideData] = clientRides[0];

            if (activeRideData.status === 'pending_payment') {
              const paymentMethod = activeRideData.paymentMethod || activeRideData.payment?.method || 'cash';
              const finalAmount = activeRideData.finalFare || activeRideData.estimatedPrice || 0;
              const driverName = activeRideData.driver?.name || 'Conductor';
              const driverPhoto = activeRideData.driver?.photoURL || undefined;

              if (paymentMethod === 'card') {
                navigation.navigate('Payment', {
                  rideId: activeRideId,
                  amount: finalAmount,
                  driverId: activeRideData.driverId,
                  driverName,
                  vehiclePlate: activeRideData.vehicle?.plate || activeRideData.driver?.vehicle?.plate || 'N/A',
                  driverPhoto,
                  isPendingPayment: true,
                });
              } else {
                navigation.navigate('CashPayment', {
                  rideId: activeRideId,
                  amount: finalAmount,
                  driverName,
                  driverPhoto,
                });
              }
              activeRideFound = true;
              return;
            }

            setActiveRide({ ...activeRideData, id: activeRideId });
            activeRideFound = true;
            await AsyncStorage.setItem('ACTIVE_RIDE_ID', activeRideId);
          } else {
            setActiveRide(null);
          }
        }

        if (!activeRideFound) {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          await AsyncStorage.removeItem('ACTIVE_RIDE_ID');
          setActiveRide(null);
        }
      } catch (error) {
        console.error('❌ Error verificando viajes activos:', error);
      }
    };

    checkActiveRides();
  }, [userId, activeRidesData, navigation]);

  return activeRide;
}
