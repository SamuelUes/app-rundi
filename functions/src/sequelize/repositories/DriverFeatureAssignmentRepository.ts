import { supabaseGet, supabaseGetIn, supabasePost, supabaseUpdate } from '../../supabase/rest';

export type FeatureAssignmentRow = {
  id: string;
  driver_id?: string;
  vehicle_id?: string;
  feature_id: string;
  is_active: boolean;
  granted_by: string;
  granted_at: string;
  expires_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
};

const ASSIGNMENT_SELECT =
  'id,driver_id,feature_id,is_active,granted_by,granted_at,expires_at,revoked_by,revoked_at';

export class DriverFeatureAssignmentRepository {
  async findByDriverIds(driverIds: readonly string[]): Promise<FeatureAssignmentRow[]> {
    return await supabaseGetIn(
      'driver_feature_assignments',
      'driver_id',
      driverIds,
      ASSIGNMENT_SELECT,
      { limit: 5000, requireServiceRole: true },
    ) as FeatureAssignmentRow[];
  }

  async findByDriverAndFeature(driverId: string, featureId: string): Promise<FeatureAssignmentRow | null> {
    const rows = await supabaseGet(
      'driver_feature_assignments',
      { driver_id: driverId, feature_id: featureId },
      ASSIGNMENT_SELECT,
      { limit: 1, requireServiceRole: true },
    ) as FeatureAssignmentRow[];
    return rows[0] ?? null;
  }

  async grant(
    driverId: string,
    featureId: string,
    grantedBy: string,
    expiresAt: string | null,
  ): Promise<FeatureAssignmentRow> {
    const current = await this.findByDriverAndFeature(driverId, featureId);
    const data = {
      is_active: true,
      granted_by: grantedBy,
      granted_at: new Date().toISOString(),
      expires_at: expiresAt,
      revoked_by: null,
      revoked_at: null,
    };
    if (current) {
      const rows = await supabaseUpdate('driver_feature_assignments', current.id, data) as FeatureAssignmentRow[];
      if (rows?.[0]) return rows[0];
      throw new Error('No se pudo reactivar el feature del conductor');
    }
    const rows = await supabasePost('driver_feature_assignments', {
      driver_id: driverId,
      feature_id: featureId,
      ...data,
    }) as FeatureAssignmentRow[];
    if (!rows?.[0]) throw new Error('No se pudo asignar el feature al conductor');
    return rows[0];
  }

  async revoke(id: string, revokedBy: string): Promise<FeatureAssignmentRow> {
    const rows = await supabaseUpdate('driver_feature_assignments', id, {
      is_active: false,
      revoked_by: revokedBy,
      revoked_at: new Date().toISOString(),
    }) as FeatureAssignmentRow[];
    if (!rows?.[0]) throw new Error('Asignación de feature del conductor no encontrada');
    return rows[0];
  }
}
