/**
 * DocumentAlert Model - Alertas de vencimiento/rechazo/revisión de documentos
 * Unicidad por (document_table, document_id, alert_type, due_date).
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class DocumentAlert extends Model {
  declare id: string;
  declare document_table: string;
  declare document_id: string;
  declare driver_id: string | null;
  declare vehicle_id: string | null;
  declare alert_type: string;
  declare due_date: string | null;
  declare warning_days_used: number | null;
  declare status: string;
  declare notified_at: Date | null;
}

DocumentAlert.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    document_table: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    driver_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    vehicle_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    alert_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      comment: 'expiring_soon|expired|rejected|requires_review',
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    warning_days_used: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'open',
      comment: 'open|acknowledged|resolved|dismissed',
    },
    notified_at: {
      type: DataTypes.DATE,
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
    tableName: 'document_alerts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default DocumentAlert;
