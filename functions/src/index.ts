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
import * as smsAPI from "./api/sms";
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
import * as servicesAPI from "./api/services";
import * as switchPaymentMethodAPI from "./api/switchPaymentMethod";
import * as pendingPaymentsAPI from "./api/pendingPayments";
import * as routingFunctions from "./location/routing";

// Importar user management
import * as userManagement from "./user/deleteUserData";

// Importar triggers
import * as authTriggers from "./triggers/auth";
import * as ridesTriggers from "./triggers/rides";
import * as paymentsTriggers from "./triggers/payments";
import * as paymentStatusSync from "./triggers/paymentStatusSync";

// Importar webhooks
import * as stripeWebhook from "./webhooks/stripe";

// Importar scheduled functions
import * as cleanupScheduled from "./scheduled/cleanupOldRides";
import * as cleanupRealtimeDB from "./scheduled/cleanupRealtimeDB";

// ============================================
// API ENDPOINTS
// ============================================

// Auth
export const register = authAPI.register;
export const login = authAPI.login;
export const logout = authAPI.logout;
export const completeDriverRegistration = authAPI.completeDriverRegistration;

// SMS (Validación de teléfono)
export const sendSmsCode = smsAPI.sendSmsCode;
export const verifySmsCode = smsAPI.verifySmsCode;
export const resendSmsCode = smsAPI.resendSmsCode;
export const cleanupExpiredSmsCode = smsAPI.cleanupExpiredSmsCode;

// Rides
export const requestRide = ridesAPI.requestRide;
export const acceptRide = ridesAPI.acceptRide;
export const confirmDriver = ridesAPI.confirmDriver;
export const rejectDriver = ridesAPI.rejectDriver;
export const startRide = ridesAPI.startRide;
export const completeRide = ridesAPI.completeRide;
export const confirmCashPayment = ridesAPI.confirmCashPayment;
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
export const updateDriver = driversAPI.updateDriver;
export const updateVehicle = driversAPI.updateVehicle;
export const addVehicle = driversAPI.addVehicle;
export const switchVehicle = driversAPI.switchVehicle;
export const getDriverVehicles = driversAPI.getDriverVehicles;
export const requestDesignatedDriverAccess = driversAPI.requestDesignatedDriverAccess;
export const getDesignatedDriverRequestStatus = driversAPI.getDesignatedDriverRequestStatus;
export const approveDesignatedDriverRequest = driversAPI.approveDesignatedDriverRequest;
export const rejectDesignatedDriverRequest = driversAPI.rejectDesignatedDriverRequest;

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

// Services (Gestión de servicios y comisiones)
export const getServices = servicesAPI.getServices;
export const getServiceById = servicesAPI.getServiceById;
export const createService = servicesAPI.createService;
export const updateService = servicesAPI.updateService;
export const getCommissionForRide = servicesAPI.getCommissionForRide;
export const assignServiceToDriver = servicesAPI.assignServiceToDriver;
export const approveDriverService = servicesAPI.approveDriverService;
export const getDriverServices = servicesAPI.getDriverServices;

// Switch Payment Method
export const switchPaymentMethod = switchPaymentMethodAPI.switchPaymentMethod;
export const getPaymentMethodHistory = switchPaymentMethodAPI.getPaymentMethodHistory;

// Location & Routing
export const calculateRoute = routingFunctions.calculateRoute;
export const reverseGeocode = routingFunctions.reverseGeocode;
export const geocodeAddress = routingFunctions.geocodeAddress;
export const searchPlaces = routingFunctions.searchPlaces;
export const calculateDistance = routingFunctions.calculateDistance;

// ============================================
// TRIGGERS AUTOMÁTICOS
// ============================================

// Auth Triggers
export const onUserCreated = authTriggers.onUserCreated;
// onUserDeleted ELIMINADO - Reemplazado por deleteUserFromSupabase (ver USER MANAGEMENT section)

// Rides Triggers
export const onRideStatusChanged = ridesTriggers.onRideStatusChanged;
export const onRideCreated = ridesTriggers.onRideCreated;

// Payments Triggers
export const onPaymentCompleted = paymentsTriggers.onPaymentCompleted;
export const syncPaymentStatusToPostgres = paymentStatusSync.syncPaymentStatusToPostgres;
export const syncPostgresToFirebase = paymentStatusSync.syncPostgresToFirebase;
export const forceSyncPaymentToFirebase = paymentStatusSync.forceSyncPaymentToFirebase;

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
// REALTIME DATABASE CLEANUP (Reemplaza extensiones)
// ============================================

// Limpiar ubicaciones de conductores (cada hora) - Mantiene últimas 100
export const cleanupDriverLocations = cleanupRealtimeDB.cleanupDriverLocations;

// Limpiar ubicaciones de viajes (cada 30 min) - Mantiene últimas 500
export const cleanupRideLocations = cleanupRealtimeDB.cleanupRideLocations;

// Limpiar mensajes de chat (cada 6 horas) - Mantiene últimos 100
export const cleanupChatMessages = cleanupRealtimeDB.cleanupChatMessages;

// Limpiar notificaciones (diario) - Mantiene últimas 20
export const cleanupNotifications = cleanupRealtimeDB.cleanupNotifications;

// Limpiar historial de presencia (diario) - Mantiene últimos 10
export const cleanupPresenceHistory = cleanupRealtimeDB.cleanupPresenceHistory;

// ============================================
// PENDING PAYMENTS
// ============================================

export const getPendingPayments = pendingPaymentsAPI.getPendingPayments;
export const processPendingPayment = pendingPaymentsAPI.processPendingPayment;

// ============================================
// USER MANAGEMENT
// ============================================

// Eliminar datos de usuario de Supabase cuando se elimina de Firebase Auth
export const deleteUserFromSupabase = userManagement.deleteUserFromSupabase;

// Eliminar datos manualmente (para testing o limpieza)
export const manualDeleteUserData = userManagement.manualDeleteUserData;


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
