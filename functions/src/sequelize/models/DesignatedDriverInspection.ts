/**
 * DesignatedDriverInspection Model - Inspecciones de conductor designado
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class DesignatedDriverInspection extends Model {
  declare id: string;
  declare ride_id: string;
  declare driver_id: string;
  declare vehicle_front_photo: string | null;
  declare vehicle_rear_photo: string | null;
  declare interior_front_photo: string | null;
  declare interior_rear_photo: string | null;
  declare insurance_document_photo: string | null;
  declare registration_document_photo: string | null;
  declare front_driver_seat_photo: string | null;
  declare front_passenger_seat_photo: string | null;
  declare rear_left_seat_photo: string | null;
  declare rear_right_seat_photo: string | null;
  declare documents_confirmed: boolean;
  declare documents_confirmed_at: Date | null;
  declare status: string;
  declare inspected_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

DesignatedDriverInspection.init(
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
    driver_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    vehicle_front_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    vehicle_rear_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    interior_front_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    interior_rear_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    insurance_document_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    registration_document_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    front_driver_seat_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    front_passenger_seat_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    rear_left_seat_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    rear_right_seat_photo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    documents_confirmed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    documents_confirmed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: true,
      defaultValue: 'completed',
    },
    inspected_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
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
    tableName: 'designated_driver_inspections',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default DesignatedDriverInspection;
