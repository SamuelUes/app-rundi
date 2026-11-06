import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import type { FeatureDoc, ServiceDoc } from '../../live/catalog';
import i18n from '../../i18n';

export type ServiceFeaturePricingType = 'none' | 'surcharge' | 'discount' | 'multiplier';

export interface ServiceFeatureOption {
  code: string;
  name: string;
  description: string | null;
  pricingType: ServiceFeaturePricingType;
  pricingValue: number;
  priority: number;
  stackable: boolean;
  defaultSelected?: boolean;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  startsAt: string | null;
  endsAt: string | null;
  eligibilitySubject?: 'none' | 'driver' | 'vehicle';
  eligibilityMode?: 'none' | 'manual' | 'automatic' | 'hybrid';
  eligibilityRules?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  commissionRate: number;
  status?: string;
  basePrice?: number;
  code?: string;
  pricePerKm?: number;
  pricePerMinute?: number;
  minimumFare?: number;
  features: ServiceFeatureOption[];
  featuresCatalogAvailable: boolean;
}

const tr = (path: string) => i18n.t(`services.servicesService.${path}`) as string;

const toIso = (v: any): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  return null;
};

const mapFeature = (f: FeatureDoc): ServiceFeatureOption => ({
  code: f.code,
  name: f.name ?? f.code,
  description: f.description ?? null,
  pricingType: f.pricingType ?? 'none',
  pricingValue: Number(f.pricingValue ?? 0),
  priority: Number(f.priority ?? 100),
  stackable: f.stackable !== false,
  defaultSelected: false,
  startTime: f.startTime ?? null,
  endTime: f.endTime ?? null,
  timezone: f.timezone ?? 'America/Managua',
  startsAt: toIso(f.startsAt),
  endsAt: toIso(f.endsAt),
  eligibilitySubject: f.eligibilitySubject ?? 'none',
  eligibilityMode: f.eligibilityMode ?? 'none',
  eligibilityRules: {},
  metadata: f.metadata ?? {},
});

class ServicesService {
  /**
   * Catálogo v2 — DATA-MAIN_services + DATA-MAIN_features (proyección Firestore,
   * lectura directa del SDK). Features se unen por service.featureCodes.
   */
  async listServices(): Promise<ServiceItem[]> {
    try {
      const db = await getFirebaseFirestore();
      const [servicesSnap, featuresSnap] = await Promise.all([
        getDocs(query(collection(db, FS_COL.services), where('isActive', '==', true))),
        getDocs(query(collection(db, FS_COL.features), where('enabled', '==', true))).catch(() => null),
      ]);

      const featuresByCode = new Map<string, FeatureDoc>();
      featuresSnap?.docs.forEach((d) => {
        const f = d.data() as FeatureDoc;
        if (f.code) featuresByCode.set(f.code, f);
      });

      return servicesSnap.docs
        .map((d) => {
          const service = d.data() as ServiceDoc;
          const codes = Array.isArray(service.featureCodes) ? service.featureCodes : [];
          return {
            _order: Number(service.displayOrder ?? 999),
            id: String(d.id || service.code),
            name: service.name ?? tr('messages.defaultName'),
            description: service.description ?? null,
            commissionRate: Number(service.commissionRate ?? 0),
            status: service.isActive === false ? 'inactive' : 'active',
            basePrice: service.basePrice !== undefined ? Number(service.basePrice) : undefined,
            code: service.code ?? undefined,
            pricePerKm: service.pricePerKm !== undefined ? Number(service.pricePerKm) : undefined,
            pricePerMinute: service.pricePerMinute !== undefined ? Number(service.pricePerMinute) : undefined,
            minimumFare: service.minimumFare !== undefined ? Number(service.minimumFare) : undefined,
            features: codes
              .map((code) => featuresByCode.get(code))
              .filter((f): f is FeatureDoc => Boolean(f))
              .map(mapFeature),
            featuresCatalogAvailable: featuresSnap !== null,
          };
        })
        .sort((a, b) => a._order - b._order)
        .map(({ _order, ...item }) => item);
    } catch (error) {
      console.error('❌ Error obteniendo servicios:', error);
      throw new Error(tr('errors.fetchFailed'));
    }
  }
}

export default new ServicesService();
