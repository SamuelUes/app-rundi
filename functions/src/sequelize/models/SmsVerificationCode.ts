/**
 * SmsVerificationCode Model - Códigos de verificación SMS
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class SmsVerificationCode extends Model {
  declare id: string;
  declare ride_id: string | null;
  declare user_id: string;
  declare phone_number: string | null;
  declare email: string | null;
  declare is_email: boolean;
  declare code: string;
  declare code_hash: string;
  declare context: string | null;
  declare verified: boolean;
  declare attempt_count: number;
  declare max_attempts: number | null;
  declare sent_at: Date;
  declare verified_at: Date | null;
  declare expires_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
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
    phone_number: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    email: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_email: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    code: {
      type: DataTypes.STRING(6),
      allowNull: false,
    },
    code_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    context: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    attempt_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    max_attempts: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 3,
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
    verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
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
    tableName: 'sms_verification_codes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default SmsVerificationCode;
