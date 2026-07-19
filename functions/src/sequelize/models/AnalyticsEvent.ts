/**
 * AnalyticsEvent Model - Eventos de analytics
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class AnalyticsEvent extends Model {
  declare id: string;
  declare user_id: string;
  declare event_type: string;
  declare event_data: object | null;
  declare ip_address: string | null;
  declare user_agent: string | null;
  declare platform: string | null;
  declare app_version: string | null;
  declare timestamp: Date;
}

AnalyticsEvent.init(
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
    event_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    event_data: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    platform: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    app_version: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
      field: 'created_at',
    },
  },
  {
    sequelize,
    tableName: 'analytics_events',
    timestamps: false,
  }
);

export default AnalyticsEvent;
