/**
 * Rundi - Firebase Functions
 * Backend completo en Firebase Functions + Supabase PostgreSQL
 */

import "./config/env";
import * as functions from "firebase-functions/v1";
import "./config/firebase";
import { checkRateLimit } from "./utils/rateLimiter";

import * as ridesSequelizeAPI from "./api/rides_sequelize";
import * as driversSequelizeAPI from "./api/drivers_sequelize";
import * as paymentsSequelizeAPI from "./api/payments_sequelize";
import * as ratingsSequelizeAPI from "./api/ratings_sequelize";
import * as priceNegotiationSequelizeAPI from "./api/price_negotiation_sequelize";
import * as vehiclesSequelizeAPI from "./api/vehicles_sequelize";
import * as rechargeFundsAPI from "./api/recharge_funds";
import * as rideLocationsSequelizeAPI from "./api/ride_locations_sequelize";
import * as emergencyCallsSequelizeAPI from "./api/emergency_calls_sequelize";
import * as servicesSequelizeAPI from "./api/services_sequelize";
import * as cardsSequelizeAPI from "./api/cards_sequelize";
import * as designatedDriverInspectionsSequelizeAPI from "./api/designated_driver_inspections_sequelize";
import * as driverServicesSequelizeAPI from "./api/driver_services_sequelize";
import * as biometricAuthSequelizeAPI from "./api/biometric_authentications_sequelize";
import * as analyticsSequelizeAPI from "./api/analytics_sequelize";
import * as clientProfilesAPI from "./api/clientProfiles";
import * as supportComplaintsAPI from "./api/support_complaints";
import * as supportCallsAPI from "./api/support_calls";
import * as livekitCallsAPI from "./api/livekit_calls";
import * as rideCallsAPI from "./api/ride_calls";
import * as smsCodesSequelizeAPI from "./api/sms_verification_codes_sequelize";
import * as commissionHistorySequelizeAPI from "./api/service_commission_history_sequelize";
import * as authAPI from "./api/auth";
import * as pendingPaymentsAPI from "./api/pendingPayments_sequelize";
import * as regionAvailabilityAPI from "./api/region_availability";
import * as preflightAPI from "./api/getPreflightData";
import * as publicRideTrackingAPI from "./api/WebPage_publicRideTracking";
import * as rideShareCodesAPI from "./api/rideShareCodes";
import * as designatedCrewAPI from "./api/designatedCrew";

import * as updateStatusAPI from "./api/updateStatus";
import * as driversCompatibilityAPI from "./api/drivers-compatibility";
// ✅ NUEVAS: Funciones de historial y ganancias
import * as rideHistoryAPI from "./api/rideHistory";
// ✅ NUEVAS: Funciones de tarjetas y perfil
import * as cardsManagementAPI from "./api/cardsManagement";
import * as driverProfileAPI from "./api/driverProfile";

// Importar user management
import * as userManagement from "./user/deleteUserData";

// Importar triggers
import * as onPaymentCompletedTrigger from "./triggers/onPaymentCompleted";
import * as onActiveRidesWriteTrigger from "./triggers/onActiveRidesWrite";
import * as onCallEndedTrigger from "./triggers/onCallEnded";
import { handleDelayedRideStatus } from "./helpers/cloudTasks";

// Importar notificaciones
// import * as notificationsAPI from "./api/notifications";
import * as fcmAPI from "./api/fcm";
import * as adminNotificationsAPI from "./api/adminNotifications";
// Importar webhooks
// ✅ Eliminado: Stripe webhook (sistema de pagos simplificado)

// Importar scheduled functions
import * as cleanupOldRidesAPI from "./scheduled/cleanupOldRides";
import * as cleanupOrphanPaymentsAPI from "./scheduled/cleanupOrphanPayments";
import * as cleanupOldChatsAPI from "./scheduled/cleanupOldChats";
import * as cleanupRealtimeDB from "./scheduled/cleanupRealtimeDB";
import * as programmedRidesScheduled from "./scheduled/programmedRides";
import * as cleanupProgrammedRidesAPI from "./scheduled/cleanupProgrammedRides";
import * as processPendingArchiveAPI from "./scheduled/processPendingArchive";
import * as complianceDailyAPI from "./scheduled/complianceDaily";
import * as expireStaleCallsAPI from "./scheduled/expireStaleCalls";
import * as complianceAPI from "./api/compliance";
import * as supportChatNotifications from "./triggers/supportChatNotifications";
import * as userRolesAPI from "./api/userRoles";

// Importar presence functions
import * as presenceAPI from "./api/presence";
import * as sessionsAPI from "./api/sessions";
import * as geoShardingTriggers from "./triggers/geoSharding";
import * as driverOfflineTriggers from "./triggers/driverOffline";
import { calculateRidePrice as calculateRidePriceHelper, type VehicleType as BackendVehicleType, type RideType as BackendRideType } from "./helpers/priceCalculator";
import { corsConfig } from "./config/functions-config";

// ============================================
// API ENDPOINTS
// ============================================

// ✅ NUEVAS APIs CON SEQUELIZE + ZOD
// Rides
export const createRide = ridesSequelizeAPI.createRide;
export const requestRide = ridesSequelizeAPI.createRide; // Alias para compatibilidad
export const createProgrammedRide = ridesSequelizeAPI.createProgrammedRide;
export const assignDriverToProgrammedRide = ridesSequelizeAPI.assignDriverToProgrammedRide;
export const claimProgrammedRideByCode = ridesSequelizeAPI.claimProgrammedRideByCode;
export const confirmProgrammedRideClient = ridesSequelizeAPI.confirmProgrammedRideClient;
export const confirmProgrammedRideDriver = ridesSequelizeAPI.confirmProgrammedRideDriver;
export const cancelProgrammedRide = ridesSequelizeAPI.cancelProgrammedRide;
export const acceptRide = ridesSequelizeAPI.acceptRide;
export const confirmDriver = ridesSequelizeAPI.confirmDriver; // ✅ NUEVO: Cliente confirma conductor específico
export const markDriverOnRoute = ridesSequelizeAPI.markDriverOnRoute;
export const markDriverArrived = ridesSequelizeAPI.markDriverArrived;
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
export const generateCashCode = paymentsSequelizeAPI.generateCashCode;

// Price Negotiation - ✅ NUEVO: Sequelize
// ✅ ACTIVOS: negotiatePrice, acceptClientPrice, makeCounterOffer, acceptCounterOffer, rejectCounterOffer
export const negotiatePrice = priceNegotiationSequelizeAPI.negotiatePrice;
export const acceptClientPrice = priceNegotiationSequelizeAPI.acceptClientPrice;
export const makeCounterOffer = priceNegotiationSequelizeAPI.makeCounterOffer;
export const acceptCounterOffer = priceNegotiationSequelizeAPI.acceptCounterOffer;
export const rejectCounterOffer = priceNegotiationSequelizeAPI.rejectCounterOffer;
// Alias de compatibilidad para clientes antiguos
export const sendDriverOffer = priceNegotiationSequelizeAPI.sendDriverOffer;

// Client profiles
export const getClientProfile = clientProfilesAPI.getClientProfile;

// Support / Complaints
export const createSupportComplaint = supportComplaintsAPI.createSupportComplaint;
export const getSupportTickets = supportComplaintsAPI.getSupportTickets;
export const updateSupportTicket = supportComplaintsAPI.updateSupportTicket;
export const requestSupportCall = supportComplaintsAPI.requestSupportCall;
export const joinSupportChat = supportComplaintsAPI.joinSupportChat;
export const deleteSupportTicket = supportComplaintsAPI.deleteSupportTicket;
export const initiateSupportCallHttp = supportCallsAPI.initiateSupportCallHttp;
export const initiateRideCallHttp = rideCallsAPI.initiateRideCallHttp;
// Router HTTP `api`: /calls/livekit-token, /calls/initiate, /calls/request, /calls/ride/initiate, /livekit/webhook
export const api = livekitCallsAPI.api;

// Region availability
export const checkRegionAvailability = regionAvailabilityAPI.checkRegionAvailability;
export const checkRegionAvailabilityHttp = regionAvailabilityAPI.checkRegionAvailabilityHttp;
export const getPreflightData = preflightAPI.getPreflightData;
export const getPreflightDataHttp = preflightAPI.getPreflightDataHttp;
export const acceptPreflightTerms = preflightAPI.acceptPreflightTerms;
export const getDriverRechargeFundsSummary = rechargeFundsAPI.getDriverRechargeFundsSummary;
export const createDriverRechargeManual = rechargeFundsAPI.createDriverRechargeManual;
export const puntoExpressRechargeWebhookHttp = rechargeFundsAPI.puntoExpressRechargeWebhookHttp;

// Public ride tracking (Landing page)
export const getPublicRideTracking = publicRideTrackingAPI.getPublicRideTracking;
export const createRideShareToken = rideShareCodesAPI.createRideShareToken;

// Conductor designado con colega (capitán + seguidor)
export const searchDesignatedCrewCandidates = designatedCrewAPI.searchDesignatedCrewCandidates;
export const sendDesignatedCrewInvite = designatedCrewAPI.sendDesignatedCrewInvite;
export const respondDesignatedCrewInvite = designatedCrewAPI.respondDesignatedCrewInvite;
export const leaveDesignatedCrew = designatedCrewAPI.leaveDesignatedCrew;

const isSelectedFeatureCodeList = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 50 &&
  value.every((code) => typeof code === 'string' && code.length > 0 && code.length <= 100);

const parseOptionalCalculationAt = (value: unknown): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

export const calculateRidePriceHttp = functions.https.onRequest((req, res) => {
  const corsHandler = require('cors')(corsConfig);
  corsHandler(req, res, async () => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const clientIp = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const rateLimit = checkRateLimit(`price:${clientIp}`, 20);
  if (!rateLimit.allowed) {
    res.status(429).json({ error: "Too many requests", retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000) });
    return;
  }

  try {
    const {
      distanceInMeters,
      durationInSeconds,
      vehicleType = "car",
      rideType = "normal",
      originLat,
      originLng,
      driverId,
      serviceCodeOverride,
      extraStops,
      selectedFeatureCodes,
      calculationAt: calculationAtValue,
    } = req.body ?? {};

    if (typeof distanceInMeters !== "number" || typeof durationInSeconds !== "number") {
      res.status(400).json({ error: "distanceInMeters and durationInSeconds are required numbers" });
      return;
    }
    if (selectedFeatureCodes !== undefined && !isSelectedFeatureCodeList(selectedFeatureCodes)) {
      res.status(400).json({ error: "selectedFeatureCodes must be an array of strings" });
      return;
    }
    const calculationAt = parseOptionalCalculationAt(calculationAtValue);
    if (calculationAt === null) {
      res.status(400).json({ error: "calculationAt must be a valid date" });
      return;
    }

    const result = await calculateRidePriceHelper(
      distanceInMeters,
      durationInSeconds,
      vehicleType as BackendVehicleType,
      rideType as BackendRideType,
      originLat,
      originLng,
      {
        driverId,
        serviceCodeOverride,
        extraStops,
        selectedFeatureCodes,
        calculationAt,
        originLat,
        originLng,
      },
    );

    res.json(result);
  } catch (error) {
    console.error("❌ calculateRidePriceHttp error:", error);
    if (error instanceof RangeError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: "Failed to calculate ride price" });
  }
  });
});

export const calculateRidePricesHttp = functions.https.onRequest((req, res) => {
  const corsHandler = require('cors')(corsConfig);
  corsHandler(req, res, async () => {
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const clientIp = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const rateLimit = checkRateLimit(`price:${clientIp}`, 20);
  if (!rateLimit.allowed) {
    res.status(429).json({ error: "Too many requests", retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000) });
    return;
  }

  try {
    const {
      distanceInMeters,
      durationInSeconds,
      originLat,
      originLng,
      extraStops,
      calculationAt: calculationAtValue,
      variants,
    } = req.body ?? {};

    if (typeof distanceInMeters !== "number" || typeof durationInSeconds !== "number") {
      res.status(400).json({ error: "distanceInMeters and durationInSeconds are required numbers" });
      return;
    }

    if (!Array.isArray(variants) || variants.length === 0 || variants.length > 8) {
      res.status(400).json({ error: "variants must be an array with 1-8 entries" });
      return;
    }
    const calculationAt = parseOptionalCalculationAt(calculationAtValue);
    if (calculationAt === null) {
      res.status(400).json({ error: "calculationAt must be a valid date" });
      return;
    }
    if (variants.some((variant: any) =>
      variant?.selectedFeatureCodes !== undefined && !isSelectedFeatureCodeList(variant.selectedFeatureCodes),
    )) {
      res.status(400).json({ error: "Each selectedFeatureCodes value must be an array of strings" });
      return;
    }

    const entries = await Promise.all(
      variants.map(async (variant: any, index: number) => {
        const key = typeof variant?.key === "string" && variant.key.trim().length > 0
          ? variant.key
          : `variant_${index}`;
        try {
          const result = await calculateRidePriceHelper(
            distanceInMeters,
            durationInSeconds,
            (variant?.vehicleType ?? "car") as BackendVehicleType,
            (variant?.rideType ?? "normal") as BackendRideType,
            originLat,
            originLng,
            {
              driverId: variant?.driverId,
              serviceCodeOverride: variant?.serviceCodeOverride,
              extraStops,
              selectedFeatureCodes: variant?.selectedFeatureCodes,
              calculationAt,
              originLat,
              originLng,
            },
          );
          return [key, result] as const;
        } catch (error) {
          console.error(`❌ calculateRidePricesHttp variant ${key} error:`, error);
          return [key, null] as const;
        }
      }),
    );

    res.json({ results: Object.fromEntries(entries) });
  } catch (error) {
    console.error("❌ calculateRidePricesHttp error:", error);
    res.status(500).json({ error: "Failed to calculate ride prices" });
  }
  });
});


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

// ✅ ACTIVAS: Ride History - Historial y Ganancias
export const diagnosticRides = rideHistoryAPI.diagnosticRides;
export const getMyRides = rideHistoryAPI.getMyRides;
export const getDriverEarnings = rideHistoryAPI.getDriverEarnings;
export const getDriverEarningsStats = rideHistoryAPI.getDriverStats;
export const getEarningsByDay = rideHistoryAPI.getEarningsByDay;

// ✅ NUEVAS APIs CON SEQUELIZE + ZOD
// Ratings
export const submitRating = ratingsSequelizeAPI.submitRating;
export const getDriverRatings = ratingsSequelizeAPI.getDriverRatings;
export const getRecentRatings = ratingsSequelizeAPI.getRecentRatings;
export const getDriverPublicInsights = ratingsSequelizeAPI.getDriverPublicInsights;

// Vehicles (Sequelize)
export const createVehicleSeq = vehiclesSequelizeAPI.createVehicle;
export const createVehicleCompleteSeq = vehiclesSequelizeAPI.createVehicleComplete;
export const getVehicleSeq = vehiclesSequelizeAPI.getVehicle;
export const getDriverVehiclesSeq = vehiclesSequelizeAPI.getDriverVehicles;
export const updateVehicleSeq = vehiclesSequelizeAPI.updateVehicle;
export const switchVehicle = vehiclesSequelizeAPI.switchVehicle;
export const deleteVehicleSeq = vehiclesSequelizeAPI.deleteVehicle;

// Compliance documental (documentos + evaluación + revisión admin)
export const submitDriverLicense = complianceAPI.submitDriverLicense;
export const submitVehicleDocument = complianceAPI.submitVehicleDocument;
export const getMyDocuments = complianceAPI.getMyDocuments;
export const getComplianceStatus = complianceAPI.getComplianceStatus;
export const canOperateVehicle = complianceAPI.canOperateVehicle;
export const acknowledgeDocumentAlert = complianceAPI.acknowledgeDocumentAlert;
export const listDocumentsForReview = complianceAPI.listDocumentsForReview;
export const reviewDocument = complianceAPI.reviewDocument;
export const getDocumentHistory = complianceAPI.getDocumentHistory;

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
export const submitDesignatedDriverRideInspection = designatedDriverInspectionsSequelizeAPI.submitDesignatedDriverRideInspection;
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
export const sendAdminNotification = adminNotificationsAPI.sendAdminNotification;
export const syncUserRoleFromCms = userRolesAPI.syncUserRoleFromCms;
export const syncAppUserRole = userRolesAPI.syncAppUserRole;

// Auth API (HTTP + Callable)
export const auth = authAPI.auth;
export const registerCallable = authAPI.registerCallable;
export const checkUserAvailability = authAPI.checkUserAvailability;
export const logSmsVerificationCode = authAPI.logSmsVerificationCode;
export const getSupabaseJwt = authAPI.getSupabaseJwt;
export const exchangeIdTokenForCustomToken = authAPI.exchangeIdTokenForCustomToken;
export const hasVerifiedRegisterPhoneLog = authAPI.hasVerifiedRegisterPhoneLog;
export const upgradeClientToDriver = authAPI.upgradeClientToDriver;
export const deactivateUserAccount = authAPI.deactivateUserAccount;

// Service Commission History (Sequelize)
export const recordCommissionChangeSeq = commissionHistorySequelizeAPI.recordCommissionChange;
export const getServiceCommissionHistorySeq = commissionHistorySequelizeAPI.getServiceCommissionHistory;
export const getLatestCommissionRateSeq = commissionHistorySequelizeAPI.getLatestCommissionRate;

// Update Status (Realtime DB Sync)
export const updateStatus = updateStatusAPI.updateStatus;
export const updateDriverStatus = updateStatusAPI.updateStatus; // Alias para compatibilidad con Frontend
export const getDriverStatus = updateStatusAPI.getDriverStatus;
export const getDriversStatus = updateStatusAPI.getDriversStatus;

// ============================================
// TRIGGERS AUTOMÁTICOS
// ============================================

// Auth Triggers - onUserCreated removed (was no-op, only logged)
// onUserDeleted ELIMINADO - Reemplazado por deleteUserFromSupabase (ver USER MANAGEMENT section)

// Rides Triggers - onRideStatusChanged & onRideCreated removed (were no-ops on wrong DB)

// Geo-sharding triggers para RTDB (activeRidesByArea, driverLocationsByArea, clientsLocationsByArea)
export const syncActiveRidesByArea = geoShardingTriggers.syncActiveRidesByArea;
export const syncProgrammedRidesByArea = geoShardingTriggers.syncProgrammedRidesByArea;
export const syncDriverLocationsByArea = geoShardingTriggers.syncDriverLocationsByArea;
export const syncClientsLocationsByArea = geoShardingTriggers.syncClientsLocationsByArea;
export const onSupportChatMessage = supportChatNotifications.onSupportChatMessage;

// Rechaza ofertas pendientes cuando un conductor pasa a offline
export const rejectDriverOffersOnOffline = driverOfflineTriggers.rejectDriverOffersOnOffline;
export const markCrewFollowerAbandonedOnOffline = driverOfflineTriggers.markCrewFollowerAbandonedOnOffline;

// ============================================
// WEBHOOKS
// ============================================
// ✅ Eliminado: Stripe webhook (sistema de pagos simplificado)

// ============================================
// SCHEDULED FUNCTIONS (Cron Jobs)
// ============================================

// Limpiar viajes completados/cancelados (cada hora)
export const cleanupOldRidesScheduled = cleanupOldRidesAPI.cleanupOldRides;

// Limpiar payments huérfanos (cada 6 horas)
export const cleanupOrphanPaymentsScheduled = cleanupOrphanPaymentsAPI.cleanupOrphanPayments;

// Limpiar chats huérfanos (cada 12 horas)
export const cleanupOldChatsScheduled = cleanupOldChatsAPI.cleanupOldChats;

// Procesar viajes programados (cada minuto)
export const processProgrammedRidesScheduled = programmedRidesScheduled.processProgrammedRides;

// Limpiar viajes programados antiguos (diario a las 3 AM)
export const cleanupProgrammedRides = cleanupProgrammedRidesAPI.cleanupProgrammedRides;

// Procesar cola de reintentos de archivado a Supabase (cada 5 minutos)
export const processPendingArchiveScheduled = processPendingArchiveAPI.processPendingArchive;

// Evaluación diaria de compliance documental + alertas de vencimiento (03:00 Managua)
export const complianceDailyEvaluation = complianceDailyAPI.complianceDailyEvaluation;

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

export const cleanupInactiveUsers = cleanupRealtimeDB.cleanupInactiveUsers;
export const expireStaleDriverAvailability = cleanupRealtimeDB.expireStaleDriverAvailability;

// Marcar missed las llamadas de soporte ringing que superaron acceptDeadline (cada minuto)
export const expireStaleCallsScheduled = expireStaleCallsAPI.expireStaleCalls;

// ============================================
// PENDING PAYMENTS
// ============================================

// Pending Payments
export const getPendingPayments = pendingPaymentsAPI.getPendingPayments;

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

// Exportar triggers
export const onPaymentCompletedAutomatic = onPaymentCompletedTrigger.onPaymentCompleted;
export const onPaymentCanceledAutomatic = onPaymentCompletedTrigger.onPaymentCanceled;
export const onActiveRidesWriteAutomatic = onActiveRidesWriteTrigger.onActiveRidesWrite;
// Archiva calls/{callId} en support_call_sessions al llegar a estado terminal
export const onCallEnded = onCallEndedTrigger.onCallEnded;

// Cloud Tasks HTTP handler for delayed ride status updates
export const handleDelayedRideStatusEndpoint = handleDelayedRideStatus;

// Cloud Tasks queue is ensured lazily by scheduleDelayedTask, not on cold start

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
    version: "1.9.8",
  });
});
