/**
 * Vehicle Model - Vehículos de conductores
 * Datos de Circulación según formato nicaragüense
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Vehicle extends Model {
  declare id: string;
  declare driver_id: string;
  declare plate: string;
  declare brand: string;
  declare model: string;
  declare year: number;
  declare color: string;
  declare type: string;
  declare motor: string | null;
  declare chasis: string | null;
  declare vin: string | null;
  declare cylinders: number | null;
  declare passengers: number | null;
  declare fuel_type: string | null;
  declare tonnage: number | null;
  declare vehicle_class: string | null;
  declare service_type: string | null;
  declare lien: string | null;
  declare emission_date: Date | null;
  declare registration_number: string | null;
  declare registration_expiry: Date | null;
  declare registration_photo_front: string | null;
  declare registration_photo_back: string | null;
  declare insurance_number: string | null;
  declare insurance_company: string | null;
  declare insurance_start_date: Date | null;
  declare insurance_expiry: Date | null;
  declare insurance_photo: string | null;
  declare is_4x4: boolean;
  declare vehicle_photo: string | null;
  declare is_active: boolean;
  declare compliance_status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

Vehicle.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    driver_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    plate: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    brand: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    model: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    color: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'auto',
      comment: "Tipo: auto, moto, suv, pickup",
    },
    motor: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Número de motor (de tarjeta de circulación)",
    },
    chasis: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Número de chasis (de tarjeta de circulación)",
    },
    vin: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "VIN - Vehicle Identification Number",
    },
    cylinders: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Número de cilindros del motor",
    },
    passengers: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Capacidad de pasajeros",
    },
    fuel_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: "Tipo de combustible: Gasolina, Diesel, Eléctrico, Híbrido",
    },
    tonnage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 0,
      comment: "Tonelaje del vehículo",
    },
    vehicle_class: {
      type: DataTypes.STRING(30),
      allowNull: true,
      comment: "Clase: PARTICULAR, PÚBLICO, OFICIAL",
    },
    service_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: "Servicio: PRIVADO, PÚBLICO, TAXI, ALQUILER",
    },
    lien: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'NINGUNO',
      comment: "Gravamen del vehículo (NINGUNO, BANCO, etc.)",
    },
    emission_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Fecha de emisión de la tarjeta de circulación",
    },
    registration_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    registration_expiry: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    registration_photo_front: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "URL de foto frontal de circulación (Supabase Storage)",
    },
    registration_photo_back: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "URL de foto trasera de circulación (Supabase Storage)",
    },
    insurance_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Número de póliza de seguro",
    },
    insurance_company: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    insurance_start_date: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Fecha de inicio de la póliza de seguro",
    },
    insurance_expiry: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    insurance_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "URL de foto de póliza de seguro (Supabase Storage)",
    },
    is_4x4: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: "Indica si es 4x4 (requerido para conductor designado)",
    },
    vehicle_photo: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true,
      comment: "Indica si el vehículo está activo",
    },
    compliance_status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pending_verification',
      comment: "Estado derivado del compliance engine",
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
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
    tableName: 'vehicles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

export default Vehicle;
