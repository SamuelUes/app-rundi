/**
 * Driver Model - Modelo de conductores
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Driver extends Model {
  public id!: string;
  public user_id!: string;
  public profile_photo?: string;
  public license_number!: string;
  public license_expiry!: Date;
  public license_photo_front?: string;
  public license_photo_back?: string;
  public department?: string;
  public municipality?: string;
  public status!: string;
  public verified_at?: Date;
  public total_rides!: number;
  public average_rating!: number;
  public total_earnings!: number;
  public created_at!: Date;
  public updated_at!: Date;
}

Driver.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    profile_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    license_number: {
      type: DataTypes.STRING,
      allowNull: true, // ✅ Permitir null - se completa durante verificación
    },
    license_expiry: {
      type: DataTypes.DATE,
      allowNull: true, // ✅ Permitir null - se completa durante verificación
    },
    license_photo_front: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    license_photo_back: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    municipality: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'active', 'suspended', 'rejected'),
      defaultValue: 'pending',
    },
    verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    total_rides: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    average_rating: {
      type: DataTypes.DECIMAL(3, 2),
    },
    total_earnings: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'Driver',
    tableName: 'drivers',
    timestamps: false,
  });

export default Driver;
