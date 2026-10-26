/**
 * ComplianceEvaluation Model - Snapshot auditable de cada evaluación
 * canDriverOperate / canVehicleOperate / canDriverOperateVehicle.
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class ComplianceEvaluation extends Model {
  declare id: string;
  declare driver_id: string | null;
  declare vehicle_id: string | null;
  declare service_code: string | null;
  declare evaluation_type: string;
  declare allowed: boolean;
  declare status: string;
  declare reasons: any[];
  declare rules_version: string | null;
  declare evaluated_by: string;
  declare evaluated_at: Date;
}

ComplianceEvaluation.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    driver_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    vehicle_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    service_code: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    evaluation_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pair',
      comment: 'driver|vehicle|pair',
    },
    allowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    reasons: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    rules_version: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    evaluated_by: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'system',
    },
    evaluated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'compliance_evaluations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  }
);

export default ComplianceEvaluation;
