/**
 * ComplianceRule Model - Reglas del motor de compliance como datos
 * (severidad, blocking, ventanas de alerta, base legal). Sin hardcodear
 * reglas legales en múltiples archivos.
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

export type ComplianceSeverity = 'BLOCKING' | 'WARNING' | 'REQUIRES_REVIEW';

class ComplianceRule extends Model {
  declare code: string;
  declare entity_scope: string;
  declare severity: ComplianceSeverity;
  declare blocking: boolean;
  declare enabled: boolean;
  declare warning_days: number | null;
  declare legal_basis: string | null;
  declare params: Record<string, any>;
  declare description: string | null;
}

ComplianceRule.init(
  {
    code: {
      type: DataTypes.STRING(60),
      primaryKey: true,
    },
    entity_scope: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    severity: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    blocking: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    warning_days: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    legal_basis: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    params: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    description: {
      type: DataTypes.STRING(400),
      allowNull: true,
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
  },
  {
    sequelize,
    tableName: 'compliance_rules',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default ComplianceRule;
