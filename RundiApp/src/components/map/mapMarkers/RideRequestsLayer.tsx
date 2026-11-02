import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, Text, TouchableOpacity } from 'react-native';
import { Marker, Callout, CalloutSubview } from 'react-native-maps';
import { markerStyles } from './MarkerContent';
import PinMarkerWithBubble from './PinMarkerWithBubble';
import { toLatLng, isValidCoord } from '../../../hooks/shared/map/useMapCamera';
import { MAP_ICONS } from '../../../constants/mapIcons';
import { useTranslation } from 'react-i18next';
import { getRideServiceTypeLabel } from '../../../utils/ride/rideFeatureLabels';

export interface RideRequest {
  id: string;
  latitude: number;
  longitude: number;
  clientName: string;
  originAddress: string;
  primaryDestination: string;
  finalDestination?: string;
  extraStopsCount: number;
  priceLabel: string;
  priceValue: number;
  hasClientSuggestedPrice: boolean;
  passengers: number;
  serviceCode?: string;
  featureCodes?: string[];
  rideType?: string;
  vehicleType?: string;
  designatedDriverVehicle?: string | null;
}

interface RideRequestsLayerProps {
  rideRequests: RideRequest[];
  onRideRequestPress?: (rideRequest: RideRequest) => void;
  showPinBubbles?: boolean;
  /** Scale applied to the requests_pin artwork (1 = native asset size). */
  requestPinScale?: number;
}

export default React.memo(function RideRequestsLayer({
  rideRequests,
  onRideRequestPress,
  showPinBubbles = true,
  requestPinScale = 1,
}: RideRequestsLayerProps) {
  const { t } = useTranslation();
  const rideRequestMarkerRefs = useRef<Record<string, React.ComponentRef<typeof Marker> | null>>({});
  const [selectedRideRequestId, setSelectedRideRequestId] = useState<string | null>(null);

  const rideRequestSignature = useMemo(() => {
    if (rideRequests.length === 0) return '';
    return rideRequests
      .map((request) => `${request.id}:${request.latitude?.toFixed?.(5) ?? request.latitude}:${request.longitude?.toFixed?.(5) ?? request.longitude}`)
      .join('|');
  }, [rideRequests]);

  useEffect(() => {
    if (!rideRequests.some((request) => request.id === selectedRideRequestId)) {
      setSelectedRideRequestId(null);
    }
  }, [rideRequestSignature, rideRequests, selectedRideRequestId]);

  useEffect(() => {
    if (rideRequests.length === 0 && selectedRideRequestId) {
      setSelectedRideRequestId(null);
    }
  }, [rideRequests.length, selectedRideRequestId]);

  useEffect(() => {
    Object.values(rideRequestMarkerRefs.current).forEach((marker) => marker?.hideCallout?.());
    if (selectedRideRequestId) {
      rideRequestMarkerRefs.current[selectedRideRequestId]?.showCallout?.();
    }
  }, [selectedRideRequestId]);

  return (
    <>
      {rideRequests.map((request) => {
        if (!isValidCoord(request)) return null;
        const requestId = String(request.id);
        const isSelected = selectedRideRequestId === requestId;
        const requestServiceType = getRideServiceTypeLabel(request, t);
        const handleRequestOpen = () => {
          setSelectedRideRequestId(null);
          onRideRequestPress?.(request);
        };
        const handleRequestPinPress = () => {
          if (selectedRideRequestId === requestId) {
            setSelectedRideRequestId(null);
          } else {
            setSelectedRideRequestId(requestId);
            requestAnimationFrame(() => {
              rideRequestMarkerRefs.current[requestId]?.showCallout?.();
            });
          }
        };
        const requestBubbleContent = (
          <View style={markerStyles.requestWrapper}>
            <View style={markerStyles.requestBubble}>
              <Text style={markerStyles.requestTitle} numberOfLines={1}>
                {request.clientName}
              </Text>
              <Text style={markerStyles.requestServiceType} numberOfLines={1}>
                {requestServiceType}
              </Text>
              <Text style={markerStyles.requestLine} numberOfLines={1}>
                {request.originAddress}
              </Text>
              <Text style={markerStyles.requestLine} numberOfLines={1}>
                {request.primaryDestination || request.finalDestination}
              </Text>
              <View style={markerStyles.requestMetaRow}>
                <Text style={markerStyles.requestPrice}>
                  {request.priceLabel}{request.hasClientSuggestedPrice ? ' • Cliente' : ''}
                </Text>
                <Text style={markerStyles.requestPassengers}>
                  {request.passengers}
                </Text>
              </View>
              {request.extraStopsCount > 0 && (
                <Text style={markerStyles.requestStops}>
                  {request.extraStopsCount} parada{request.extraStopsCount > 1 ? 's' : ''} extra
                </Text>
              )}
              <Text style={markerStyles.requestHint}>Toca para negociar</Text>
            </View>
            <View style={markerStyles.requestBubbleTail} />
          </View>
        );
        return (
          <PinMarkerWithBubble
            key={`ride-request-${requestId}`}
            markerRef={(ref) => {
              rideRequestMarkerRefs.current[requestId] = ref;
            }}
            coordinate={toLatLng(request)}
            pinImage={MAP_ICONS.REQUEST_PIN}
            pinWidth={22}
            pinHeight={39}
            pinAnchor="tip"
            pinScale={requestPinScale}
            bubbleTitle={request.clientName}
            bubbleText={requestServiceType}
            bubbleMeta={request.priceLabel}
            bubbleLabel={requestServiceType}
            bubbleCompact
            bubbleAccentColor="#1B5E20"
            showBubble={showPinBubbles !== false && !isSelected}
            zIndex={isSelected ? 20 : 10}
            onPress={handleRequestPinPress}
            onCalloutPress={handleRequestOpen}
          >
            <Callout tooltip>
              <View style={markerStyles.requestCalloutContainer}>
                {Platform.OS === 'ios' ? (
                  <CalloutSubview style={markerStyles.requestBubbleTouchable} onPress={handleRequestOpen}>
                    {requestBubbleContent}
                  </CalloutSubview>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.92}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    style={markerStyles.requestBubbleTouchable}
                    onPress={handleRequestOpen}
                  >
                    {requestBubbleContent}
                  </TouchableOpacity>
                )}
              </View>
            </Callout>
          </PinMarkerWithBubble>
        );
      })}
    </>
  );
});
