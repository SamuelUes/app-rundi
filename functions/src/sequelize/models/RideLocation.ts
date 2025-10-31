/**
 * RideLocation Model - Ubicaciones de viajes
 * Estructura: origin → waypoint 1 → waypoint 2 → ... → destination
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class RideLocation extends Model {
  declare id: string;
  declare ride_id: string;
  declare location_type: string;
  declare location_order: number;
  declare latitude: number;
  declare longitude: number;
  declare address: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

RideLocation.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ride_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    location_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "Tipo: 'origin', 'waypoint', 'destination'",
    },
    location_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Orden secuencial: 1=origen, 2=parada1, 3=parada2, N=destino",
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: false,
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: false,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: 'ride_locations',
    timestamps: false,
  }
);

export default RideLocation;
