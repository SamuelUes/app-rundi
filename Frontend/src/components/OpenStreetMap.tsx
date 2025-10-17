import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

interface OpenStreetMapProps {
  latitude: number;
  longitude: number;
  style?: any;
  onMapPress?: (event: { latitude: number; longitude: number }) => void;
  showMarker?: boolean;
  markerPosition?: { latitude: number; longitude: number };
  markerType?: 'default' | 'car' | 'origin' | 'destination' | 'client';
  originMarker?: { latitude: number; longitude: number };
  destinationMarker?: { latitude: number; longitude: number };
  clientMarker?: { latitude: number; longitude: number };
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  nearbyDrivers?: Array<{ id: string; latitude: number; longitude: number; heading?: number }>; // Conductores cercanos
  draggableMarker?: boolean; // Permitir arrastrar el marcador
  onMarkerDragEnd?: (newLocation: { latitude: number; longitude: number }) => void; // Callback cuando se suelta el marcador
  rideRequests?: Array<{ id: string; latitude: number; longitude: number; address?: string; estimatedPrice?: string; passengers?: number }>; // Solicitudes de viaje disponibles
  onRideRequestPress?: (rideRequest: any) => void; // Callback cuando se presiona una solicitud de viaje
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
  routeCoordinates,
  nearbyDrivers = [],
  draggableMarker = false,
  onMarkerDragEnd,
  rideRequests = [],
  onRideRequestPress,
}: OpenStreetMapProps) {
  const webViewRef = useRef<WebView>(null);

  // Log para debug
  console.log('🗺️ OpenStreetMap - nearbyDrivers recibidos:', nearbyDrivers.length, nearbyDrivers);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'mapClick' && onMapPress) {
        onMapPress({ latitude: data.lat, longitude: data.lng });
      }
      
      if (data.type === 'markerDragEnd' && onMarkerDragEnd) {
        onMarkerDragEnd({ latitude: data.lat, longitude: data.lng });
      }
      
      if (data.type === 'rideRequestClick' && onRideRequestPress) {
        // Buscar el viaje completo en el array
        const rideRequest = rideRequests.find(r => r.id === data.rideId);
        if (rideRequest) {
          onRideRequestPress(rideRequest);
        }
      }
    } catch (error) {
      console.error('Error parsing map message:', error);
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
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        // Crear mapa con OpenStreetMap
        var map = L.map('map', {
          zoomControl: true,
          attributionControl: false
        }).setView([${latitude}, ${longitude}], 15);

        // Tiles de OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map);

        // Marcador de origen (azul)
        ${originMarker ? `
        var originIcon = L.icon({
          iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxMCIgZmlsbD0iIzIxOTZGMyIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzIi8+PC9zdmc+',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
        L.marker([${originMarker.latitude}, ${originMarker.longitude}], {icon: originIcon}).addTo(map);
        ` : ''}

        // Marcador del cliente (👤)
        ${clientMarker ? `
        var clientIcon = L.divIcon({
          html: '<div style="background: rgba(33, 150, 243, 0.2); border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 2px solid #2196F3;">👤</div>',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          className: 'client-marker'
        });
        L.marker([${clientMarker.latitude}, ${clientMarker.longitude}], {icon: clientIcon}).addTo(map).bindPopup('👤 Cliente esperando aquí');
        ` : ''}

        // Marcador de destino (🔴)
        ${destinationMarker ? `
        var destIcon = L.icon({
          iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxMCIgZmlsbD0iI0ZGMDAwMCIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzIi8+PC9zdmc+',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
        L.marker([${destinationMarker.latitude}, ${destinationMarker.longitude}], {icon: destIcon}).addTo(map).bindPopup('🔴 Destino del viaje');
        ` : ''}

        // Marcador principal (con tipo personalizado)
        ${showMarker && markerPosition ? `
        ${markerType === 'car' ? `
        // Icono de carro verde
        var carIcon = L.divIcon({
          html: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" fill="#4CAF50" opacity="0.2"/><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" fill="#4CAF50"/></svg>',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          className: 'car-marker'
        });
        var mainMarker = L.marker([${markerPosition.latitude}, ${markerPosition.longitude}], {icon: carIcon, draggable: ${draggableMarker}}).addTo(map).bindPopup('🚗 Tu conductor');
        ` : markerType === 'client' ? `
        // Icono de cliente (persona)
        var clientIcon = L.divIcon({
          html: '<div style="background: rgba(33, 150, 243, 0.2); border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 2px solid #2196F3;">👤</div>',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          className: 'client-marker'
        });
        var mainMarker = L.marker([${markerPosition.latitude}, ${markerPosition.longitude}], {icon: clientIcon, draggable: ${draggableMarker}}).addTo(map).bindPopup('👤 Cliente');
        ` : `
        // Icono por defecto (círculo)
        var destIcon = L.icon({
          iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSIxMCIgZmlsbD0iJHttYXJrZXJUeXBlID09PSAnb3JpZ2luJyA/ICcjMjE5NkYzJyA6ICcjRkYwMDAwJ30iIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMyIvPjwvc3ZnPg==',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
        var mainMarker = L.marker([${markerPosition.latitude}, ${markerPosition.longitude}], {icon: destIcon, draggable: ${draggableMarker}}).addTo(map);
        `}
        
        // Event listener para cuando se suelta el marcador
        ${draggableMarker ? `
        mainMarker.on('dragend', function(e) {
          var position = e.target.getLatLng();
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'markerDragEnd',
            lat: position.lat,
            lng: position.lng
          }));
        });
        ` : ''}
        ` : ''}

        // Dibujar ruta
        ${routeCoordinates && routeCoordinates.length > 0 ? `
        var routeCoords = ${JSON.stringify(routeCoordinates.map(c => [c.latitude, c.longitude]))};
        var polyline = L.polyline(routeCoords, {
          color: '#2196F3',
          weight: 5,
          opacity: 0.8
        }).addTo(map);
        
        // Ajustar vista a la ruta
        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
        ` : ''}

        // Listener para clicks en el mapa
        ${onMapPress ? `
        map.on('click', function(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mapClick',
            lat: e.latlng.lat,
            lng: e.latlng.lng
          }));
        });
        ` : ''}

        // Agregar marcadores de conductores cercanos
        ${(nearbyDrivers || []).map(driver => `
          var carIcon = L.divIcon({
            html: '<div style="font-size: 24px; transform: rotate(${driver.heading || 0}deg);">🚗</div>',
            className: 'car-marker',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          });
          L.marker([${driver.latitude}, ${driver.longitude}], { icon: carIcon }).addTo(map);
        `).join('')}

        // Agregar marcadores de solicitudes de viaje disponibles
        ${(rideRequests || []).map(request => `
          var requestIcon = L.divIcon({
            html: '<div style="background: #FF5722; border-radius: 50%; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: white; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">👤</div>',
            className: 'request-marker',
            iconSize: [35, 35],
            iconAnchor: [17, 17]
          });
          var requestMarker = L.marker([${request.latitude}, ${request.longitude}], { icon: requestIcon }).addTo(map);
          requestMarker.bindPopup('<div style="font-family: Arial, sans-serif;"><b>📍 Solicitud de Viaje</b><br><small>${request.address || 'Dirección no disponible'}</small><br>${request.estimatedPrice ? '<b>💰 C$' + request.estimatedPrice + '</b><br>' : ''}${request.passengers ? '👥 ' + request.passengers + ' pasajero(s)' : ''}<br><br><button onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type: \\'rideRequestClick\\', rideId: \\'${request.id}\\'}));" style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; width: 100%;">🚗 Ver Detalles</button></div>');
        `).join('')}

        console.log('🗺️ OpenStreetMap cargado: ${(nearbyDrivers || []).length} conductores, ${(rideRequests || []).length} solicitudes');
        console.log('🚗 Conductores a renderizar:', ${JSON.stringify(nearbyDrivers || [])});
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
        onLoad={() => console.log('OpenStreetMap WebView loaded')}
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
