import { isDesignatedDriverEvidenceComplete, REQUIRED_DESIGNATED_DRIVER_PHOTOS } from '../driver/designatedDriverEvidence';

describe('isDesignatedDriverEvidenceComplete', () => {
  const completePhotos = Object.fromEntries(
    REQUIRED_DESIGNATED_DRIVER_PHOTOS.map((type) => [type, `https://storage.example/${type}.jpg`]),
  );

  it('requires all six uploaded photos and the driver attestation', () => {
    expect(isDesignatedDriverEvidenceComplete(completePhotos, true)).toBe(true);
    expect(isDesignatedDriverEvidenceComplete(completePhotos, false)).toBe(false);
  });

  it('rejects an incomplete photo set', () => {
    for (const type of REQUIRED_DESIGNATED_DRIVER_PHOTOS) {
      const photos = { ...completePhotos, [type]: null };
      expect(isDesignatedDriverEvidenceComplete(photos, true)).toBe(false);
    }
  });

  it('rejects empty photo URLs', () => {
    const photos = { ...completePhotos, insurance_document: '  ' };
    expect(isDesignatedDriverEvidenceComplete(photos, true)).toBe(false);
  });
});
