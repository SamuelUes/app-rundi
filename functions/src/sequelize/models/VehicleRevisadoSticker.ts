/**
 * VehicleRevisadoSticker Model - Calcomanía de revisado anual (Ley 431 Art. 4.4)
 * Evidencia documental; la vigencia operativa deriva de ITM+emisiones+seguro+rodamiento.
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import { documentColumns } from './docColumns';

class VehicleRevisadoSticker extends Model {
  declare id: string;
  declare vehicle_id: string;
  declare sticker_year: number | null;
  declare issued_at: string | null;
  declare valid_until: string | null;
  declare document_path: string | null;
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

VehicleRevisadoSticker.init(
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
    sticker_year: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    issued_at: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    valid_until: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    ...documentColumns(false),
  },
  {
    sequelize,
    tableName: 'vehicle_revisado_stickers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

export default VehicleRevisadoSticker;
