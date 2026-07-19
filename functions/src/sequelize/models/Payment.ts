/**
 * Payment Model - Modelo de pagos
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Payment extends Model {
  public id!: string;
  public ride_id!: string;
  public amount!: number;
  public tip!: number;
  public commission!: number;
  public commission_rate_applied!: number | null;
  public total!: number | null;
  public payment_method!: string;
  public payment_provider?: string | null;
  public status!: string;
  public commission_status!: string;
  public local_transaction_id?: string | null;
  public local_authorization_code?: string | null;
  public local_bank?: string | null;
  public notes?: string | null;
  public cancel_reason?: string;
  public synced_to_firebase?: boolean;
  public firebase_synced_at?: Date | null;
  public biometric_authenticated?: boolean;
  public biometric_type?: string | null;
  public authentication_method?: string;
  public sms_code_verified?: boolean;
  public sms_verification_id?: string | null;
  public created_at!: Date;
  public paid_at?: Date;
  public commission_paid_at?: Date | null;
  public updated_at?: Date;
}

Payment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ride_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'rides',
        key: 'id',
      },
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    tip: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    commission: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    commission_rate_applied: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    payment_method: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    payment_provider: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
    },
    commission_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'Estado de la comisión del conductor',
    },
    local_transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    local_authorization_code: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    local_bank: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancel_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    synced_to_firebase: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    firebase_synced_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    biometric_authenticated: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    biometric_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    authentication_method: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'manual',
    },
    sms_code_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    sms_verification_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    paid_at: DataTypes.DATE,
    commission_paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Fecha en la que el conductor liquidó la comisión',
    },
    updated_at: DataTypes.DATE,
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    modelName: 'Payment',
    tableName: 'payments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

export default Payment;
