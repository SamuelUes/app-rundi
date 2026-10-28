import { supabaseGet, supabaseGetIn, supabasePost, supabaseUpdate } from '../../supabase/rest';
import type { FeatureAssignmentRow } from './DriverFeatureAssignmentRepository';

const ASSIGNMENT_SELECT =
  'id,vehicle_id,feature_id,is_active,granted_by,granted_at,expires_at,revoked_by,revoked_at';

export class VehicleFeatureAssignmentRepository {
  async findByVehicleIds(vehicleIds: readonly string[]): Promise<FeatureAssignmentRow[]> {
    return await supabaseGetIn(
      'vehicle_feature_assignments',
      'vehicle_id',
      vehicleIds,
      ASSIGNMENT_SELECT,
      { limit: 5000, requireServiceRole: true },
    ) as FeatureAssignmentRow[];
  }

  async findByVehicleAndFeature(vehicleId: string, featureId: string): Promise<FeatureAssignmentRow | null> {
    const rows = await supabaseGet(
      'vehicle_feature_assignments',
      { vehicle_id: vehicleId, feature_id: featureId },
      ASSIGNMENT_SELECT,
      { limit: 1, requireServiceRole: true },
    ) as FeatureAssignmentRow[];
    return rows[0] ?? null;
  }

  async grant(
    vehicleId: string,
    featureId: string,
    grantedBy: string,
    expiresAt: string | null,
  ): Promise<FeatureAssignmentRow> {
    const current = await this.findByVehicleAndFeature(vehicleId, featureId);
    const data = {
      is_active: true,
      granted_by: grantedBy,
      granted_at: new Date().toISOString(),
      expires_at: expiresAt,
      revoked_by: null,
      revoked_at: null,
    };
    if (current) {
      const rows = await supabaseUpdate('vehicle_feature_assignments', current.id, data) as FeatureAssignmentRow[];
      if (rows?.[0]) return rows[0];
      throw new Error('No se pudo reactivar el feature del vehículo');
    }
    const rows = await supabasePost('vehicle_feature_assignments', {
      vehicle_id: vehicleId,
      feature_id: featureId,
      ...data,
    }) as FeatureAssignmentRow[];
    if (!rows?.[0]) throw new Error('No se pudo asignar el feature al vehículo');
    return rows[0];
  }

  async revoke(id: string, revokedBy: string): Promise<FeatureAssignmentRow> {
    const rows = await supabaseUpdate('vehicle_feature_assignments', id, {
      is_active: false,
      revoked_by: revokedBy,
      revoked_at: new Date().toISOString(),
    }) as FeatureAssignmentRow[];
    if (!rows?.[0]) throw new Error('Asignación de feature del vehículo no encontrada');
    return rows[0];
  }
}
