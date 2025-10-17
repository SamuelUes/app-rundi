import React, { useRef, useEffect } from 'react';
import { StyleSheet, Platform } from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';

interface MapBoxMapProps {
  latitude: number;
  longitude: number;
  style?: any;
  onMapPress?: (event: { latitude: number; longitude: number }) => void;
  showMarker?: boolean;
  markerPosition?: { latitude: number; longitude: number };
  markerType?: 'default' | 'car' | 'origin' | 'destination' | 'client'; // Tipo de marcador
  originMarker?: { latitude: number; longitude: number };
  destinationMarker?: { latitude: number; longitude: number };
  clientMarker?: { latitude: number; longitude: number };
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
}

export default function MapBoxMap({
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
  routeCoordinates,
}: MapBoxMapProps) {
  const mapRef = useRef<MapView>(null);

  // Ajustar el mapa cuando hay ruta
  useEffect(() => {
    if (routeCoordinates && routeCoordinates.length > 0 && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(routeCoordinates, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }, 500);
    }
  }, [routeCoordinates]);

  const handleMapPress = (event: any) => {
    if (onMapPress) {
      const { latitude, longitude } = event.nativeEvent.coordinate;
      onMapPress({ latitude, longitude });
    }
  };

  return (
    <MapView
      ref={mapRef}
      style={[styles.map, style]}
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      }}
      onPress={handleMapPress}
      showsUserLocation={true}
      showsMyLocationButton={false} // Deshabilitar botón de Google
      showsCompass={true}
      showsScale={true}
      mapType="none" // Sin mapa base, usaremos tiles de Mapbox
    >
      {/* Tiles de Mapbox */}
      <UrlTile
        urlTemplate="https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=pk.eyJ1Ijoic2FtdWVsdWVzIiwiYSI6ImNtZ2k5OHdzbDA3NW8ybXB4OXM5Y2E2ZzYifQ.rTD0LZ2w9t_jQxEV2MR_Sg"
        maximumZ={19}
        flipY={false}
      />
      {/* Marcador de origen (azul) */}
      {originMarker && (
        <Marker
          coordinate={{
            latitude: originMarker.latitude,
            longitude: originMarker.longitude,
          }}
          pinColor="blue"
          title="Origen"
        />
      )}

      {/* Marcador del cliente (👤) */}
      {clientMarker && (
        <Marker
          coordinate={{
            latitude: clientMarker.latitude,
            longitude: clientMarker.longitude,
          }}
          pinColor="orange"
          title="Cliente"
          description="👤 Cliente esperando aquí"
        />
      )}

      {/* Marcador de destino (🔴) */}
      {destinationMarker && (
        <Marker
          coordinate={{
            latitude: destinationMarker.latitude,
            longitude: destinationMarker.longitude,
          }}
          pinColor="red"
          title="Destino"
          description="🔴 Destino del viaje"
        />
      )}

      {/* Marcador principal (con tipo personalizado) */}
      {showMarker && markerPosition && (
        <Marker
          coordinate={{
            latitude: markerPosition.latitude,
            longitude: markerPosition.longitude,
          }}
          pinColor={markerType === 'car' ? 'green' : markerType === 'origin' ? 'blue' : markerType === 'client' ? 'orange' : 'red'}
          title={markerType === 'car' ? 'Conductor' : markerType === 'origin' ? 'Origen' : markerType === 'client' ? 'Cliente' : 'Destino'}
          description={markerType === 'car' ? '🚗 Tu conductor' : markerType === 'client' ? '👤 Cliente' : undefined}
        />
      )}

      {/* Ruta */}
      {routeCoordinates && routeCoordinates.length > 0 && (
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#2196F3"
          strokeWidth={5}
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
