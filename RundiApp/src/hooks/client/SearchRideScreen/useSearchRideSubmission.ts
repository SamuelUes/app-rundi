import { useCallback, useRef } from 'react';
import { Platform, Share } from 'react-native';
import ridesService from '../../../services/ride/ridesService';
import alertService from '../../../services/notification/alertService';
import BiometricService from '../../../services/user/biometricService';
import { getScheduleBounds } from '../../../utils/format/schedule';
import type { TFunction } from 'i18next';
import type { Coords } from '../../../utils/geo/rideCoords';
import type { ServiceItem } from '../../../services/catalog/servicesService';

type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';
type PaymentMethod = 'cash' | 'card';

interface DefaultLabels {
  origin: string;
  destination: string;
  locationFallback: string;
  currentLocation: string;
  myLocation: string;
  service: string;
}

interface RouteCalculation {
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedPrice: number;
}

interface LocationValidationResult {
  allowed: boolean;
  serviceAreaId?: string | null;
  message?: string;
}

interface ValidateFn {
  (coords: Coords, context: 'origin' | 'destination' | 'stop'): Promise<LocationValidationResult | null>;
}

interface UploadPhotoFn {
  (): Promise<string | null>;
}

interface UseSearchRideSubmissionParams {
  user: any;
  coords: Coords | null;
  origin: string;
  destination: string;
  originCoords: Coords | null;
  destinationCoords: Coords | null;
  extraDestinations: Array<{ address: string; coords: Coords | null }>;
  vehicleType: VehicleType;
  designatedDriverMode: DesignatedDriverMode;
  paymentMethod: PaymentMethod;
  passengersByVehicle: Record<VehicleType, number>;
  priceSuggestion: string;
  rideComment: string;
  clientVehiclePhoto: string | null;
  clientVehiclePhotoLocalUri: string | null;
  routeCalc: RouteCalculation;
  selectedFeatureCodes?: string[];
  servicesCatalog: ServiceItem[];
  scheduledAt: number | string | null;
  defaultLabels: DefaultLabels;
  submittingRequest: boolean;
  setSubmittingRequest: (v: boolean) => void;
  validateLocationForContext: ValidateFn;
  uploadPhotoIfNeeded: UploadPhotoFn;
  tr: (path: string, options?: Record<string, any>) => string;
  navigation: any;
}

export function useSearchRideSubmission({
  user,
  coords,
  origin,
  destination,
  originCoords,
  destinationCoords,
  extraDestinations,
  vehicleType,
  designatedDriverMode,
  paymentMethod,
  passengersByVehicle,
  priceSuggestion,
  rideComment,
  clientVehiclePhoto,
  clientVehiclePhotoLocalUri,
  routeCalc,
  selectedFeatureCodes,
  servicesCatalog,
  scheduledAt,
  defaultLabels,
  submittingRequest,
  setSubmittingRequest,
  validateLocationForContext,
  uploadPhotoIfNeeded,
  tr,
  navigation,
}: UseSearchRideSubmissionParams) {

  const runDesignatedDriverBiometricVerification = useCallback(async () => {
    try {
      const result = await BiometricService.authenticateAndLog({
        reason: tr('alerts.identityRequired'),
        fallbackLabel: Platform.OS === 'ios' ? tr('alerts.biometricFallbackLabel') : tr('alerts.photoOptionsCancel'),
        context: 'designated_driver_request',
        userType: 'client',
      });

      if (!result.success) {
        const errorMessage = result.error || '';
        const noBiometricError =
          errorMessage.includes('no soporta biometría') || errorMessage.includes('No hay biometría registrada');

        if (noBiometricError) {
          alertService.showInfoAlert(tr('alerts.biometricUnavailableTitle'), tr('alerts.biometricUnavailableMessage'));
          const fallbackTimestamp = new Date().toISOString();
          return {
            biometricAcceptanceRequired: true,
            biometricAcceptanceType: 'device_biometric_not_found',
            biometricAcceptanceVerified: false,
            biometricAcceptanceAt: fallbackTimestamp,
          };
        }

        alertService.showInfoAlert(tr('alerts.biometricRequiredTitle'), errorMessage || tr('alerts.identityRequired'));
        return null;
      }

      if (result.biometryType !== 'fingerprint') {
        alertService.showInfoAlert(tr('alerts.biometricRequiredTitle'), tr('alerts.biometricRequiredMessage'));
        return null;
      }

      const verifiedAt = result.verifiedAt || new Date().toISOString();
      return {
        biometricAcceptanceRequired: true,
        biometricAcceptanceType: 'fingerprint',
        biometricAcceptanceVerified: true,
        biometricAcceptanceAt: verifiedAt,
      };
    } catch (error) {
      console.warn('[biometric] Error verificando huella', error);
      alertService.showErrorAlert(tr('alerts.biometricGenericError'));
      return null;
    }
  }, [tr]);

  const submittingRef = useRef(false);

  const onConfirmRequest = useCallback(async () => {
    if (submittingRef.current) return;
    if (!user) {
      alertService.showErrorAlert(tr('alerts.loginRequired'));
      return;
    }
    const startPoint = originCoords || coords;
    if (!startPoint || !destinationCoords) {
      alertService.showErrorAlert(tr('alerts.destinationRequired'));
      return;
    }

    if (scheduledAt) {
      const scheduledMs = typeof scheduledAt === 'number' ? scheduledAt : new Date(scheduledAt).getTime();
      const { minDate, maxDate } = getScheduleBounds();
      if (!Number.isFinite(scheduledMs) || scheduledMs < minDate.getTime() || scheduledMs > maxDate.getTime()) {
        alertService.showErrorAlert(tr('scheduling.invalidRange'));
        return;
      }
    }

    submittingRef.current = true;
    setSubmittingRequest(true);

    const validatedOrigin = await validateLocationForContext(startPoint, 'origin');
    if (!validatedOrigin) {
      submittingRef.current = false;
      setSubmittingRequest(false);
      return;
    }

    const validatedDestination = await validateLocationForContext(destinationCoords, 'destination');
    if (!validatedDestination) {
      submittingRef.current = false;
      setSubmittingRequest(false);
      return;
    }

    let clientSuggestedPrice: number | undefined;
    if (priceSuggestion.trim().length > 0) {
      const value = Number(priceSuggestion);
      if (!Number.isFinite(value) || value <= 0) {
        alertService.showErrorAlert(tr('alerts.invalidAmount'));
        submittingRef.current = false;
        setSubmittingRequest(false);
        return;
      }
      clientSuggestedPrice = value;
    }

    let biometricAcceptancePayload: Record<string, any> | null = null;
    let vehiclePhotoUrl = clientVehiclePhoto;
    if (vehicleType === 'designated_driver') {
      if (!vehiclePhotoUrl && !clientVehiclePhotoLocalUri) {
        alertService.showErrorAlert(tr('alerts.vehiclePhotoRequired'));
        submittingRef.current = false;
        setSubmittingRequest(false);
        return;
      }
      biometricAcceptancePayload = await runDesignatedDriverBiometricVerification();
      if (!biometricAcceptancePayload) {
        submittingRef.current = false;
        setSubmittingRequest(false);
        return;
      }

      if (!vehiclePhotoUrl && clientVehiclePhotoLocalUri) {
        vehiclePhotoUrl = await uploadPhotoIfNeeded();
        if (!vehiclePhotoUrl) {
          submittingRef.current = false;
          setSubmittingRequest(false);
          return;
        }
      }

      if (!vehiclePhotoUrl) {
        alertService.showErrorAlert(tr('alerts.photoUploadFailed'));
        submittingRef.current = false;
        setSubmittingRequest(false);
        return;
      }
    }

    const finishProgrammedRequest = async (data: any) => {
      const programmed = await ridesService.createProgrammedRide({ ...data, scheduledAt });
      const scheduledText = new Date(programmed.scheduledAt).toLocaleString();
      const rideId = programmed.id;
      const claimCode = programmed.claimCode;
      alertService.showSuccessAlert(
        tr('scheduling.successTitle'),
        claimCode
          ? tr('scheduling.successMessageWithCode', { date: scheduledText, code: claimCode })
          : tr('scheduling.successMessageWithId', { date: scheduledText, id: rideId }),
        { duration: 3500 },
      );
      try {
        await Share.share({
          message: claimCode
            ? tr('scheduling.shareMessageWithCode', { date: scheduledText, code: claimCode })
            : tr('scheduling.shareMessage', { date: scheduledText, id: rideId }),
        });
      } catch (shareError) {
        console.warn('Error sharing scheduled ride code', shareError);
      }
      navigation?.navigate?.('ClientHome');
    };

    const finishImmediateRequest = async (data: any) => {
      const ride = await ridesService.requestRide(data);
      if (!ride?.id) {
        alertService.showErrorAlert(tr('alerts.requestError'));
        return;
      }
      navigation?.navigate?.('HomeOffers', { rideId: ride.id });
    };

    let requestData: any;

    try {
      requestData = {
        clientId: user.id,
        origin: {
          lat: startPoint.latitude,
          lng: startPoint.longitude,
          address: origin || defaultLabels.myLocation,
        },
        destination: {
          lat: destinationCoords.latitude,
          lng: destinationCoords.longitude,
          address: destination || defaultLabels.destination,
        },
        estimatedDistance: Math.max(1, Math.round(routeCalc.estimatedDistance * 1000)),
        estimatedDuration: Math.max(1, Math.round(routeCalc.estimatedDuration * 60)),
        estimatedPrice: Math.max(1, Math.round(routeCalc.estimatedPrice)),
        rideType: vehicleType === 'designated_driver' ? 'designated_driver' : 'normal',
        vehicleType,
        paymentMethod,
        passengers: passengersByVehicle[vehicleType] || 1,
        serviceAreaId: validatedOrigin.serviceAreaId ?? validatedDestination.serviceAreaId ?? null,
        ...(selectedFeatureCodes !== undefined ? { selectedFeatureCodes } : {}),
      };

      const trimmedComment = rideComment.trim();

      if (clientSuggestedPrice) requestData.clientSuggestedPrice = clientSuggestedPrice;
      if (trimmedComment) {
        requestData.clientComment = trimmedComment;
        requestData.notes = trimmedComment;
      }
      if (extraDestinations.length > 0) {
        requestData.extraDestinations = extraDestinations
          .filter((stop: any) => stop.coords)
          .map((stop: any) => ({
            lat: stop.coords!.latitude,
            lng: stop.coords!.longitude,
            address: stop.address,
          }));
      }
      if (vehicleType === 'designated_driver' && vehiclePhotoUrl) {
        requestData.clientVehiclePhoto = vehiclePhotoUrl;
        const designatedNote = tr('notes.designatedDriver');
        requestData.notes = trimmedComment ? `${trimmedComment}\n${designatedNote}` : designatedNote;
        requestData.designatedDriverVehicle = designatedDriverMode;
      }

      if (biometricAcceptancePayload) {
        Object.assign(requestData, biometricAcceptancePayload);
      }

      const codeMap: Record<VehicleType, string> = {
        moto: 'motorcycle',
        auto: 'normal',
        designated_driver: 'designated_driver',
      };
      const matched = servicesCatalog.find((service) => service.code === codeMap[vehicleType as VehicleType]);
      if (matched?.id) requestData.serviceId = matched.id;

      if (scheduledAt) {
        await finishProgrammedRequest(requestData);
        return;
      }

      await finishImmediateRequest(requestData);
    } catch (error: any) {
      const details: any = (error && (error.details || (error as any).data)) || null;
      const errorCode: string | null = (error && (error.code || (error as any).errorInfo?.code)) || null;

      const isFailedPrecondition = errorCode === 'functions/failed-precondition' || errorCode === 'failed-precondition';
      const isConflict = isFailedPrecondition && details && details.code === 'CLIENT_PROGRAMMED_RIDE_CONFLICT';

      if (isConflict && details?.existingRideId && details?.existingScheduledAt && requestData) {
        const conflictDate = new Date(details.existingScheduledAt).toLocaleString();
        const title = tr('scheduling.conflictTitle');
        const body = scheduledAt
          ? tr('scheduling.conflictBodyScheduled', { date: conflictDate })
          : tr('scheduling.conflictBodyImmediate', { date: conflictDate });
        const replaceLabel = tr('scheduling.conflictReplaceButton');
        const keepLabel = tr('scheduling.conflictKeepButton');

        setSubmittingRequest(false);

        const shouldReplace = await new Promise<boolean>((resolve) => {
          alertService.showConfirmAlert(title, body, () => resolve(true), () => resolve(false), replaceLabel, keepLabel);
        });

        if (!shouldReplace) return;

        try {
          await ridesService.cancelProgrammedRide(
            details.existingRideId,
            scheduledAt ? 'replaced_by_new_programmed_ride' : 'replaced_by_new_immediate_ride',
          );


          if (scheduledAt) {
            await finishProgrammedRequest(requestData);
          } else {
            await finishImmediateRequest(requestData);
          }
        } catch (retryError: any) {
          alertService.showErrorAlert(retryError?.message || tr('alerts.requestError'));
        }

        return;
      }

      const isActiveRideConflict =
        isFailedPrecondition && details && details.code === 'CLIENT_HAS_ACTIVE_RIDE';

      if (isActiveRideConflict && details?.existingRideId) {
        setSubmittingRequest(false);

        const shouldCancelPrevious = await new Promise<boolean>((resolve) => {
          alertService.showConfirmAlert(
            tr('scheduling.activeRideTitle'),
            tr('scheduling.activeRideBody'),
            () => resolve(true),
            () => resolve(false),
            tr('scheduling.activeRideCancelButton'),
            tr('scheduling.activeRideKeepButton'),
          );
        });

        if (!shouldCancelPrevious) {
          const waitingStatuses = ['requested', 'searching', 'driver_offered', 'accepted'];
          const target = waitingStatuses.includes(details.existingStatus)
            ? 'HomeOffers'
            : 'RideTracking';
          navigation?.navigate?.(target, { rideId: details.existingRideId });
          return;
        }

        try {
          await ridesService.cancelRide(details.existingRideId, 'replaced_by_new_request');
          if (scheduledAt) {
            await finishProgrammedRequest(requestData);
          } else {
            await finishImmediateRequest(requestData);
          }
        } catch (retryError: any) {
          alertService.showErrorAlert(retryError?.message || tr('alerts.requestError'));
        }

        return;
      }

      alertService.showErrorAlert(error?.message || tr('alerts.requestError'));
    } finally {
      submittingRef.current = false;
      setSubmittingRequest(false);
    }
  }, [
    user, originCoords, coords, destinationCoords,
    origin, destination, routeCalc.estimatedDistance, routeCalc.estimatedDuration, routeCalc.estimatedPrice,
    vehicleType, paymentMethod, passengersByVehicle, priceSuggestion, rideComment,
    extraDestinations, clientVehiclePhoto, clientVehiclePhotoLocalUri,
    servicesCatalog, navigation, scheduledAt, designatedDriverMode, selectedFeatureCodes,
    validateLocationForContext, uploadPhotoIfNeeded,
    runDesignatedDriverBiometricVerification, tr, setSubmittingRequest, defaultLabels,
  ]);

  return { onConfirmRequest, runDesignatedDriverBiometricVerification };
}
