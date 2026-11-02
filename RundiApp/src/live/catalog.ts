/**
 * Catálogo de pricing — lectura directa del SDK a DATA-MAIN_services,
 * DATA-MAIN_features y DATA-MAIN_pricing (proyecciones del consumer desde
 * SQL). La app solicita viajes sin llamar al API (sugerencia del usuario).
 */

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '../config/firebase';
import { FS_COL } from '../constants/firestore';

export interface ServiceDoc {
  code: string;
  name: string;
  description?: string;
  commissionRate: number;
  basePrice: number;
  pricePerKm?: number;
  pricePerMinute?: number;
  minimumFare: number;
  maxDistanceKm?: number;
  vehicleTypes?: string[];
  requiresSpecialLicense: boolean;
  availableHours?: unknown;
  icon?: string;
  color?: string;
  displayOrder: number;
  isActive: boolean;
  isFeatured: boolean;
  featureCodes: string[];
}

export interface FeatureDoc {
  code: string;
  name: string;
  description?: string;
  enabled: boolean;
  startsAt?: { toDate: () => Date };
  endsAt?: { toDate: () => Date };
  startTime?: string;
  endTime?: string;
  timezone: string;
  pricingType: 'none' | 'surcharge' | 'discount' | 'multiplier';
  pricingValue: number;
  priority: number;
  stackable: boolean;
  eligibilitySubject: 'none' | 'driver' | 'vehicle';
  eligibilityMode: 'none' | 'manual' | 'automatic' | 'hybrid';
  metadata?: Record<string, unknown>;
}

export interface SurgeRule {
  minRatio: number;
  maxRatio?: number;
  multiplier: number;
  priority: number;
}

/** Servicios activos ordenados por displayOrder (índice v2). */
export async function listenActiveServices(
  cb: (services: ServiceDoc[]) => void,
): Promise<Unsubscribe> {
  const db = await getFirebaseFirestore();
  const q = query(
    collection(db, FS_COL.services),
    where('isActive', '==', true),
    orderBy('displayOrder', 'asc'),
  );
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => d.data() as ServiceDoc)),
  );
}

/** Features habilitados ordenados por prioridad. */
export async function listenEnabledFeatures(
  cb: (features: FeatureDoc[]) => void,
): Promise<Unsubscribe> {
  const db = await getFirebaseFirestore();
  const q = query(
    collection(db, FS_COL.features),
    where('enabled', '==', true),
    orderBy('priority', 'asc'),
  );
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => d.data() as FeatureDoc)),
  );
}

/** Reglas de surge vigentes (doc único DATA-MAIN_pricing/surge). */
export async function getSurgeRules(): Promise<SurgeRule[]> {
  const db = await getFirebaseFirestore();
  const snap = await getDoc(doc(db, FS_COL.pricing, 'surge'));
  const data = snap.data() as DocumentData | undefined;
  return (data?.rules as SurgeRule[]) ?? [];
}
