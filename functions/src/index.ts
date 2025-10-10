/**
 * DriveAngel.ni - Firebase Functions
 * Backend completo en Firebase Functions + Supabase PostgreSQL
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Inicializar Firebase Admin
admin.initializeApp();

// Importar módulos
import * as authAPI from "./api/auth";
import * as ridesAPI from "./api/rides";
import * as driversAPI from "./api/drivers";
import * as paymentsAPI from "./api/payments";
import * as usersAPI from "./api/users";
import * as trackingFunctions from "./api/tracking-functions";
import * as rideHistoryAPI from "./api/rideHistory";
// import * as emergencyAPI from "./api/emergency";

// Importar triggers
import * as authTriggers from "./triggers/auth";
import * as ridesTriggers from "./triggers/rides";
import * as paymentsTriggers from "./triggers/payments";

// Importar webhooks
import * as stripeWebhook from "./webhooks/stripe";

// ============================================
// API ENDPOINTS
// ============================================

// Auth
export const register = authAPI.register;
export const login = authAPI.login;
export const logout = authAPI.logout;

// Rides
export const requestRide = ridesAPI.requestRide;
export const acceptRide = ridesAPI.acceptRide;
export const startRide = ridesAPI.startRide;
export const completeRide = ridesAPI.completeRide;
export const cancelRide = ridesAPI.cancelRide;
export const getRideDetails = ridesAPI.getRideDetails;
export const getAvailableRides = ridesAPI.getAvailableRides;

// Drivers
export const registerDriver = driversAPI.registerDriver;
export const updateDriverLocation = driversAPI.updateDriverLocation;
export const getDriverProfile = driversAPI.getDriverProfile;
export const updateDriverStatus = driversAPI.updateDriverStatus;
export const getAvailableDrivers = driversAPI.getAvailableDrivers;

// Payments
export const createPaymentIntent = paymentsAPI.createPaymentIntent;
export const capturePayment = paymentsAPI.capturePayment;
export const cancelPaymentAuthorization = paymentsAPI.cancelPaymentAuthorization;
export const getPaymentDetails = paymentsAPI.getPaymentDetails;

// Users
export const getUserProfile = usersAPI.getUserProfile;
export const updateUserProfile = usersAPI.updateUserProfile;

// Tracking (Firebase Callable Functions)
export const getETA = trackingFunctions.getETA;
export const saveRideLocation = trackingFunctions.saveLocation;
export const getRouteHistory = trackingFunctions.getRouteHistory;

// Ride History
export const getMyRides = rideHistoryAPI.getMyRides;
export const getDriverStats = rideHistoryAPI.getDriverStats;

// Emergency - DESHABILITADO TEMPORALMENTE (usar Backend NestJS)
// export const logEmergencyCall = emergencyAPI.logEmergencyCall;
// export const updateEmergencyCallStatus = emergencyAPI.updateEmergencyCallStatus;
// export const getEmergencyCalls = emergencyAPI.getEmergencyCalls;

// ============================================
// TRIGGERS AUTOMÁTICOS
// ============================================

// Auth Triggers
export const onUserCreated = authTriggers.onUserCreated;
export const onUserDeleted = authTriggers.onUserDeleted;

// Rides Triggers
export const onRideStatusChanged = ridesTriggers.onRideStatusChanged;
export const onRideCreated = ridesTriggers.onRideCreated;

// Payments Triggers
export const onPaymentCompleted = paymentsTriggers.onPaymentCompleted;

// ============================================
// WEBHOOKS
// ============================================

export const stripeWebhookHandler = stripeWebhook.handler;

// ============================================
// SCHEDULED FUNCTIONS (Cron Jobs)
// ============================================

// Limpiar viajes antiguos cada día a las 2 AM
export const cleanupOldRides = functions.pubsub
  .schedule("0 2 * * *")
  .timeZone("America/Managua")
  .onRun(async (context) => {
    console.log("🧹 Limpiando viajes antiguos...");
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const snapshot = await admin.firestore()
      .collection("activeRides")
      .where("createdAt", "<", thirtyDaysAgo)
      .get();
    
    const batch = admin.firestore().batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`✅ ${snapshot.size} viajes antiguos eliminados`);
  });

// ============================================
// HEALTH CHECK
// ============================================

export const healthCheck = functions.https.onRequest((req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "DriveAngel.ni Functions",
    version: "1.0.0",
  });
});
