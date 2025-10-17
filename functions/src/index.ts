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
import * as trackingOptimized from "./api/tracking-optimized";
import * as fcmFunctions from "./api/fcm-functions";
import * as rideHistoryAPI from "./api/rideHistory";
import * as priceNegotiationAPI from "./api/priceNegotiation";
import * as emergencyAPI from "./api/emergency";
import * as earningsAPI from "./api/earnings";
import * as localPaymentsAPI from "./api/localPayments";
import * as penaltiesAPI from "./api/penalties";
import * as commissionsAPI from "./api/commissions";
import * as ratingsAPI from "./api/ratings";
import * as cardsAPI from "./api/cards";

// Importar triggers
import * as authTriggers from "./triggers/auth";
import * as ridesTriggers from "./triggers/rides";
import * as paymentsTriggers from "./triggers/payments";
import * as paymentStatusSync from "./triggers/paymentStatusSync";

// Importar webhooks
import * as stripeWebhook from "./webhooks/stripe";

// Importar scheduled functions
import * as cleanupScheduled from "./scheduled/cleanupOldRides";

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
export const confirmDriver = ridesAPI.confirmDriver;
export const rejectDriver = ridesAPI.rejectDriver;
export const startRide = ridesAPI.startRide;
export const completeRide = ridesAPI.completeRide;
export const cancelRide = ridesAPI.cancelRide;
export const getRideDetails = ridesAPI.getRideDetails;
export const getAvailableRides = ridesAPI.getAvailableRides;
export const getActiveRide = ridesAPI.getActiveRide;
export const calculatePrice = ridesAPI.calculatePrice;
export const updateRideStatus = ridesAPI.updateRideStatus; // Wrapper para startRide/completeRide

// Drivers
export const registerDriver = driversAPI.registerDriver;
export const updateDriverLocation = driversAPI.updateDriverLocation;
export const getDriverProfile = driversAPI.getDriverProfile;
export const updateDriverStatus = driversAPI.updateDriverStatus;
export const getAvailableDrivers = driversAPI.getAvailableDrivers;
export const updateDesignatedDriverMode = driversAPI.updateDesignatedDriverMode;

// Payments
export const createPaymentIntent = paymentsAPI.createPaymentIntent;
export const capturePayment = paymentsAPI.capturePayment;
export const cancelPaymentAuthorization = paymentsAPI.cancelPaymentAuthorization;
export const getPaymentDetails = paymentsAPI.getPaymentDetails;
export const registerCashPayment = paymentsAPI.registerCashPayment;

// Cards (Tarjetas Guardadas)
export const validateAndTokenizeCard = cardsAPI.validateAndTokenizeCard;
export const addCard = cardsAPI.addCard;
export const getCards = cardsAPI.getCards;
export const deleteCard = cardsAPI.deleteCard;
export const setDefaultCard = cardsAPI.setDefaultCard;
export const createPaymentIntentWithSavedCard = cardsAPI.createPaymentIntentWithSavedCard;
export const completeCashPayment = paymentsAPI.completeCashPayment;
export const cancelCashPayment = paymentsAPI.cancelCashPayment;

// Users
export const getUserProfile = usersAPI.getUserProfile;
export const updateUserProfile = usersAPI.updateUserProfile;

// Tracking (Firebase Callable Functions)
export const getETA = trackingFunctions.getETA;
export const saveRideLocation = trackingFunctions.saveLocation;
export const getRouteHistory = trackingFunctions.getRouteHistory;

// Tracking Optimizado (Nuevo sistema)
export const updateDriverLocationOptimized = trackingOptimized.updateDriverLocationOptimized;
export const getIntelligentETA = trackingOptimized.getIntelligentETA;
export const getCompressedRouteHistory = trackingOptimized.getCompressedRouteHistory;

// FCM (Firebase Cloud Messaging)
export const registerFCMToken = fcmFunctions.registerFCMToken;
export const clearFCMToken = fcmFunctions.clearFCMToken;
export const sendTestNotification = fcmFunctions.sendTestNotification;

// Ride History
export const getMyRides = rideHistoryAPI.getMyRides;
export const getDriverStats = rideHistoryAPI.getDriverStats;

// Price Negotiation
export const negotiatePrice = priceNegotiationAPI.negotiatePrice;
export const acceptClientPrice = priceNegotiationAPI.acceptClientPrice;
export const acceptDriverOffer = priceNegotiationAPI.acceptDriverOffer;
export const acceptCounterOffer = priceNegotiationAPI.acceptCounterOffer;
export const rejectCounterOffer = priceNegotiationAPI.rejectCounterOffer;

// Emergency
export const logEmergencyCall = emergencyAPI.logEmergencyCall;
export const updateEmergencyCallStatus = emergencyAPI.updateEmergencyCallStatus;
export const getEmergencyCalls = emergencyAPI.getEmergencyCalls;

// Earnings
export const getDriverEarnings = earningsAPI.getDriverEarnings;
export const getDriverEarningsStats = earningsAPI.getDriverStats;
export const getEarningsByDay = earningsAPI.getEarningsByDay;

// Local Payments
export const switchToLocalPayment = localPaymentsAPI.switchToLocalPayment;
export const getAvailableBanks = localPaymentsAPI.getAvailableBanks;

// Penalties
export const getDriverPenalties = penaltiesAPI.getDriverPenalties;
export const markPenaltiesAsDeducted = penaltiesAPI.markPenaltiesAsDeducted;
export const forgivePenalty = penaltiesAPI.forgivePenalty;
export const getPenaltiesSummary = penaltiesAPI.getPenaltiesSummary;

// Commissions
export const getCommissionBreakdown = commissionsAPI.getCommissionBreakdown;

// Ratings
export const submitRating = ratingsAPI.submitRating;
export const skipRating = ratingsAPI.skipRating;
export const rateRide = ratingsAPI.rateRide; // Alias para compatibilidad
export const getUserRating = ratingsAPI.getUserRating;
export const getRideRatings = ratingsAPI.getRideRatings;

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
export const syncPaymentStatusToPostgres = paymentStatusSync.syncPaymentStatusToPostgres;

// FCM Triggers
export const onRideAccepted = fcmFunctions.sendRideAcceptedNotification;
export const onRideCancelled = fcmFunctions.sendRideCancelledNotification;

// ============================================
// WEBHOOKS
// ============================================

export const stripeWebhookHandler = stripeWebhook.handler;

// ============================================
// SCHEDULED FUNCTIONS (Cron Jobs)
// ============================================

// Limpiar viajes completados/cancelados (cada hora)
export const cleanupOldRidesScheduled = cleanupScheduled.cleanupOldRides;

// Limpiar payments huérfanos (cada 6 horas)
export const cleanupOrphanPaymentsScheduled = cleanupScheduled.cleanupOrphanPayments;

// Limpiar chats huérfanos (cada 12 horas)
export const cleanupOldChatsScheduled = cleanupScheduled.cleanupOldChats;

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
