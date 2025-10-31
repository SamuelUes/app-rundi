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
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    event_data: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'analytics_events',
    timestamps: false,
  }
);

export default AnalyticsEvent;
