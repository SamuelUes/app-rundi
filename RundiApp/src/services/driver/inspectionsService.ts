/**
 * Inspections Service — migrado a v2.
 * POST/GET/PATCH /v1/inspections (autoridad SQL). Las fotos suben a
 * Firebase Storage (objectPath) vía storageService antes de enviar.
 */

import {
  getRideInspection,
  submitInspection,
  type Inspection,
} from '../../api/inspections';
import i18n from '../../i18n';
import {
  isDesignatedDriverEvidenceComplete,
  type DesignatedDriverPhotoSet,
  type DesignatedDriverPhotoType,
} from '../../utils/driver/designatedDriverEvidence';

interface DesignatedDriverInspection {
  ride_id: string;
  driver_id: string;
  vehicle_front_photo: string;
  vehicle_rear_photo: string;
  interior_front_photo: string;
  interior_rear_photo: string;
  status?: string;
  inspected_at?: string;
}

const tr = (path: string, options?: Record<string, any>) =>
  i18n.t(`services.inspectionsService.${path}`, options) as string;

function toSnakeInspection(i: Inspection) {
  return {
    id: i.id,
    ride_id: i.rideId,
    driver_id: i.driverId,
    vehicle_front_photo: i.vehicleFrontPhoto,
    vehicle_rear_photo: i.vehicleRearPhoto,
    interior_front_photo: i.interiorFrontPhoto,
    interior_rear_photo: i.interiorRearPhoto,
    status: i.status,
    inspected_at: i.inspectedAt,
  };
}

/** Guarda inspección → POST /v1/inspections (driverId va por JWT). */
export const saveDesignatedDriverInspection = async (
  inspection: DesignatedDriverInspection,
): Promise<string> => {
  const saved = await submitInspection({
    rideId: inspection.ride_id,
    vehicleFrontPhoto: inspection.vehicle_front_photo,
    vehicleRearPhoto: inspection.vehicle_rear_photo,
    interiorFrontPhoto: inspection.interior_front_photo,
    interiorRearPhoto: inspection.interior_rear_photo,
  });
  return saved.id;
};

export const getInspectionByRideId = async (rideId: string) => {
  try {
    const inspection = await getRideInspection(rideId);
    return toSnakeInspection(inspection);
  } catch (error: any) {
    if (Number(error?.response?.status) === 404) return null;
    throw error;
  }
};

/** Sin endpoint por-conductor en v2: la autoridad es por rideId. */
export const getInspectionsByDriverId = async (_driverId: string) => {
  console.warn('[inspectionsService] getInspectionsByDriverId no existe en v2 (por-rideId únicamente)');
  return [];
};

export const submitDesignatedDriverRideInspection = async (
  rideId: string,
  photos: Record<DesignatedDriverPhotoType, string>,
  documentsConfirmed: boolean,
): Promise<{ id: string }> => {
  const photoSet: DesignatedDriverPhotoSet = photos;
  if (!isDesignatedDriverEvidenceComplete(photoSet, documentsConfirmed)) {
    throw new Error(tr('errors.requiredEvidenceMissing'));
  }

  // Gap v2: la tabla designated_driver_inspections solo tiene 4 columnas
  // (vehicle_front/rear + interior_front/rear); los docs insurance_document /
  // registration_document se envían como extras — el backend debe extender
  // el schema (v1 tenía insurance_document_photo/registration_document_photo).
  const saved = await submitInspection({
    rideId,
    vehicleFrontPhoto: photos.front_driver_seat,
    vehicleRearPhoto: photos.rear_left_seat,
    interiorFrontPhoto: photos.front_passenger_seat,
    interiorRearPhoto: photos.rear_right_seat,
    ...(photos.insurance_document ? { insuranceDocumentPhoto: photos.insurance_document } : {}),
    ...(photos.registration_document ? { registrationDocumentPhoto: photos.registration_document } : {}),
  } as Parameters<typeof submitInspection>[0]);
  return { id: saved.id };
};

export default {
  saveDesignatedDriverInspection,
  submitDesignatedDriverRideInspection,
  getInspectionByRideId,
  getInspectionsByDriverId,
};
