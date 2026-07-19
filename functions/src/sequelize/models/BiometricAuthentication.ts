/**
 * BiometricAuthentication Model - Autenticación biométrica
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class BiometricAuthentication extends Model {
  declare id: string;
  declare ride_id: string | null;
  declare user_id: string;
  declare user_type: string;
  declare biometric_type: string;
  declare context: string;
  declare success: boolean;
  declare attempt_number: number;
  declare error_message: string | null;
  declare attempted_at: Date;
  declare created_at: Date;
}

BiometricAuthentication.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ride_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    user_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    biometric_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    context: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    success: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    attempt_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attempted_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'biometric_authentications',
    timestamps: false,
  }
);

export default BiometricAuthentication;
