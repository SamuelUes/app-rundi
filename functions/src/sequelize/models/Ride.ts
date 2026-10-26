/**
 * Ride Model - Historial completo de viajes
 * Ubicaciones en tabla ride_locations
 * Viajes activos están en Firebase Realtime DB
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Ride extends Model {
  public id!: string;
  public firebase_ride_id?: string;
  public client_id!: string;
  public driver_id?: string;
  public estimated_distance?: number;
  public estimated_duration?: number;
  public actual_distance?: number;
  public actual_duration?: number;
  public estimated_price?: number;
  public final_fare?: number;
  public client_suggested_price?: number;
  public driver_offered_price?: number;
  public passengers?: number;
  public notes?: string;
  public ride_type?: string;
  public vehicle_type?: string;
  public designated_driver_vehicle?: string;
  public client_vehicle_photo?: string;
  public waypoints_count?: number;
  public has_multiple_stops?: boolean;
  public origin_location_id?: string;
  public destination_location_id?: string;
  public service_id?: string;
  public pricing_snapshot?: Record<string, unknown> | null;
  public feature_codes?: string[];
  public surge_multiplier?: number;
  public commission_rate_applied?: number | null;
  public payment_type?: string;
  public biometric_acceptance_required?: boolean;
  public biometric_acceptance_type?: string;
  public biometric_acceptance_verified?: boolean;
  public biometric_acceptance_at?: Date;
  public status!: string;
  public cancel_reason?: string;
  public canceled_by?: string;
  public requested_at?: Date;
  public accepted_at?: Date;
  public started_at?: Date;
  public completed_at?: Date;
  public canceled_at?: Date;
  public created_at!: Date;
  public updated_at?: Date;
}

Ride.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    firebase_ride_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
      comment: "Firebase Ride ID (para sincronización)",
    },
    client_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "Firebase Auth UID del cliente",
    },
    driver_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Firebase Auth UID del conductor",
    },
    estimated_distance: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    estimated_duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    actual_distance: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    actual_duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    estimated_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    final_fare: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    client_suggested_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    driver_offered_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    passengers: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ride_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'normal',
    },
    vehicle_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'auto',
    },
    designated_driver_vehicle: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: "Para viajes de conductor designado, indica si el cliente requiere 'auto' o 'moto'",
    },
    client_vehicle_photo: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "URL de la foto del vehículo del cliente (solo para conductor designado)",
    },
    waypoints_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: "Cantidad de paradas intermedias (sin contar origen ni destino)",
    },
    has_multiple_stops: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: "Indica si hay múltiples paradas (waypoints_count > 0)",
    },
    origin_location_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Referencia a la ubicación de origen en ride_locations",
    },
    destination_location_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Referencia a la ubicación de destino en ride_locations",
    },
    service_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Service aplicado; night solo se conserva para viajes legacy",
    },
    pricing_snapshot: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Snapshot inmutable de la configuración de pricing usada al crear el viaje',
    },
    feature_codes: {
      type: DataTypes.ARRAY(DataTypes.STRING(50)),
      allowNull: false,
      defaultValue: [],
    },
    surge_multiplier: {
      type: DataTypes.DECIMAL(4, 2),
      allowNull: false,
      defaultValue: 1,
    },
    commission_rate_applied: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
      comment: 'Tasa de comisión capturada al solicitar el viaje',
    },
    payment_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'cash',
      comment: "Método de pago: cash (efectivo), card_local (bancos locales)",
    },
    biometric_acceptance_required: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: "Indica si se requiere biometría para aceptar el viaje (conductor designado)",
    },
    biometric_acceptance_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: "Tipo de biometría requerida: fingerprint (huella) o face_id (reconocimiento facial)",
    },
    biometric_acceptance_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: "Indica si la biometría fue verificada correctamente",
    },
    biometric_acceptance_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp de cuando se verificó la biometría",
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'requested',
    },
    cancel_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    canceled_by: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: "Indica quién canceló el viaje: client o driver",
    },
    requested_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
    accepted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    canceled_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    modelName: 'Ride',
    tableName: 'rides',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

export default Ride;
