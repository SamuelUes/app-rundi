/**
 * EmergencyCall Model - Registro de llamadas de emergencia
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class EmergencyCall extends Model {
  declare id: string;
  declare user_id: string;
  declare user_role: string;
  declare emergency_type: string;
  declare emergency_number: string;
  declare lat: number | null;
  declare lng: number | null;
  declare address: string | null;
  declare ride_id: string | null;
  declare notes: string | null;
  declare call_status: string;
  declare called_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

EmergencyCall.init(
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
    user_role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "Rol: driver o client",
    },
    emergency_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "Tipo: police (118) o ambulance (102)",
    },
    emergency_number: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    lat: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
    },
    lng: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ride_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    call_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'initiated',
      comment: "Estado: initiated, completed, canceled",
    },
    called_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
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
    tableName: 'emergency_calls',
    timestamps: false,
  }
);

export default EmergencyCall;
