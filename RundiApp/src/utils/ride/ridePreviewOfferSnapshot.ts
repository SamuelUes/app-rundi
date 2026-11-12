type PreviewOfferState = {
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number | null;
  driverOfferStatus?: string | null;
  lastOfferBy?: string | null;
};

export function matchesRidePreviewOffer(offer: Record<string, unknown>, rideId: string): boolean {
  return offer.rideId === rideId || offer.firebaseRideId === rideId;
}

export function mergeRidePreviewOffer<T extends PreviewOfferState>(
  previous: T,
  offer: Record<string, unknown>,
): T {
  const clientPrice = offer.clientSuggestedPrice;
  const driverPrice = offer.offeredPrice;
  const status = offer.status;
  return {
    ...previous,
    clientSuggestedPrice: typeof clientPrice === 'number' && Number.isFinite(clientPrice)
      ? clientPrice : previous.clientSuggestedPrice,
    driverOfferedPrice: typeof driverPrice === 'number' && Number.isFinite(driverPrice)
      ? driverPrice : previous.driverOfferedPrice,
    driverOfferStatus: typeof status === 'string' ? status : previous.driverOfferStatus,
    lastOfferBy: typeof offer.lastOfferBy === 'string' ? offer.lastOfferBy : previous.lastOfferBy,
  };
}
