/**
 * VehicleCirculationCard Model - Licencia de circulación del vehículo
 * Documento PERMANENTE en Nicaragua (Ley 431 Art. 9): se renueva por
 * cambio de dueño/domicilio/deterioro, no por vencimiento periódico.
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import { documentColumns } from './docColumns';

class VehicleCirculationCard extends Model {
  declare id: string;
  declare vehicle_id: string;
  declare card_number: string | null;
  declare issued_at: string | null;
  declare declared_valid_until: string | null;
  declare declared_plate: string | null;
  declare declared_vin: string | null;
  declare declared_chasis: string | null;
  declare declared_motor: string | null;
  declare declared_brand: string | null;
  declare declared_model: string | null;
  declare declared_year: number | null;
  declare declared_color: string | null;
  declare declared_vehicle_class: string | null;
  declare declared_service_type: string | null;
  declare declared_owner_name: string | null;
  declare document_path: string | null;
  declare document_path_back: string | null;
  declare status: string;
  declare verified_at: Date | null;
  declare verified_by: string | null;
  declare verification_method: string;
  declare rejection_reason: string | null;
  declare review_notes: string | null;
  declare extracted_data: Record<string, any> | null;
  declare extraction_confidence: number | null;
  declare extracted_at: Date | null;
  declare supersedes_id: string | null;
  declare is_current: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

VehicleCirculationCard.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    vehicle_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    card_number: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    issued_at: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    declared_valid_until: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Fecha declarada si el documento la trae; NO es vencimiento legal',
    },
    declared_plate: { type: DataTypes.STRING(20), allowNull: true },
    declared_vin: { type: DataTypes.STRING(50), allowNull: true },
    declared_chasis: { type: DataTypes.STRING(50), allowNull: true },
    declared_motor: { type: DataTypes.STRING(50), allowNull: true },
    declared_brand: { type: DataTypes.STRING(50), allowNull: true },
    declared_model: { type: DataTypes.STRING(50), allowNull: true },
    declared_year: { type: DataTypes.INTEGER, allowNull: true },
    declared_color: { type: DataTypes.STRING(30), allowNull: true },
    declared_vehicle_class: { type: DataTypes.STRING(30), allowNull: true },
    declared_service_type: { type: DataTypes.STRING(30), allowNull: true },
    declared_owner_name: { type: DataTypes.STRING(200), allowNull: true },
    ...documentColumns(true),
  },
  {
    sequelize,
    tableName: 'vehicle_circulation_cards',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

export default VehicleCirculationCard;
