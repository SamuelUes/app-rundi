/**
 * Tipos de estado y catálogos de la base de datos Supabase (PostgreSQL).
 *
 * Fuente: database/supabase-only.sql (verificado 2026-10-06, proyecto rundiapp-dev).
 * Los literales reflejan los CHECK constraints, COMMENT ON COLUMN y los valores
 * escritos por el backend (functions/src).
 *
 * Uso:
 *   import { DRIVER_ACCOUNT_STATUSES, type DriverAccountStatus } from '../types';
 */

import type { RideStatus } from './Ride';

// ============================================================================
// drivers
// ============================================================================

/** drivers.account_status — Estado administrativo de la cuenta del conductor. */
export const DRIVER_ACCOUNT_STATUSES = ['pending', 'active', 'suspended', 'rejected'] as const;
export type DriverAccountStatus = (typeof DRIVER_ACCOUNT_STATUSES)[number];

/** drivers.documents_status — Estado de verificación de documentos. 'active' existe en datos reales (enum driver_documents_status) y equivale a 'verified'. */
export const DRIVER_DOCUMENTS_STATUSES = ['pending', 'verified', 'active', 'suspended', 'rejected'] as const;
export type DriverDocumentsStatus = (typeof DRIVER_DOCUMENTS_STATUSES)[number];

/**
 * drivers.designated_rol_requested — Flujo de solicitud de Conductor Designado.
 * El COMMENT documenta 'pending' | 'verified' | 'rejected' | 'revoked', pero el
 * backend escribe 'requested' al registrar la solicitud (drivers-compatibility).
 */
export const DESIGNATED_ROL_REQUESTED_STATUSES = [
  'pending',
  'requested',
  'verified',
  'rejected',
  'revoked',
] as const;
export type DesignatedRolRequestedStatus = (typeof DESIGNATED_ROL_REQUESTED_STATUSES)[number];

// ============================================================================
// vehicles
// ============================================================================

/** vehicles.type — Tipo de vehículo. */
export const VEHICLE_TYPES = ['auto', 'moto', 'suv', 'pickup'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** vehicles.fuel_type — Tipo de combustible (formato tarjeta de circulación NI). */
export const VEHICLE_FUEL_TYPES = ['Gasolina', 'Diesel', 'Eléctrico', 'Híbrido'] as const;
export type VehicleFuelType = (typeof VEHICLE_FUEL_TYPES)[number];

/** vehicles.vehicle_class — Clase según tarjeta de circulación. */
export const VEHICLE_CLASSES = ['PARTICULAR', 'PÚBLICO', 'OFICIAL'] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

/** vehicles.service_type — Servicio declarado en la circulación. */
export const VEHICLE_SERVICE_TYPES = ['PRIVADO', 'PÚBLICO', 'TAXI', 'ALQUILER'] as const;
export type VehicleServiceType = (typeof VEHICLE_SERVICE_TYPES)[number];

// ============================================================================
// rides
// ============================================================================

/**
 * rides.status — CHECK rides_status_check.
 * Coincide 1:1 con RideStatus (types/Ride.ts), que es la fuente canónica.
 */
export type { RideStatus };
export type DbRideStatus = RideStatus;
export const RIDE_STATUSES = [
  'requested',
  'driver_offered',
  'accepted',
  'driver_on_route',
  'driver_arrived',
  'in_progress',
  'pending_payment',
  'rating_completed',
  'rating_skipped',
  'completed',
  'canceled',
] as const satisfies readonly RideStatus[];

/** rides.canceled_by — CHECK rides_canceled_by_check. Quién canceló el viaje. */
export const RIDE_CANCELED_BY = ['client', 'driver'] as const;
export type RideCanceledBy = (typeof RIDE_CANCELED_BY)[number];

/** rides.ride_type — Tipo de viaje ('normal' por defecto). */
export const RIDE_TYPES = ['normal', 'designated_driver'] as const;
export type RideType = (typeof RIDE_TYPES)[number];

/**
 * rides.vehicle_type — Vehículo solicitado para el viaje.
 * El backend normaliza sinónimos a estos tres valores (normalizeVehicleType).
 */
export const RIDE_VEHICLE_TYPES = ['auto', 'moto', 'designated_driver'] as const;
export type RideVehicleType = (typeof RIDE_VEHICLE_TYPES)[number];

/** rides.designated_driver_vehicle — Vehículo del cliente en conductor designado. */
export const DESIGNATED_DRIVER_VEHICLES = ['auto', 'moto'] as const;
export type DesignatedDriverVehicle = (typeof DESIGNATED_DRIVER_VEHICLES)[number];

/** rides.payment_type — Método de pago del viaje. */
export const RIDE_PAYMENT_TYPES = ['cash', 'card_local', 'stripe'] as const;
export type RidePaymentType = (typeof RIDE_PAYMENT_TYPES)[number];

/** rides.biometric_acceptance_type — Biometría requerida para aceptar. */
export const BIOMETRIC_TYPES = ['fingerprint', 'face_id'] as const;
export type BiometricType = (typeof BIOMETRIC_TYPES)[number];

// ============================================================================
// ride_locations
// ============================================================================

/**
 * ride_locations.location_type — 'origin' | 'waypoint' | 'destination' son la ruta;
 * 'tracking' lo usa get_ride_tracking() para puntos GPS en tiempo real.
 */
export const RIDE_LOCATION_TYPES = ['origin', 'waypoint', 'destination', 'tracking'] as const;
export type RideLocationType = (typeof RIDE_LOCATION_TYPES)[number];

// ============================================================================
// payments
// ============================================================================

/**
 * payments.status — Estado del pago.
 * 'payment_completed' llega desde el archivo RTDB (paymentStatus/{rideId});
 * 'failed' es defensivo para pagos con tarjeta rechazados.
 */
export const PAYMENT_STATUSES = [
  'pending',
  'payment_completed',
  'completed',
  'failed',
  'canceled',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** payments.commission_status — Liquidación de la comisión del conductor. */
export const COMMISSION_STATUSES = ['pending', 'paid'] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

/** payments.payment_method — Método del pago registrado. */
export const PAYMENT_METHODS = ['cash', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** payments.payment_provider — Proveedor del pago. */
export const PAYMENT_PROVIDERS = ['cash', 'local'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

/** payments.local_bank — Bancos locales de Nicaragua soportados. */
export const LOCAL_BANKS = ['bac', 'banpro', 'lafise', 'ficohsa', 'avanz'] as const;
export type LocalBank = (typeof LOCAL_BANKS)[number];

/** payments.authentication_method — Cómo se autenticó el pago. */
export const PAYMENT_AUTH_METHODS = ['biometric', 'sms', 'manual'] as const;
export type PaymentAuthMethod = (typeof PAYMENT_AUTH_METHODS)[number];

// ============================================================================
// drivers_recharges (billetera PuntoExpress)
// ============================================================================

/**
 * drivers_recharges.recharge_type — Tipo de movimiento de fondos.
 * El COMMENT lista 'recharge' | 'deduction' | 'adjustment'; el backend también
 * escribe 'commission_deduction' (DriverRechargeRepository).
 */
export const RECHARGE_TYPES = ['recharge', 'deduction', 'commission_deduction', 'adjustment'] as const;
export type RechargeType = (typeof RECHARGE_TYPES)[number];

/** drivers_recharges.source — Origen del movimiento. */
export const RECHARGE_SOURCES = [
  'manual',
  'puntoexpress_webhook',
  'webhook',
  'ride_payment_completion',
  'system',
] as const;
export type RechargeSource = (typeof RECHARGE_SOURCES)[number];

/** drivers_recharges.status — Estado del movimiento. */
export const RECHARGE_STATUSES = ['pending', 'confirmed', 'failed'] as const;
export type RechargeStatus = (typeof RECHARGE_STATUSES)[number];

// ============================================================================
// driver_penalties (legacy — reemplazado por drivers_recharges)
// ============================================================================

/** driver_penalties.status — Estado de la penalización. */
export const PENALTY_STATUSES = ['pending', 'applied', 'canceled'] as const;
export type PenaltyStatus = (typeof PENALTY_STATUSES)[number];

/**
 * driver_penalties.penalty_type — Vocabulario abierto.
 * Conocidos: 'cash_commission_due', 'cancellation', 'no_show', 'complaint', 'fraud'.
 */
export type PenaltyType =
  | 'cash_commission_due'
  | 'cancellation'
  | 'no_show'
  | 'complaint'
  | 'fraud'
  | 'other'
  | (string & {});

// ============================================================================
// emergency_calls
// ============================================================================

/** emergency_calls.user_role — Rol de quien llama. */
export const EMERGENCY_USER_ROLES = ['driver', 'client'] as const;
export type EmergencyUserRole = (typeof EMERGENCY_USER_ROLES)[number];

/** emergency_calls.emergency_type — police (118) o ambulance (102) en Nicaragua. */
export const EMERGENCY_TYPES = ['police', 'ambulance'] as const;
export type EmergencyType = (typeof EMERGENCY_TYPES)[number];

/** emergency_calls.call_status — Resultado de la llamada. */
export const EMERGENCY_CALL_STATUSES = ['initiated', 'completed', 'canceled'] as const;
export type EmergencyCallStatus = (typeof EMERGENCY_CALL_STATUSES)[number];

// ============================================================================
// designated_driver_inspections
// ============================================================================

/** designated_driver_inspections.status — Estado de la inspección del vehículo. */
export const INSPECTION_STATUSES = ['pending', 'completed', 'failed'] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

// ============================================================================
// biometric_authentications / sms_verification_codes
// ============================================================================

/** biometric_authentications.user_type — Tipo de usuario autenticado. */
export const BIOMETRIC_USER_TYPES = ['driver', 'client'] as const;
export type BiometricUserType = (typeof BIOMETRIC_USER_TYPES)[number];

/**
 * biometric_authentications.context — Vocabulario abierto.
 * Conocidos: 'ride_acceptance', 'payment_confirmation', 'cash_payment_confirmation', 'generic'.
 */
export type BiometricContext =
  | 'ride_acceptance'
  | 'payment_confirmation'
  | 'cash_payment_confirmation'
  | 'generic'
  | (string & {});

/**
 * sms_verification_codes.context — Vocabulario abierto.
 * Conocidos: 'payment_confirmation', 'ride_acceptance'.
 */
export type SmsVerificationContext = 'payment_confirmation' | 'ride_acceptance' | (string & {});

// ============================================================================
// services
// ============================================================================

/**
 * services.code — Código único del servicio (seed).
 * 'designated_driver' es el código legado usado como fallback en
 * get_driver_commission_rate() antes de dividirse en auto/moto.
 */
export const SERVICE_CODES = [
  'normal',
  'motorcycle',
  'designated_driver_auto',
  'designated_driver_moto',
  'night',
] as const;
export type ServiceCode = (typeof SERVICE_CODES)[number] | 'designated_driver';

// ============================================================================
// support_call_sessions (WebRTC)
// ============================================================================

/** support_call_sessions.direction — CHECK. Dirección de la llamada. */
export const CALL_DIRECTIONS = ['operator_to_client', 'client_to_operator'] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

/** support_call_sessions.status — CHECK. Estado de la llamada WebRTC. */
export const CALL_STATUSES = [
  'initiated',
  'ringing_client',
  'ringing_operator',
  'accepted',
  'rejected',
  'missed',
  'connected',
  'ended',
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

// ============================================================================
// ride_call_sessions (LiveKit, cliente <-> conductor)
// ============================================================================

/** ride_call_sessions.direction — CHECK. Dirección de la llamada del viaje. */
export const RIDE_CALL_DIRECTIONS = ['client_to_driver', 'driver_to_client'] as const;
export type RideCallDirection = (typeof RIDE_CALL_DIRECTIONS)[number];

/** ride_call_sessions.status — CHECK. Igual que CALL_STATUSES salvo ringing_driver. */
export const RIDE_CALL_STATUSES = [
  'initiated',
  'ringing_client',
  'ringing_driver',
  'accepted',
  'rejected',
  'missed',
  'connected',
  'ended',
] as const;
export type RideCallStatus = (typeof RIDE_CALL_STATUSES)[number];

// ============================================================================
// cms_complaints (tickets de soporte)
// ============================================================================

/** cms_complaints.status — Ciclo de vida de la queja. */
export const COMPLAINT_STATUSES = ['open', 'in_progress', 'resolved', 'rejected'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

/** cms_complaints.priority — Prioridad del ticket. */
export const COMPLAINT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type ComplaintPriority = (typeof COMPLAINT_PRIORITIES)[number];

/** cms_complaints.category — Categoría de la queja. */
export const COMPLAINT_CATEGORIES = ['service', 'driver', 'payment', 'app', 'other'] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

/** cms_complaints.created_by_role — Rol de quien creó la queja. */
export const COMPLAINT_CREATOR_ROLES = ['client', 'driver', 'operator', 'admin'] as const;
export type ComplaintCreatorRole = (typeof COMPLAINT_CREATOR_ROLES)[number];

/** cms_complaints.show — Visibilidad del ticket ('All' = visible, 'only_platform' = oculto en app). */
export const COMPLAINT_SHOW_VALUES = ['All', 'only_platform'] as const;
export type ComplaintShow = (typeof COMPLAINT_SHOW_VALUES)[number];

// ============================================================================
// cms_operator_actions / audit_log
// ============================================================================

/** cms_operator_actions.user_role — Rol del usuario del CMS. */
export const CMS_USER_ROLES = ['admin', 'operator'] as const;
export type CmsUserRole = (typeof CMS_USER_ROLES)[number];

/**
 * cms_operator_actions.action_type — Vocabulario abierto.
 * Conocidos: 'update_driver_status', 'complete_ride', 'register_cash_payment'.
 */
export type OperatorActionType =
  | 'update_driver_status'
  | 'complete_ride'
  | 'register_cash_payment'
  | (string & {});

/** cms_operator_actions.target_type — Entidad afectada por la acción. */
export const OPERATOR_TARGET_TYPES = [
  'ride',
  'driver',
  'client',
  'payment',
  'service',
  'complaint',
  'other',
] as const;
export type OperatorTargetType = (typeof OPERATOR_TARGET_TYPES)[number];

/** audit_log.actor_role — Rol del actor que ejecutó la acción. */
export const AUDIT_ACTOR_ROLES = ['client', 'driver', 'admin', 'operator', 'system'] as const;
export type AuditActorRole = (typeof AUDIT_ACTOR_ROLES)[number];

/** audit_log.action — Tipo de acción auditada. */
export const AUDIT_ACTIONS = ['create', 'update', 'delete', 'restore', 'cancel', 'complete'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** audit_log.entity_type — Entidad afectada. */
export const AUDIT_ENTITY_TYPES = [
  'ride',
  'driver',
  'payment',
  'rating',
  'vehicle',
  'complaint',
  'user',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** audit_log.source — Origen de la acción. */
export const AUDIT_SOURCES = ['api', 'trigger', 'scheduled', 'manual'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

// ============================================================================
// analytics_events
// ============================================================================

/**
 * analytics_events.event_type — Vocabulario abierto.
 * Valores conocidos según AnalyticsEvents (functions/src/utils/analyticsUtils.ts).
 */
export const ANALYTICS_EVENT_TYPES = [
  'ride_requested',
  'ride_accepted',
  'ride_driver_on_route',
  'ride_started',
  'ride_completed',
  'ride_canceled',
  'client_confirmed_driver',
  'price_suggested',
  'price_accepted',
  'price_rejected',
  'driver_offer_sent',
  'driver_offer_accepted',
  'payment_initiated',
  'payment_completed',
  'payment_failed',
  'driver_status_changed',
  'driver_location_updated',
  'user_registered',
  'user_login',
  'user_logout',
  'error_occurred',
  'sync_failed',
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number] | (string & {});

/** analytics_events.platform — Origen del evento ('mobile' | 'backend' en el código). */
export type AnalyticsPlatform = 'mobile' | 'backend' | 'ios' | 'android' | 'web' | (string & {});

// ============================================================================
// cards
// ============================================================================

/** cards.card_brand — Marca de tarjeta ('local' se usa para tarjetas de bancos NI). */
export type CardBrand = 'Visa' | 'Mastercard' | 'Amex' | 'local' | (string & {});

/** cards.bank_name — Banco emisor (valores de muestra documentados). */
export type CardBankName = 'BAC' | 'Banpro' | 'Lafise' | 'Ficohsa' | 'Avanz' | (string & {});

// ============================================================================
// Helpers de validación
// ============================================================================

/** Verifica si un valor pertenece a un catálogo `as const`. */
export const isOneOf = <T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] => typeof value === 'string' && (values as readonly string[]).includes(value);
