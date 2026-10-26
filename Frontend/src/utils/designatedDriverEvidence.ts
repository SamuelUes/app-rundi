export const REQUIRED_DESIGNATED_DRIVER_PHOTOS = [
  'insurance_document',
  'registration_document',
  'front_driver_seat',
  'front_passenger_seat',
  'rear_left_seat',
  'rear_right_seat',
] as const;

export type DesignatedDriverPhotoType = (typeof REQUIRED_DESIGNATED_DRIVER_PHOTOS)[number];
export type DesignatedDriverPhotoSet = Partial<Record<DesignatedDriverPhotoType, string | null>>;

export const isDesignatedDriverEvidenceComplete = (
  photos: DesignatedDriverPhotoSet,
  documentsConfirmed: boolean,
): boolean =>
  documentsConfirmed === true &&
  REQUIRED_DESIGNATED_DRIVER_PHOTOS.every((type) => {
    const url = photos[type];
    return typeof url === 'string' && url.trim().length > 0;
  });
