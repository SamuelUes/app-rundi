import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class DriverFeatureAssignment extends Model {
  declare id: string;
  declare driver_id: string;
  declare feature_id: string;
  declare is_active: boolean;
  declare granted_by: string;
  declare granted_at: Date;
  declare expires_at: Date | null;
  declare revoked_by: string | null;
  declare revoked_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DriverFeatureAssignment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    driver_id: { type: DataTypes.UUID, allowNull: false },
    feature_id: { type: DataTypes.UUID, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    granted_by: { type: DataTypes.STRING(255), allowNull: false },
    granted_at: { type: DataTypes.DATE, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    revoked_by: { type: DataTypes.STRING(255), allowNull: true },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'driver_feature_assignments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default DriverFeatureAssignment;
