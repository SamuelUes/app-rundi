/**
 * Card Model - Tarjetas guardadas de usuarios
 * Bancos locales de Nicaragua (sin Stripe)
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Card extends Model {
  declare id: string;
  declare user_id: string;
  declare local_card_id: string;
  declare last_four_digits: string;
  declare expiration_month: number;
  declare expiration_year: number;
  declare bank_name: string;
  declare card_brand: string;
  declare is_default: boolean;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

Card.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    local_card_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    last_four_digits: {
      type: DataTypes.STRING(4),
      allowNull: false,
    },
    expiration_month: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    expiration_year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    bank_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    card_brand: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
    tableName: 'cards',
    timestamps: false,
  }
);

export default Card;
