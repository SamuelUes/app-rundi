/**
 * Service Model - Servicios disponibles
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Service extends Model {
  declare id: string;
  declare name: string;
  declare description: string | null;
  declare code: string;
  declare commission_rate: number;
  declare base_price: number;
  declare price_per_km: number | null;
  declare price_per_minute: number | null;
  declare minimum_fare: number;
  declare max_distance_km: number | null;
  declare vehicle_types: object | null;
  declare requires_special_license: boolean;
  declare available_hours: object | null;
  declare icon: string | null;
  declare color: string | null;
  declare display_order: number;
  declare is_active: boolean;
  declare is_featured: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

Service.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    commission_rate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
    },
    base_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    price_per_km: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
    },
    price_per_minute: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
    },
    minimum_fare: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    max_distance_km: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    vehicle_types: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    requires_special_license: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    available_hours: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    icon: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    color: {
      type: DataTypes.STRING(7),
      allowNull: true,
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    is_featured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'services',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default Service;
