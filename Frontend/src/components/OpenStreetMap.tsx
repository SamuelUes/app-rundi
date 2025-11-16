import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { getOpenStreetMapHtml } from './openStreetMapTemplate';

interface OpenStreetMapProps {
  latitude: number;
  longitude: number;
  style?: any;
  onMapPress?: (event: { latitude: number; longitude: number }) => void;
  showMarker?: boolean;
  markerPosition?: { latitude: number; longitude: number };
  markerType?: 'default' | 'car' | 'origin' | 'destination' | 'client' | 'manual_origin' | 'manual_origin_hold';
  originMarker?: { latitude: number; longitude: number };
  destinationMarker?: { latitude: number; longitude: number };
  clientMarker?: { latitude: number; longitude: number };
  extraStopMarkers?: Array<{ latitude: number; longitude: number; index: number; color?: string }>;
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  nearbyDrivers?: Array<{ id: string; latitude: number; longitude: number; heading?: number }>;
  draggableMarker?: boolean;
  onMarkerDragEnd?: (newLocation: { latitude: number; longitude: number }) => void;
  rideRequests?: Array<{ id: string; latitude: number; longitude: number; address?: string; estimatedPrice?: string; passengers?: number }>;
  onRideRequestPress?: (rideRequest: any) => void;
  debugLogs?: boolean;
}

export default function OpenStreetMap({
  latitude,
  longitude,
  style,
  onMapPress,
  showMarker = true,
  markerPosition,
  markerType = 'default',
  originMarker,
  destinationMarker,
  clientMarker,
  extraStopMarkers = [],
  routeCoordinates,
  nearbyDrivers = [],
  draggableMarker = false,
  onMarkerDragEnd,
  rideRequests = [],
  onRideRequestPress,
  debugLogs = false,
}: OpenStreetMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const rideRequestsRef = useRef(rideRequests);
  const pendingPayloadRef = useRef<any>(null);
  const shouldLog = debugLogs;

  useEffect(() => {
    rideRequestsRef.current = rideRequests;
  }, [rideRequests]);

  const payloadToFlush = pendingPayloadRef.current;
if (shouldLog) {
  console.log('🛰️ [OpenStreetMap] Flushing pending payload', payloadToFlush);
}

  const handleMessage = useCallback(
    (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (!data) {
          return;
        }

        if (data.type === 'mapReady') {
          setMapReady(true);
          return;
        }

        if (data.type === 'mapLog' && data.message) {
          if (shouldLog) {
            console.log('🗺️ [OpenStreetMap][WebView]', data.message);
          }
          return;
        }

        if (data.type === 'mapClick' && onMapPress) {
          onMapPress({ latitude: data.lat, longitude: data.lng });
        }

        if (data.type === 'markerDragEnd' && onMarkerDragEnd) {
          onMarkerDragEnd({ latitude: data.lat, longitude: data.lng });
        }

        if (data.type === 'rideRequestClick' && onRideRequestPress) {
          const currentRideRequests = rideRequestsRef.current || [];
          const rideRequest = currentRideRequests.find(r => r.id === data.rideId);
          if (rideRequest) {
            onRideRequestPress(rideRequest);
          }
        }
      } catch (error) {
        console.error('Error parsing map message:', error);
      }
    },
    [onMapPress, onMarkerDragEnd, onRideRequestPress, shouldLog],
  );

  const sendMessageToMap = useCallback((message: unknown) => {
    if (!webViewRef.current) {
      return;
    }

    try {
      webViewRef.current.postMessage(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending message to map:', error);
    }
  }, []);
  const handleLoadStart = useCallback(() => {
    setMapReady(false);
  }, []);

  const handleLoadEnd = useCallback(() => {
    if (shouldLog) {
      console.log('🗺️ [OpenStreetMap] WebView loaded');
    }
  }, [shouldLog]);

  const htmlContent = useMemo(() => getOpenStreetMapHtml(), []);

  const payload = useMemo(
    () => ({
      center: { latitude, longitude },
      showMarker,
      markerPosition: markerPosition ? { latitude: markerPosition.latitude, longitude: markerPosition.longitude } : undefined,
      markerType,
      draggableMarker: !!draggableMarker,
      originMarker: originMarker ? { latitude: originMarker.latitude, longitude: originMarker.longitude, draggable: false } : undefined,
      destinationMarker: destinationMarker ? { latitude: destinationMarker.latitude, longitude: destinationMarker.longitude, draggable: false } : undefined,
      clientMarker: clientMarker ? { latitude: clientMarker.latitude, longitude: clientMarker.longitude } : undefined,
      extraStopMarkers: (extraStopMarkers || []).map(stop => ({
        latitude: stop.latitude,
        longitude: stop.longitude,
        index: stop.index,
        color: stop.color,
      })),
      routeCoordinates: (routeCoordinates || []).map(point => ({ latitude: point.latitude, longitude: point.longitude })),
      nearbyDrivers: (nearbyDrivers || []).map(driver => ({
        id: driver.id,
        latitude: driver.latitude,
        longitude: driver.longitude,
        heading: driver.heading,
      })),
      rideRequests: (rideRequests || []).map(request => ({
        id: request.id,
        latitude: request.latitude,
        longitude: request.longitude,
        address: request.address,
        estimatedPrice: request.estimatedPrice,
        passengers: request.passengers,
      })),
      enableMapClick: Boolean(onMapPress),
      fitToMarkers: true,
    }),
    [
      latitude,
      longitude,
      showMarker,
      markerPosition,
      markerType,
      draggableMarker,
      originMarker,
      destinationMarker,
      clientMarker,
      extraStopMarkers,
      routeCoordinates,
      nearbyDrivers,
      rideRequests,
      onMapPress,
    ],
  );

  useEffect(() => {
    pendingPayloadRef.current = payload;
    if (mapReady) {
      sendMessageToMap({ type: 'updateData', payload });
      pendingPayloadRef.current = null;
    }
    if (shouldLog) {
      console.log('🛰️ [OpenStreetMap] Sending payload', payload);
    }
  }, [payload, mapReady, sendMessageToMap]);

  useEffect(() => {
    if (mapReady && pendingPayloadRef.current) {
      sendMessageToMap({ type: 'updateData', payload: pendingPayloadRef.current });
      pendingPayloadRef.current = null;
    }
    if (shouldLog) {
      console.log('🛰️ [OpenStreetMap] Sending payload', payload);
    }
  }, [mapReady, sendMessageToMap]);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        scalesPageToFit
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        cacheEnabled={false}
        incognito
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
