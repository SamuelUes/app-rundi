import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import StorageImage from '../../shared/StorageImage';
import { getMyDocuments, type MyDocuments } from '../../../api/compliance';
import { safeFormatDate } from '../../../utils/format/safeFormatters';
import type { TFunction } from 'i18next';

interface DriverProfileInsuranceProps {
  vehicles: any[];
  t: TFunction;
  styles: any;
}

const findPolicy = (data: MyDocuments | null, vehicleId?: string) => {
  const candidates = data?.vehicles ?? [];
  const owned = vehicleId ? candidates.filter((v) => v.id === vehicleId) : [];
  for (const v of [...owned, ...candidates]) {
    const policies = v.documents?.vehicle_insurance_policies ?? [];
    const rc = policies.find((p) => p.coverage_type === 'rc_obligatorio');
    const policy = rc ?? policies[0];
    if (policy?.document_path) return policy;
  }
  return null;
};

// document_path es la referencia canónica; documentUrl viene firmada por el
// backend (válida ~15min). Si el path ya es http(s) se usa tal cual.
const pickPolicyPhoto = (policy: any): string | null => {
  const path = typeof policy?.document_path === 'string' ? policy.document_path : '';
  if (path.startsWith('http')) return path;
  const signed = typeof policy?.documentUrl === 'string' ? policy.documentUrl : '';
  return signed || path || null;
};

export function DriverProfileInsurance({
  vehicles,
  t,
  styles,
}: DriverProfileInsuranceProps) {
  const vehicle = vehicles.find((v) => v.isActive && v.insuranceNumber)
    ?? vehicles.find((v) => v.insuranceNumber);
  const [policyPhoto, setPolicyPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicle) return;
    let cancelled = false;
    getMyDocuments().then((data) => {
      if (!cancelled) setPolicyPhoto(pickPolicyPhoto(findPolicy(data, vehicle.id)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [vehicle?.id]);

  if (!vehicle) return null;
  const photoUri = policyPhoto ?? vehicle.insurancePhoto ?? null;


  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('driver.profile.insurance.title')}</Text>

      <View style={styles.insuranceCard}>
       <View style={[styles.insuranceRowCard]}>
        <View style={styles.insuranceRow}>
          <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.company')}</Text>
          <Text style={styles.insuranceValue}>{vehicle.insuranceCompany}</Text>
        </View>

        <View style={styles.insuranceRow}>
          <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.number')}</Text>
          <Text style={styles.insuranceValue}>{vehicle.insuranceNumber}</Text>
        </View>

        {vehicle.insuranceExpiry && (
          <View style={styles.insuranceRow}>
            <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.expiry')}</Text>
            <Text style={styles.insuranceValue}>
              {safeFormatDate(vehicle.insuranceExpiry)}
            </Text>
          </View>
        )}
       </View>

        {photoUri && (
          <View style={styles.insurancePhotoContainer}>
            <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.photo')}</Text>
            <StorageImage uri={photoUri} style={styles.insurancePhoto} />
          </View>
        )}
      </View>
    </View>
  );
}
