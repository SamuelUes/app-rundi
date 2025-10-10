import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2FtdWVsdWVzIiwiYSI6ImNtZ2k5OHdzbDA3NW8ybXB4OXM5Y2E2ZzYifQ.rTD0LZ2w9t_jQxEV2MR_Sg';

interface MapViewProps {
  latitude: number;
  longitude: number;
  style?: any;
  onMapPress?: (event: { latitude: number; longitude: number }) => void;
  showMarker?: boolean;
  markerPosition?: { latitude: number; longitude: number };
  originMarker?: { latitude: number; longitude: number };
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  provider: 'mapbox' | 'openstreetmap' | 'tomtom' | 'google';
  markerIcon?: 'default' | 'car'; // Nuevo: tipo de icono
}

export default function MapView({
  latitude,
  longitude,
  style,
  onMapPress,
  showMarker = true,
  markerPosition,
  originMarker,
  routeCoordinates,
  provider,
  markerIcon = 'default',
}: MapViewProps) {
  const webViewRef = React.useRef<WebView>(null);

  const handleMessage = (event: any) => {
    if (onMapPress) {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'mapClick') {
          onMapPress({ latitude: data.lat, longitude: data.lng });
        }
      } catch (error) {
        console.error('Error parsing map message:', error);
      }
    }
  };

  const getTileUrl = () => {
    switch (provider) {
      case 'google':
        // Google Maps usa tiles estáticos (no requiere API key para tiles básicos)
        return 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
      case 'mapbox':
        return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`;
      case 'openstreetmap':
        return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      case 'tomtom':
        return 'https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=3NDFoFMjpXAs6W2PbCIEAMG0eAlQymMA';
      default:
        return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    }
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html { margin: 0; padding: 0; height: 100%; }
        #map { height: 100%; width: 100%; }
        .custom-marker { background: none; border: none; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', {
          zoomControl: true,
          attributionControl: false
        }).setView([${latitude}, ${longitude}], 15);

        // Tiles según proveedor
        ${provider === 'google' ? `
        L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
        }).addTo(map);
        ` : provider === 'mapbox' ? `
        L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}', {
          maxZoom: 19,
          tileSize: 512,
          zoomOffset: -1
        }).addTo(map);
        ` : provider === 'openstreetmap' ? `
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          subdomains: ['a', 'b', 'c']
        }).addTo(map);
        ` : `
        L.tileLayer('https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=3NDFoFMjpXAs6W2PbCIEAMG0eAlQymMA', {
          maxZoom: 19
        }).addTo(map);
        `}

        // Marcador de origen (azul)
        ${originMarker ? `
        var originIcon = L.icon({
          iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxMCIgZmlsbD0iIzIxOTZGMyIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzIi8+PC9zdmc+',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
        L.marker([${originMarker.latitude}, ${originMarker.longitude}], {icon: originIcon}).addTo(map);
        ` : ''}

        // Marcador de destino (rojo o carro)
        ${showMarker && markerPosition ? `
        var destIcon = L.divIcon({
          html: '${markerIcon === 'car' ? '<div style="font-size: 32px;">🚗</div>' : '<div style="width: 20px; height: 20px; background-color: #FF0000; border: 3px solid white; border-radius: 50%;"></div>'}',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          className: 'custom-marker'
        });
        L.marker([${markerPosition.latitude}, ${markerPosition.longitude}], {icon: destIcon}).addTo(map);
        ` : ''}

        // Dibujar ruta
        ${routeCoordinates && routeCoordinates.length > 0 ? `
        var routeCoords = ${JSON.stringify(routeCoordinates.map(c => [c.latitude, c.longitude]))};
        var polyline = L.polyline(routeCoords, {
          color: '#2196F3',
          weight: 5,
          opacity: 0.8
        }).addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
        ` : ''}

        // Listener para clicks
        ${onMapPress ? `
        map.on('click', function(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mapClick',
            lat: e.latlng.lat,
            lng: e.latlng.lng
          }));
        });
        ` : ''}

        console.log('Map loaded with provider: ${provider}');
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={true}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
});
