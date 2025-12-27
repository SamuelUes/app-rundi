/**
 * Rundi - Firebase Functions
 * Backend completo en Firebase Functions + Supabase PostgreSQL
 */

import * as functions from "firebase-functions";
import "./config/firebase";

// Importar módulos
// ⚠️ NOTA: Los archivos .old.ts fueron eliminados - usar versiones nuevas
// import * as authAPI from "./api/auth.old";
// import * as smsAPI from "./api/sms.old";

// ✅ NUEVAS APIs CON SEQUELIZE + ZOD
import * as ridesSequelizeAPI from "./api/rides_sequelize";
import * as driversSequelizeAPI from "./api/drivers_sequelize";
import * as paymentsSequelizeAPI from "./api/payments_sequelize";
import * as ratingsSequelizeAPI from "./api/ratings_sequelize";
import * as priceNegotiationSequelizeAPI from "./api/price_negotiation_sequelize";
import * as vehiclesSequelizeAPI from "./api/vehicles_sequelize";
import * as penaltiesSequelizeAPI from "./api/driver_penalties_sequelize";
import * as rideLocationsSequelizeAPI from "./api/ride_locations_sequelize";
import * as emergencyCallsSequelizeAPI from "./api/emergency_calls_sequelize";
import * as servicesSequelizeAPI from "./api/services_sequelize";
import * as cardsSequelizeAPI from "./api/cards_sequelize";
import * as designatedDriverInspectionsSequelizeAPI from "./api/designated_driver_inspections_sequelize";
import * as driverServicesSequelizeAPI from "./api/driver_services_sequelize";
import * as biometricAuthSequelizeAPI from "./api/biometric_authentications_sequelize";
import * as analyticsSequelizeAPI from "./api/analytics_sequelize";
import * as clientProfilesAPI from "./api/clientProfiles";
import * as smsCodesSequelizeAPI from "./api/sms_verification_codes_sequelize";
import * as commissionHistorySequelizeAPI from "./api/service_commission_history_sequelize";
import * as authAPI from "./api/auth";
import * as pendingPaymentsAPI from "./api/pendingPayments_sequelize";
import * as regionAvailabilityAPI from "./api/region_availability";
import * as publicRideTrackingAPI from "./api/WebPage_publicRideTracking";

// ⚠️ COMENTADOS: Archivos .old.ts eliminados
// import * as usersAPI from "./api/users.old";
// import * as trackingFunctions from "./api/tracking-functions.old";
// import * as trackingOptimized from "./api/tracking-optimized.old";
// import * as fcmFunctions from "./api/fcm-functions.old";
// import * as rideHistoryAPI from "./api/rideHistory.old";
// import * as priceNegotiationAPI from "./api/priceNegotiation.old";
// import * as emergencyAPI from "./api/emergency.old";
// import * as earningsAPI from "./api/earnings.old";
// import * as localPaymentsAPI from "./api/localPayments.old";
// import * as commissionsAPI from "./api/commissions.old";
// import * as cardsAPI from "./api/cards.old";
// import * as cardsManagementAPI from "./api/cardsManagement.old";
// import * as servicesAPI from "./api/services.old";
// import * as switchPaymentMethodAPI from "./api/switchPaymentMethod.old";
// import * as pendingPaymentsAPI from "./api/pendingPayments.old";
// import * as penaltiesSyncAPI from "./api/penaltiesSync.old";
// import * as locationsSyncAPI from "./api/locationsSync.old";
// import * as driverServicesSyncAPI from "./api/driverServicesSync.old";
// import * as driverServicesAPI from "./api/driverServices.old";
// import * as supabasePaymentSyncAPI from "./api/supabasePaymentSync.old";
// import * as realtimeSyncAPI from "./api/realtimeSyncToSupabase.old";

import * as updateStatusAPI from "./api/updateStatus";
import * as driversCompatibilityAPI from "./api/drivers-compatibility";
// ✅ NUEVAS: Funciones de historial y ganancias
import * as rideHistoryAPI from "./api/rideHistory";
// ✅ NUEVAS: Funciones de tarjetas y perfil
import * as cardsManagementAPI from "./api/cardsManagement";
import * as driverProfileAPI from "./api/driverProfile";
// ⚠️ COMENTADOS: Archivos .old.ts - crear nuevas versiones si es necesario
// import * as priceNegotiationAPI from "./api/priceNegotiation";
// import * as emergencyAPI from "./api/emergency";
// import * as localPaymentsAPI from "./api/localPayments";
// import * as commissionsAPI from "./api/commissions";
// import * as cardsAPI from "./api/cards";
// import * as cardsManagementAPI from "./api/cardsManagement";
// import * as servicesAPI from "./api/services";
// import * as switchPaymentMethodAPI from "./api/switchPaymentMethod";
// import * as pendingPaymentsAPI from "./api/pendingPayments";
// import * as routingFunctions from "./location/routing";
// import * as penaltiesSyncAPI from "./api/penaltiesSync";
// import * as locationsSyncAPI from "./api/locationsSync";
// import * as driverServicesSyncAPI from "./api/driverServicesSync";
// import * as driverServicesAPI from "./api/driverServices";
// import * as supabasePaymentSyncAPI from "./api/supabasePaymentSync";
// import * as realtimeSyncAPI from "./api/realtimeSyncToSupabase";

// Importar user management
import * as userManagement from "./user/deleteUserData";

// Importar triggers
import * as authTriggers from "./triggers/auth";
import * as ridesTriggers from "./triggers/rides";
import * as onPaymentCompletedTrigger from "./triggers/onPaymentCompleted";
import * as onRideCanceledTrigger from "./triggers/onRideCanceled";
import * as onRatingCompletedTrigger from "./triggers/onRatingCompleted";

// Importar notificaciones
// import * as notificationsAPI from "./api/notifications";
import * as fcmAPI from "./api/fcm";
// Importar webhooks
// ✅ Eliminado: Stripe webhook (sistema de pagos simplificado)

// Importar scheduled functions
import * as cleanupScheduled from "./scheduled/cleanupOldRides";
import * as cleanupRealtimeDB from "./scheduled/cleanupRealtimeDB";

// Importar presence functions
import * as presenceAPI from "./api/presence";
import * as sessionsAPI from "./api/sessions";
import * as geoShardingTriggers from "./triggers/geoSharding";

// ============================================
// API ENDPOINTS
// ============================================

// ⚠️ COMENTADOS: Auth y SMS - archivos .old.ts eliminados
// import * as authAPI from "./api/auth";
// export const register = authAPI.register;
// export const login = authAPI.login;
// export const logout = authAPI.logout;
// export const completeDriverRegistration = authAPI.completeDriverRegistration;

// ✅ NUEVAS APIs CON SEQUELIZE + ZOD
// Rides
export const createRide = ridesSequelizeAPI.createRide;
export const requestRide = ridesSequelizeAPI.createRide; // Alias para compatibilidad
export const acceptRide = ridesSequelizeAPI.acceptRide;
export const confirmDriver = ridesSequelizeAPI.confirmDriver; // ✅ NUEVO: Cliente confirma conductor específico
export const markDriverOnRoute = ridesSequelizeAPI.markDriverOnRoute;
export const startRide = ridesSequelizeAPI.startRide;
export const completeRide = ridesSequelizeAPI.completeRide;
export const cancelRide = ridesSequelizeAPI.cancelRide;
export const rejectRide = ridesSequelizeAPI.rejectRide;
export const getAvailableRides = ridesSequelizeAPI.getAvailableRides;
export const getClientRides = ridesSequelizeAPI.getClientRides;
export const getDriverRides = ridesSequelizeAPI.getDriverRides;
export const getRideDetails = ridesSequelizeAPI.getRideDetails;
export const getActiveRides = ridesSequelizeAPI.getActiveRides;
export const getRideStats = ridesSequelizeAPI.getRideStats;
export const updateRideStatus = ridesSequelizeAPI.updateRideStatus;
export const getIntelligentETA = ridesSequelizeAPI.getIntelligentETA;
export const changePaymentMethod = ridesSequelizeAPI.changePaymentMethod; // ✅ NUEVO: Cambiar método de pago

// Drivers
export const createDriverProfile = driversSequelizeAPI.createDriverProfile;
export const getDriverProfile = driversSequelizeAPI.getDriverProfile;
export const getDriverByUserId = driversSequelizeAPI.getDriverByUserId;
export const updateDriverProfile = driversSequelizeAPI.updateDriverProfile;
export const getActiveDrivers = driversSequelizeAPI.getActiveDrivers;
export const getDriversByRating = driversSequelizeAPI.getDriversByRating;
export const getDriversByDepartment = driversSequelizeAPI.getDriversByDepartment;
export const getDriverStats = driversSequelizeAPI.getDriverStats;
export const changeDriverStatus = driversSequelizeAPI.changeDriverStatus;
export const verifyDriver = driversSequelizeAPI.verifyDriver;
export const rejectDriver = driversSequelizeAPI.rejectDriver;
export const suspendDriver = driversSequelizeAPI.suspendDriver;
export const updateDriverStats = driversSequelizeAPI.updateDriverStats;
export const getAllDrivers = driversSequelizeAPI.getAllDrivers;

// Drivers Compatibility (Frontend)
export const updateDriverLocation = driversCompatibilityAPI.updateDriverLocation;
export const getAvailableDrivers = driversCompatibilityAPI.getAvailableDrivers;
export const updateDesignatedDriverMode = driversCompatibilityAPI.updateDesignatedDriverMode;
export const updateDriver = driversCompatibilityAPI.updateDriver;
export const requestDesignatedDriverAccess = driversCompatibilityAPI.requestDesignatedDriverAccess;
export const getDesignatedDriverRequestStatus = driversCompatibilityAPI.getDesignatedDriverRequestStatus;

// Payments - ✅ ACTUALIZADO: Sequelize + Zod
// ❌ DEPRECATED: createPaymentIntent, capturePayment, cancelPaymentAuthorization, getPaymentDetails, createPaymentIntentWithSavedCard
// ✅ ACTIVOS: registerCashPayment, confirmCashPayment, completeCashPayment, cancelCashPayment
export const registerCashPayment = paymentsSequelizeAPI.registerCashPayment;
export const confirmCashPayment = paymentsSequelizeAPI.confirmCashPayment;
export const completeCashPayment = paymentsSequelizeAPI.completeCashPayment;
export const cancelCashPayment = paymentsSequelizeAPI.cancelCashPayment;

// Price Negotiation - ✅ NUEVO: Sequelize
// ✅ ACTIVOS: negotiatePrice, acceptClientPrice, makeCounterOffer, acceptCounterOffer, rejectCounterOffer
export const negotiatePrice = priceNegotiationSequelizeAPI.negotiatePrice;
export const acceptClientPrice = priceNegotiationSequelizeAPI.acceptClientPrice;
export const makeCounterOffer = priceNegotiationSequelizeAPI.makeCounterOffer;
export const acceptCounterOffer = priceNegotiationSequelizeAPI.acceptCounterOffer;
export const rejectCounterOffer = priceNegotiationSequelizeAPI.rejectCounterOffer;

// Client profiles
export const getClientProfile = clientProfilesAPI.getClientProfile;

// Region availability
export const checkRegionAvailability = regionAvailabilityAPI.checkRegionAvailability;
export const checkRegionAvailabilityHttp = regionAvailabilityAPI.checkRegionAvailabilityHttp;

// Public ride tracking (Landing page)
export const getPublicRideTracking = publicRideTrackingAPI.getPublicRideTracking;


// ============================================
// FUNCIONES DE PRESENCE
// ============================================
export const markAppActive = presenceAPI.markAppActive;
export const markAppClosed = presenceAPI.markAppClosed;
export const startSession = sessionsAPI.startSession;
export const endSession = sessionsAPI.endSession;

// ============================================
// FUNCIONES DEPRECADAS DE STRIPE (STUBS)
// ============================================
// Estas funciones fueron removidas. Mantener stubs para limpiar Firebase.

export const createPaymentIntent = functions.https.onCall(async (data, context) => {
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Esta función ha sido deprecada. El sistema ahora usa bancos locales. Usa switchToLocalPayment() en su lugar.'
  );
});

export const capturePayment = functions.https.onCall(async (data, context) => {
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Esta función ha sido deprecada. El sistema ahora usa bancos locales.'
  );
});

export const cancelPaymentAuthorization = functions.https.onCall(async (data, context) => {
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Esta función ha sido deprecada. El sistema ahora usa bancos locales.'
  );
});

export const getPaymentDetails = functions.https.onCall(async (data, context) => {
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Esta función ha sido deprecada. El sistema ahora usa bancos locales.'
  );
});

export const createPaymentIntentWithSavedCard = functions.https.onCall(async (data, context) => {
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Esta función ha sido deprecada. El sistema ahora usa bancos locales. Usa switchToLocalPayment() en su lugar.'
  );
});

// ✅ ACTIVAS: Cards Management - Gestión de tarjetas
export const addCard = cardsManagementAPI.addCard;
export const getCards = cardsManagementAPI.getCards;
export const deleteCard = cardsManagementAPI.deleteCard;
export const setDefaultCard = cardsManagementAPI.setDefaultCard;

// ✅ ACTIVAS: Driver Profile - Perfil del conductor (con fallback a Realtime DB)
export const getDriverProfileWithFallback = driverProfileAPI.getDriverProfileWithFallback;
export const updateDriverProfileWithSync = driverProfileAPI.updateDriverProfileWithSync;

// ⚠️ COMENTADOS: Users - archivos .old.ts eliminados
// export const getUserProfile = usersAPI.getUserProfile;
// export const updateUserProfile = usersAPI.updateUserProfile;

// ⚠️ COMENTADOS: Tracking - archivos .old.ts eliminados
// export const getETA = trackingFunctions.getETA;
// export const saveRideLocation = trackingFunctions.saveLocation;
// export const getRouteHistory = trackingFunctions.getRouteHistory;
// export const updateDriverLocationOptimized = trackingOptimized.updateDriverLocationOptimized;
// export const getIntelligentETA = trackingOptimized.getIntelligentETA;
// export const getCompressedRouteHistory = trackingOptimized.getCompressedRouteHistory;

// ⚠️ COMENTADOS: Locations Sync - archivos .old.ts eliminados
// export const saveRideLocationWithRetry = locationsSyncAPI.saveRideLocationWithRetry;
// export const saveRideLocationsBatch = locationsSyncAPI.saveRideLocationsBatch;

// ⚠️ COMENTADOS: FCM - archivos .old.ts eliminados
// export const registerFCMToken = fcmFunctions.registerFCMToken;
// export const clearFCMToken = fcmFunctions.clearFCMToken;
// export const sendTestNotification = fcmFunctions.sendTestNotification;

// ✅ ACTIVAS: Ride History - Historial y Ganancias
export const diagnosticRides = rideHistoryAPI.diagnosticRides;
export const getMyRides = rideHistoryAPI.getMyRides;
export const getDriverEarnings = rideHistoryAPI.getDriverEarnings;
export const getDriverEarningsStats = rideHistoryAPI.getDriverStats;
export const getEarningsByDay = rideHistoryAPI.getEarningsByDay;

// ⚠️ COMENTADOS: Price Negotiation, Emergency, Local Payments - archivos .old.ts eliminados
// export const negotiatePrice = priceNegotiationAPI.negotiatePrice;
// export const acceptClientPrice = priceNegotiationAPI.acceptClientPrice;
// export const acceptDriverOffer = priceNegotiationAPI.acceptDriverOffer;
// export const acceptCounterOffer = priceNegotiationAPI.acceptCounterOffer;
// export const rejectCounterOffer = priceNegotiationAPI.rejectCounterOffer;
// export const logEmergencyCall = emergencyAPI.logEmergencyCall;
// export const updateEmergencyCallStatus = emergencyAPI.updateEmergencyCallStatus;
// export const getEmergencyCalls = emergencyAPI.getEmergencyCalls;
// export const switchToLocalPayment = localPaymentsAPI.switchToLocalPayment;
// export const getAvailableBanks = localPaymentsAPI.getAvailableBanks;

// ⚠️ ELIMINADAS: Penalties antiguas (usar nuevas Sequelize)
// export const getDriverPenaltiesOld = penaltiesAPI.getDriverPenalties;
// export const markPenaltiesAsDeducted = penaltiesAPI.markPenaltiesAsDeducted;
// export const forgivePenalty = penaltiesAPI.forgivePenalty;
// export const getPenaltiesSummary = penaltiesAPI.getPenaltiesSummary;

// ⚠️ COMENTADOS: Penalties Sync, Commissions - archivos .old.ts eliminados
// export const syncPenaltyToSupabase = penaltiesSyncAPI.syncPenaltyToSupabase;
// export const syncPenaltiesBatch = penaltiesSyncAPI.syncPenaltiesBatch;
// export const getCommissionBreakdown = commissionsAPI.getCommissionBreakdown;

// ✅ NUEVAS APIs CON SEQUELIZE + ZOD
// Ratings
export const submitRating = ratingsSequelizeAPI.submitRating;
export const getDriverRatings = ratingsSequelizeAPI.getDriverRatings;
export const getRecentRatings = ratingsSequelizeAPI.getRecentRatings;

// Vehicles (Sequelize)
export const createVehicleSeq = vehiclesSequelizeAPI.createVehicle;
export const createVehicleCompleteSeq = vehiclesSequelizeAPI.createVehicleComplete;
export const getVehicleSeq = vehiclesSequelizeAPI.getVehicle;
export const getDriverVehiclesSeq = vehiclesSequelizeAPI.getDriverVehicles;
export const updateVehicleSeq = vehiclesSequelizeAPI.updateVehicle;
export const switchVehicle = vehiclesSequelizeAPI.switchVehicle;
export const deleteVehicleSeq = vehiclesSequelizeAPI.deleteVehicle;

// Driver Penalties
export const createPenalty = penaltiesSequelizeAPI.createPenalty;
export const getDriverPenalties = penaltiesSequelizeAPI.getDriverPenalties;
export const getTotalPenalties = penaltiesSequelizeAPI.getTotalPenalties;
export const markPenaltyAsPaid = penaltiesSequelizeAPI.markPenaltyAsPaid;
export const deletePenalty = penaltiesSequelizeAPI.deletePenalty;
export const getDriverPenaltySummary = penaltiesSequelizeAPI.getDriverPenaltySummary;
export const payAllPenalties = penaltiesSequelizeAPI.payAllPenalties;

// Ride Locations
export const createRideLocation = rideLocationsSequelizeAPI.createRideLocation;
export const getRideLocations = rideLocationsSequelizeAPI.getRideLocations;
export const updateRideLocation = rideLocationsSequelizeAPI.updateRideLocation;
export const deleteRideLocation = rideLocationsSequelizeAPI.deleteRideLocation;
export const deleteRideLocationsByRideId = rideLocationsSequelizeAPI.deleteRideLocationsByRideId;

// Emergency Calls (Sequelize)
export const createEmergencyCallSeq = emergencyCallsSequelizeAPI.createEmergencyCall;
export const getUserEmergencyCallsSeq = emergencyCallsSequelizeAPI.getUserEmergencyCalls;
export const updateEmergencyCallStatusSeq = emergencyCallsSequelizeAPI.updateEmergencyCallStatus;

// Services (Sequelize)
export const createServiceSeq = servicesSequelizeAPI.createService;
export const getServicesSeq = servicesSequelizeAPI.getServices;
export const getServiceByIdSeq = servicesSequelizeAPI.getServiceById;
export const updateServiceSeq = servicesSequelizeAPI.updateService;

// Add non-suffixed service exports as aliases to the Sequelize implementations
export const createService = servicesSequelizeAPI.createService;
export const getServices = servicesSequelizeAPI.getServices;
export const getServiceById = servicesSequelizeAPI.getServiceById;
export const updateService = servicesSequelizeAPI.updateService;

// Cards (Sequelize)
export const addCardSeq = cardsSequelizeAPI.addCard;
export const getUserCardsSeq = cardsSequelizeAPI.getUserCards;
export const setDefaultCardSeq = cardsSequelizeAPI.setDefaultCard;
export const deleteCardSeq = cardsSequelizeAPI.deleteCard;
// Designated Driver Inspections (Sequelize)
export const createInspectionSeq = designatedDriverInspectionsSequelizeAPI.createInspection;
export const getRideInspectionSeq = designatedDriverInspectionsSequelizeAPI.getRideInspection;
export const updateInspectionSeq = designatedDriverInspectionsSequelizeAPI.updateInspection;

// Driver Services (Sequelize)
export const assignServiceToDriverSeq = driverServicesSequelizeAPI.assignServiceToDriver;
export const getDriverServicesSeq = driverServicesSequelizeAPI.getDriverServices;
export const approveDriverServiceSeq = driverServicesSequelizeAPI.approveDriverService;
export const deactivateDriverServiceSeq = driverServicesSequelizeAPI.deactivateDriverService;

// Biometric Authentications (Sequelize)
export const createBiometricAuthSeq = biometricAuthSequelizeAPI.createBiometricAuth;
export const getUserBiometricAuthsSeq = biometricAuthSequelizeAPI.getUserBiometricAuths;
export const updateBiometricAuthStatusSeq = biometricAuthSequelizeAPI.updateBiometricAuthStatus;
export const createBiometricAuth = biometricAuthSequelizeAPI.createBiometricAuth;
export const getUserBiometricAuths = biometricAuthSequelizeAPI.getUserBiometricAuths;
export const updateBiometricAuthStatus = biometricAuthSequelizeAPI.updateBiometricAuthStatus;

// Analytics (Sequelize)
export const logAnalyticsEventSeq = analyticsSequelizeAPI.logAnalyticsEvent;
export const getUserAnalyticsEventsSeq = analyticsSequelizeAPI.getUserAnalyticsEvents;
export const getEventsByTypeSeq = analyticsSequelizeAPI.getEventsByType;

// SMS Verification Codes (Sequelize)
export const createSmsCodeSeq = smsCodesSequelizeAPI.createSmsCode;
export const verifySmsCodeSeq = smsCodesSequelizeAPI.verifySmsCode;
export const getUserSmsCodesSeq = smsCodesSequelizeAPI.getUserSmsCodes;

// FCM callables
export const registerFCMToken = fcmAPI.registerFCMToken;
export const clearFCMToken = fcmAPI.clearFCMToken;
export const sendTestNotification = fcmAPI.sendTestNotification;
export const notifyProximityRide = fcmAPI.notifyProximityRide;

// Auth API (HTTP + Callable)
export const auth = authAPI.auth;
export const registerCallable = authAPI.registerCallable;
export const checkUserAvailability = authAPI.checkUserAvailability;
export const logSmsVerificationCode = authAPI.logSmsVerificationCode;
export const exchangeIdTokenForCustomToken = authAPI.exchangeIdTokenForCustomToken;
export const hasVerifiedRegisterPhoneLog = authAPI.hasVerifiedRegisterPhoneLog;
export const upgradeClientToDriver = authAPI.upgradeClientToDriver;

// Service Commission History (Sequelize)
export const recordCommissionChangeSeq = commissionHistorySequelizeAPI.recordCommissionChange;
export const getServiceCommissionHistorySeq = commissionHistorySequelizeAPI.getServiceCommissionHistory;
export const getLatestCommissionRateSeq = commissionHistorySequelizeAPI.getLatestCommissionRate;

// Update Status (Realtime DB Sync)
export const updateStatus = updateStatusAPI.updateStatus;
export const updateDriverStatus = updateStatusAPI.updateStatus; // Alias para compatibilidad con Frontend
export const getDriverStatus = updateStatusAPI.getDriverStatus;
export const getDriversStatus = updateStatusAPI.getDriversStatus;

// ⚠️ ELIMINADAS: APIs antiguas de ratings (usar nuevas Sequelize)
// export const skipRating = ratingsAPI.skipRating;
// export const rateRide = ratingsAPI.rateRide;
// export const getUserRating = ratingsAPI.getUserRating;
// export const getRideRatings = ratingsAPI.getRideRatings;

// ⚠️ COMENTADOS: Services, Driver Services, Routing - archivos .old.ts eliminados
// export const getServices = servicesAPI.getServices;
// export const getServiceById = servicesAPI.getServiceById;
// export const createService = servicesAPI.createService;
// export const updateService = servicesAPI.updateService;
// export const getDriverServices = driverServicesAPI.getDriverServices;
// export const getCommissionForRide = driverServicesAPI.getCommissionForRide;
// export const assignServiceToDriver = driverServicesAPI.assignServiceToDriver;
// export const approveDriverService = driverServicesAPI.approveDriverService;
// export const deactivateDriverService = driverServicesAPI.deactivateDriverService;
// export const syncDriverServiceToSupabase = driverServicesSyncAPI.syncDriverServiceToSupabase;
// export const syncDriverServicesBatch = driverServicesSyncAPI.syncDriverServicesBatch;
// export const switchPaymentMethod = switchPaymentMethodAPI.switchPaymentMethod;
// export const getPaymentMethodHistory = switchPaymentMethodAPI.getPaymentMethodHistory;
// export const calculateRoute = routingFunctions.calculateRoute;
// export const reverseGeocode = routingFunctions.reverseGeocode;
// export const geocodeAddress = routingFunctions.geocodeAddress;
// export const searchPlaces = routingFunctions.searchPlaces;
// export const calculateDistance = routingFunctions.calculateDistance;

// ============================================
// TRIGGERS AUTOMÁTICOS
// ============================================

// Auth Triggers
export const onUserCreated = authTriggers.onUserCreated;
// onUserDeleted ELIMINADO - Reemplazado por deleteUserFromSupabase (ver USER MANAGEMENT section)

// Rides Triggers
export const onRideStatusChanged = ridesTriggers.onRideStatusChanged;
export const onRideCreated = ridesTriggers.onRideCreated;

// Geo-sharding triggers para RTDB (activeRidesByArea, driverLocationsByArea, clientsLocationsByArea)
export const syncActiveRidesByArea = geoShardingTriggers.syncActiveRidesByArea;
export const syncDriverLocationsByArea = geoShardingTriggers.syncDriverLocationsByArea;
export const syncClientsLocationsByArea = geoShardingTriggers.syncClientsLocationsByArea;

// Payments Triggers
// ⚠️ DEPRECADO: onPaymentCompleted (función vacía, solo loguea)
// export const onPaymentCompleted = paymentsTriggers.onPaymentCompleted;

// ⚠️ ELIMINADO: Listener automático reemplazado por onPaymentCompletedTrigger
// export const onPaymentStatusChange = paymentStatusListener.onPaymentStatusChange;

// ⚠️ DEPRECADO: Mantener para compatibilidad pero no usar
// export const syncPaymentStatusToPostgres = paymentStatusSync.syncPaymentStatusToPostgres;
// export const syncPostgresToFirebase = paymentStatusSync.syncPostgresToFirebase;
// export const forceSyncPaymentToFirebase = paymentStatusSync.forceSyncPaymentToFirebase;

// ⚠️ COMENTADOS: Payments Sync, FCM Triggers - archivos .old.ts eliminados
// export const syncPaymentsToSupabase = supabasePaymentSyncAPI.syncPaymentsToSupabase;
// export const forceSyncPaymentToSupabase = supabasePaymentSyncAPI.forceSyncPaymentToSupabase;
// export const onRideAccepted = fcmFunctions.sendRideAcceptedNotification;
// export const onRideCancelled = fcmFunctions.sendRideCancelledNotification;

// ============================================
// WEBHOOKS
// ============================================
// ✅ Eliminado: Stripe webhook (sistema de pagos simplificado)

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

// ⚠️ COMENTADOS: Pending Payments - archivos .old.ts eliminados
export const getPendingPayments = pendingPaymentsAPI.getPendingPayments;
// export const processPendingPayment = pendingPaymentsAPI.processPendingPayment;

// ============================================
// USER MANAGEMENT
// ============================================

// Eliminar datos de usuario de Supabase cuando se elimina de Firebase Auth
export const deleteUserFromSupabase = userManagement.deleteUserFromSupabase;

// Eliminar datos manualmente (para testing o limpieza)
export const manualDeleteUserData = userManagement.manualDeleteUserData;


// ============================================
// REALTIME SYNC TO SUPABASE
// ============================================

// ✅ NUEVO: Inicializar listeners de forma lazy (solo cuando se necesita)
// Esto evita errores de credenciales al arrancar en el emulador
let syncListenersInitialized = false;

function ensureSyncListenersInitialized(): void {
  if (!syncListenersInitialized) {
    try {
      // ⚠️ COMENTADO: realtimeSyncAPI - archivos .old.ts eliminados
      // realtimeSyncAPI.initializeRealtimeSyncListeners();
      syncListenersInitialized = true;
    } catch (error) {
      console.warn(`⚠️ Error inicializando sync listeners:`, error);
      // No lanzar error - el sistema funcionará sin listeners
    }
  }
}

// Inicializar listeners después de que el sistema esté listo
// Usar setImmediate para que se ejecute después de que todas las funciones se hayan registrado
setImmediate(() => {
  try {
    ensureSyncListenersInitialized();
  } catch (error) {
    console.warn(`⚠️ Error en inicialización diferida de listeners:`, error);
  }
});

// ⚠️ COMENTADOS: Realtime Sync - archivos .old.ts eliminados
// export const syncActiveRideToSupabase = realtimeSyncAPI.syncActiveRideToSupabase;
// export const syncPaymentStatusToSupabase = realtimeSyncAPI.syncPaymentStatusToSupabase;
// export const syncDriverLocationToSupabase = realtimeSyncAPI.syncDriverLocationToSupabase;

// Exportar triggers
export const onPaymentCompletedAutomatic = onPaymentCompletedTrigger.onPaymentCompleted;
export const onPaymentCanceledAutomatic = onPaymentCompletedTrigger.onPaymentCanceled;
export const onRideCanceledAutomatic = onRideCanceledTrigger.onRideCanceled;
export const onRatingCompletedAutomatic = onRatingCompletedTrigger.onRatingCompleted;

// Notificaciones Push Triggers
//export const onDriverFoundNotification = notificationsAPI.onDriverFound;
//export const onDriverAcceptedNotification = notificationsAPI.onDriverAccepted;
//export const onRideStartedNotification = notificationsAPI.onRideStartedNotification;
//export const onRideCompletedNotification = notificationsAPI.onRideCompletedNotification;
//export const onChatMessageNotification = notificationsAPI.onChatMessageNotification;

// ============================================
// HEALTH CHECK
// ============================================

export const healthCheck = functions.https.onRequest((req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Rundi Functions",
    version: "1.6.4",
  });
});
