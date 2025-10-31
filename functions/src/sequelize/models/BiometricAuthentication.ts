/**
 * BiometricAuthentication Model - Autenticación biométrica
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class BiometricAuthentication extends Model {
  declare id: string;
  declare ride_id: string | null;
  declare user_id: string;
  declare biometric_type: string;
  declare status: string;
  declare created_at: Date;
}

BiometricAuthentication.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ride_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    biometric_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'biometric_authentications',
    timestamps: false,
  }
);

export default BiometricAuthentication;
