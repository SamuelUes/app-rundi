/**
 * Service Model - Servicios disponibles
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Service extends Model {
  declare id: string;
  declare name: string;
  declare description: string | null;
  declare commission_rate: number;
  declare base_price: number | null;
  declare code: string | null;
  declare is_active: boolean;
  declare is_featured: boolean;
  declare created_at: Date;
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
      allowNull: true,
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
      allowNull: true,
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
  },
  {
    sequelize,
    tableName: 'services',
    timestamps: false,
  }
);

export default Service;
