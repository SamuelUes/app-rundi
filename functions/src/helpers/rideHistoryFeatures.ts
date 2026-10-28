export function mapRideFeatureHistory(ride: Record<string, any>) {
  const snapshot = ride.pricing_snapshot ?? ride.pricingSnapshot ?? null;
  const codes = Array.isArray(ride.feature_codes)
    ? ride.feature_codes
    : Array.isArray(ride.featureCodes)
      ? ride.featureCodes
      : Array.isArray(snapshot?.featureCodes)
        ? snapshot.featureCodes
        : [];
  return {
    serviceId: ride.service_id ?? ride.serviceId ?? null,
    serviceCode: snapshot?.serviceCode ?? ride.serviceCode ?? ride.service_code ?? null,
    featureCodes: [...new Set(codes.filter((code: unknown): code is string => typeof code === 'string'))],
    pricingSnapshot: snapshot,
  };
}
