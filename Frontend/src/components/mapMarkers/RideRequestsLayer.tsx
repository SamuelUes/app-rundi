import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import { markerStyles } from './MarkerContent';
import { toMarkerImageSource, toLatLng, isValidCoord } from '../../hooks/useMapCamera';
import { MAP_ICONS } from '../../constants/mapIcons';

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
}

interface RideRequestsLayerProps {
  rideRequests: RideRequest[];
  onRideRequestPress?: (rideRequest: RideRequest) => void;
  showPinBubbles?: boolean;
}

export default React.memo(function RideRequestsLayer({
  rideRequests,
  onRideRequestPress,
  showPinBubbles = true,
}: RideRequestsLayerProps) {
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
    if (selectedRideRequestId) {
      rideRequestMarkerRefs.current[selectedRideRequestId]?.showCallout?.();
    } else {
      Object.values(rideRequestMarkerRefs.current).forEach((marker) => marker?.hideCallout?.());
    }
  }, [selectedRideRequestId]);

  return (
    <>
      {rideRequests.map((request) => {
        if (!isValidCoord(request)) return null;
        const requestId = String(request.id);
        const isSelected = selectedRideRequestId === requestId;
        return (
          <React.Fragment key={`ride-request-${requestId}`}>
            <Marker
              ref={(ref) => {
                rideRequestMarkerRefs.current[requestId] = ref;
              }}
              coordinate={toLatLng(request)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
              image={toMarkerImageSource(MAP_ICONS.REQUEST_PIN)}
              zIndex={isSelected ? 20 : 10}
              onPress={() => {
                if (selectedRideRequestId === requestId) {
                  setSelectedRideRequestId(null);
                } else {
                  setSelectedRideRequestId(requestId);
                  requestAnimationFrame(() => {
                    rideRequestMarkerRefs.current[requestId]?.showCallout?.();
                  });
                }
              }}
              onCalloutPress={() => {
                setSelectedRideRequestId(null);
                if (typeof onRideRequestPress === 'function') {
                  onRideRequestPress(request);
                }
              }}
            >
              {showPinBubbles !== false && (
                <Callout tooltip>
                  <View style={markerStyles.requestCalloutContainer}>
                    <TouchableOpacity
                      activeOpacity={0.92}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={markerStyles.requestBubbleTouchable}
                      onPress={() => {
                        setSelectedRideRequestId(null);
                        if (typeof onRideRequestPress === 'function') {
                          onRideRequestPress(request);
                        }
                      }}
                    >
                      <View style={markerStyles.requestWrapper}>
                        <View style={markerStyles.requestBubble}>
                          <Text style={markerStyles.requestTitle} numberOfLines={1}>
                            {request.clientName}
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
                    </TouchableOpacity>
                  </View>
                </Callout>
              )}
            </Marker>
          </React.Fragment>
        );
      })}
    </>
  );
});
