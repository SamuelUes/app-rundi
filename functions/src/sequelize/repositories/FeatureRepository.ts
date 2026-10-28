import { supabaseGet, supabasePost, supabaseUpdate } from '../../supabase/rest';

export type FeatureRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string;
  pricing_type: string;
  pricing_value: number | string;
  priority: number;
  stackable: boolean;
  eligibility_subject: 'none' | 'driver' | 'vehicle';
  eligibility_mode: 'none' | 'manual' | 'automatic' | 'hybrid';
  eligibility_rules: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

const FEATURE_SELECT = [
  'id', 'code', 'name', 'description', 'enabled', 'starts_at', 'ends_at',
  'start_time', 'end_time', 'timezone', 'pricing_type', 'pricing_value',
  'priority', 'stackable', 'eligibility_subject', 'eligibility_mode',
  'eligibility_rules', 'metadata',
].join(',');

export class FeatureRepository {
  async findServiceIdByCode(code: string): Promise<string | null> {
    const rows = await supabaseGet(
      'services',
      { code, is_active: true },
      'id,code',
      { limit: 1, requireServiceRole: true },
    ) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  async findByCode(code: string): Promise<FeatureRow | null> {
    const rows = await supabaseGet(
      'features',
      { code },
      FEATURE_SELECT,
      { limit: 1, requireServiceRole: true },
    ) as FeatureRow[];
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<FeatureRow | null> {
    const rows = await supabaseGet(
      'features',
      { id },
      FEATURE_SELECT,
      { limit: 1, requireServiceRole: true },
    ) as FeatureRow[];
    return rows[0] ?? null;
  }

  async findEnabled(): Promise<FeatureRow[]> {
    return await supabaseGet(
      'features',
      { enabled: true },
      FEATURE_SELECT,
      { limit: 1000, requireServiceRole: true },
    ) as FeatureRow[];
  }

  async findAll(): Promise<FeatureRow[]> {
    return await supabaseGet(
      'features',
      undefined,
      FEATURE_SELECT,
      { limit: 1000, requireServiceRole: true },
    ) as FeatureRow[];
  }

  async findAssignedToService(serviceId: string): Promise<Array<Record<string, any>>> {
    return await supabaseGet(
      'service_feature_assignments',
      { service_id: serviceId, enabled: true },
      `configuration,features!inner(${FEATURE_SELECT})`,
      { limit: 100, requireServiceRole: true },
    ) as Array<Record<string, any>>;
  }

  async findServiceFeatureAssignments(): Promise<Array<Record<string, any>>> {
    return await supabaseGet(
      'service_feature_assignments',
      undefined,
      'id,service_id,feature_id,enabled,configuration,services!inner(code,name),features!inner(code)',
      { limit: 2000, requireServiceRole: true },
    ) as Array<Record<string, any>>;
  }

  async findServiceFeatureAssignment(serviceId: string, featureId: string): Promise<Record<string, any> | null> {
    const rows = await supabaseGet(
      'service_feature_assignments',
      { service_id: serviceId, feature_id: featureId },
      'id,service_id,feature_id,enabled,configuration',
      { limit: 1, requireServiceRole: true },
    ) as Array<Record<string, any>>;
    return rows[0] ?? null;
  }

  async createServiceFeatureAssignment(data: Record<string, unknown>): Promise<Record<string, any>> {
    const rows = await supabasePost('service_feature_assignments', data) as Array<Record<string, any>>;
    if (!rows?.[0]) throw new Error('No se pudo crear la asignación de feature al servicio');
    return rows[0];
  }

  async updateServiceFeatureAssignment(id: string, data: Record<string, unknown>): Promise<Record<string, any>> {
    const rows = await supabaseUpdate('service_feature_assignments', id, data) as Array<Record<string, any>>;
    if (!rows?.[0]) throw new Error('Asignación de feature al servicio no encontrada');
    return rows[0];
  }

  async create(data: Record<string, unknown>): Promise<FeatureRow> {
    const rows = await supabasePost('features', data) as FeatureRow[];
    const row = rows?.[0];
    if (!row?.id) throw new Error('No se pudo crear el feature');
    return row;
  }

  async update(id: string, data: Record<string, unknown>): Promise<FeatureRow> {
    const rows = await supabaseUpdate('features', id, data) as FeatureRow[];
    const row = rows?.[0];
    if (!row?.id) throw new Error('Feature no encontrado');
    return row;
  }
}
