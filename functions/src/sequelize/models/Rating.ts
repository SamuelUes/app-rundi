/**
 * Rating Model - Modelo de calificaciones
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Rating extends Model {
  public id!: string;
  public ride_id!: string;
  public from_user_id!: string;
  public to_user_id!: string;
  public rating!: number;
  public comment?: string;
  public punctuality?: number;
  public cleanliness?: number;
  public communication?: number;
  public driving?: number;
  public safety?: number;
  public friendliness?: number;
  public created_at!: Date;
}

Rating.init(
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
    from_user_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    to_user_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 5 },
    },
    comment: DataTypes.TEXT,
    punctuality: {
      type: DataTypes.INTEGER,
      validate: { min: 1, max: 5 },
    },
    cleanliness: {
      type: DataTypes.INTEGER,
      validate: { min: 1, max: 5 },
    },
    communication: {
      type: DataTypes.INTEGER,
      validate: { min: 1, max: 5 },
    },
    driving: {
      type: DataTypes.INTEGER,
      validate: { min: 1, max: 5 },
    },
    safety: {
      type: DataTypes.INTEGER,
      validate: { min: 1, max: 5 },
    },
    friendliness: {
      type: DataTypes.INTEGER,
      validate: { min: 1, max: 5 },
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    modelName: 'Rating',
    tableName: 'ratings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

export default Rating;
