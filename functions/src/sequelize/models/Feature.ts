import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Feature extends Model {
  declare id: string;
  declare code: string;
  declare name: string;
  declare description: string | null;
  declare enabled: boolean;
  declare starts_at: Date | null;
  declare ends_at: Date | null;
  declare start_time: string | null;
  declare end_time: string | null;
  declare timezone: string;
  declare pricing_type: string;
  declare pricing_value: number;
  declare priority: number;
  declare stackable: boolean;
  declare eligibility_subject: 'none' | 'driver' | 'vehicle';
  declare eligibility_mode: 'none' | 'manual' | 'automatic' | 'hybrid';
  declare eligibility_rules: Record<string, unknown>;
  declare metadata: Record<string, unknown>;
  declare created_at: Date;
  declare updated_at: Date;
}

Feature.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    starts_at: { type: DataTypes.DATE, allowNull: true },
    ends_at: { type: DataTypes.DATE, allowNull: true },
    start_time: { type: DataTypes.TIME, allowNull: true },
    end_time: { type: DataTypes.TIME, allowNull: true },
    timezone: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'America/Managua' },
    pricing_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'none' },
    pricing_value: { type: DataTypes.DECIMAL(10, 4), allowNull: false, defaultValue: 0 },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    stackable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    eligibility_subject: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'none' },
    eligibility_mode: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'none' },
    eligibility_rules: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'features',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default Feature;
