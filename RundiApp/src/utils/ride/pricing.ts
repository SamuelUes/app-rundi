export const parsePriceValue = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d,.-]/g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const firstPositivePrice = (...values: any[]): number | null => {
  for (const value of values) {
    const parsed = parsePriceValue(value);
    if (parsed !== null && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

interface OfferItemLike {
  offeredPrice?: number;
}

export const resolveNegotiationBasePrice = (rideSnapshot: any | null, offer?: OfferItemLike): number | null => {
  const estimated = firstPositivePrice(
    rideSnapshot?.estimatedPrice,
    rideSnapshot?.estimatedFare,
    rideSnapshot?.negotiation?.estimatedPrice,
  );
  if (estimated !== null) return estimated;

  const clientPrice = firstPositivePrice(
    rideSnapshot?.clientSuggestedPrice,
    rideSnapshot?.negotiation?.clientSuggestedPrice,
  );
  if (clientPrice !== null) return clientPrice;

  return firstPositivePrice(
    offer?.offeredPrice,
    rideSnapshot?.driverOfferedPrice,
    rideSnapshot?.negotiation?.driverOfferedPrice,
  );
};

export const hasRidePricingData = (ride: any | null | undefined): boolean => {
  if (!ride) return false;
  return (
    firstPositivePrice(
      ride?.clientSuggestedPrice,
      ride?.negotiation?.clientSuggestedPrice,
      ride?.estimatedPrice,
      ride?.estimatedFare,
      ride?.negotiation?.estimatedPrice,
    ) !== null
  );
};
