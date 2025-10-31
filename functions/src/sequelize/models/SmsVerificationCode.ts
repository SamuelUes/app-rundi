/**
 * SmsVerificationCode Model - Códigos de verificación SMS
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class SmsVerificationCode extends Model {
  declare id: string;
  declare ride_id: string | null;
  declare user_id: string;
  declare code: string;
  declare status: string;
  declare expires_at: Date;
  declare created_at: Date;
}

SmsVerificationCode.init(
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
    code: {
      type: DataTypes.STRING(6),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'sms_verification_codes',
    timestamps: false,
  }
);

export default SmsVerificationCode;
