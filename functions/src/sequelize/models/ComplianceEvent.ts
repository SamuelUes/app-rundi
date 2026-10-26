/**
 * ComplianceEvent Model - Bitácora de ciclo de vida de documentos
 * (patrón audit_log; inmutable).
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class ComplianceEvent extends Model {
  declare id: string;
  declare entity_table: string;
  declare entity_id: string;
  declare driver_id: string | null;
  declare vehicle_id: string | null;
  declare event: string;
  declare actor_uid: string;
  declare actor_role: string;
  declare payload: Record<string, any> | null;
  declare created_at: Date;
}

ComplianceEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    entity_table: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    entity_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    driver_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    vehicle_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    event: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    actor_uid: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'system',
    },
    actor_role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'system',
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'compliance_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

export default ComplianceEvent;
