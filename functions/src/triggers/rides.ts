import * as functions from "firebase-functions";

export const onRideStatusChanged = functions.firestore
  .document("activeRides/{rideId}")
  .onUpdate(async (change, context) => {
    console.log(`🚗 Viaje actualizado: ${context.params.rideId}`);
  });

export const onRideCreated = functions.firestore
  .document("activeRides/{rideId}")
  .onCreate(async (snapshot, context) => {
    console.log(`🆕 Viaje creado: ${context.params.rideId}`);
  });
