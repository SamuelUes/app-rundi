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
  public payment_method!: string;
  public status!: string;
  public commission_status!: string;
  public cancel_reason?: string;
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
    payment_method: {
      type: DataTypes.ENUM('cash', 'card', 'bank_transfer'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'canceled'),
      defaultValue: 'pending',
    },
    commission_status: {
      type: DataTypes.ENUM('pending', 'paid'),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'Estado de la comisión del conductor',
    },
    cancel_reason: DataTypes.STRING,
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
  },
  {
    sequelize,
    modelName: 'Payment',
    tableName: 'payments',
    timestamps: false,
  }
);

export default Payment;
