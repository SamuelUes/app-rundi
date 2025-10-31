import React, { useState, useEffect, useRef } from 'react';
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
  // ✅ NUEVO: Marcadores de paradas extras
  extraStopMarkers?: Array<{ latitude: number; longitude: number; index: number; color?: string }>;
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
  extraStopMarkers = [], // ✅ NUEVO
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
  console.log('🗺️ OpenStreetMap - rideRequests recibidos:', rideRequests.length, rideRequests);
  console.log('🗺️ OpenStreetMap - routeCoordinates recibidos:', routeCoordinates?.length || 0, 'puntos');
  console.log('🗺️ OpenStreetMap - extraStopMarkers recibidos:', extraStopMarkers?.length || 0, 'paradas');

  // Generar key único basado en los datos para forzar re-render cuando cambien
  const rideRequestIds = rideRequests.length > 0 ? rideRequests.map(r => r.id).join('-') : 'none';
  const routeHash = routeCoordinates && routeCoordinates.length > 0 ? `route${routeCoordinates.length}` : 'noroute';
  const mapKey = `map-${latitude.toFixed(4)}-${longitude.toFixed(4)}-drivers${nearbyDrivers.length}-rides${rideRequests.length}-${rideRequestIds}-${routeHash}`;
  
  console.log('🔑 [OpenStreetMap] mapKey generado:', mapKey);

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

        // Contenedor global para ajustar vista según los marcadores relevantes
        var allImportantMarkers = [];

        // Tiles de OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
        }).addTo(map);

        // Marcador de origen (azul mejorado - tamaño reducido)
        ${originMarker ? `
        var originIcon = L.divIcon({
          html: '<div style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 3px solid white; box-shadow: 0 3px 8px rgba(33, 150, 243, 0.4); position: relative; cursor: grab;"><span style="font-size: 20px;">📍</span><div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #1976D2;"></div></div>',
          iconSize: [36, 44],
          iconAnchor: [18, 44],
          className: 'origin-marker'
        });
        var originMarkerObj = L.marker([${originMarker.latitude}, ${originMarker.longitude}], {icon: originIcon, draggable: true}).addTo(map).bindPopup('<div style="font-family: Arial; font-weight: bold; color: #2196F3;">📍 Punto de Origen</div>');
        allImportantMarkers.push(originMarkerObj.getLatLng());
        originMarkerObj.on('dragend', function(e) {
          var pos = e.target.getLatLng();
          window.ReactNativeWebView.postMessage(JSON.stringify({type: 'originMarkerMoved', lat: pos.lat, lng: pos.lng}));
        });
        ` : ''}

        // Marcador del cliente (mejorado)
        ${clientMarker ? `
        var clientIcon = L.divIcon({
          html: '<div style="background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 4px solid white; box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4); animation: pulse 2s infinite;"><span style="font-size: 28px;">👤</span></div><style>@keyframes pulse { 0%, 100% { box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4); } 50% { box-shadow: 0 4px 20px rgba(255, 152, 0, 0.7); } }</style>',
          iconSize: [50, 50],
          iconAnchor: [25, 25],
          className: 'client-marker'
        });
        L.marker([${clientMarker.latitude}, ${clientMarker.longitude}], {icon: clientIcon}).addTo(map).bindPopup('<div style="font-family: Arial; font-weight: bold; color: #FF9800;">👤 Cliente esperando aquí</div>');
        ` : ''}

        // Marcador de destino (rojo mejorado - tamaño reducido)
        ${destinationMarker ? `
        var destIcon = L.divIcon({
          html: '<div style="background: linear-gradient(135deg, #F44336 0%, #D32F2F 100%); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 3px solid white; box-shadow: 0 3px 8px rgba(244, 67, 54, 0.4); position: relative; cursor: grab;"><span style="font-size: 20px;">🎯</span><div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #D32F2F;"></div></div>',
          iconSize: [36, 44],
          iconAnchor: [18, 44],
          className: 'destination-marker'
        });
        var destMarkerObj = L.marker([${destinationMarker.latitude}, ${destinationMarker.longitude}], {icon: destIcon, draggable: true}).addTo(map).bindPopup('<div style="font-family: Arial; font-weight: bold; color: #F44336;">🎯 Destino del viaje</div>');
        allImportantMarkers.push(destMarkerObj.getLatLng());
        destMarkerObj.on('dragend', function(e) {
          var pos = e.target.getLatLng();
          window.ReactNativeWebView.postMessage(JSON.stringify({type: 'destinationMarkerMoved', lat: pos.lat, lng: pos.lng}));
        });
        ` : ''}

        // Marcador principal (con tipo personalizado)
        ${showMarker && markerPosition ? `
        ${markerType === 'car' ? `
        // Icono de carro verde mejorado
        var carIcon = L.divIcon({
          html: '<div style="background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 4px solid white; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);"><span style="font-size: 28px;">🚗</span></div>',
          iconSize: [50, 50],
          iconAnchor: [25, 25],
          className: 'car-marker'
        });
        var mainMarker = L.marker([${markerPosition.latitude}, ${markerPosition.longitude}], {icon: carIcon, draggable: ${draggableMarker}}).addTo(map).bindPopup('<div style="font-family: Arial; font-weight: bold; color: #4CAF50;">🚗 Tu conductor</div>');
        allImportantMarkers.push(mainMarker.getLatLng());
        ` : markerType === 'origin' ? `
        // Icono de origen azul mejorado
        var originPinIcon = L.divIcon({
          html: '<div style="position: relative;"><div style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); border-radius: 50% 50% 50% 0; width: 40px; height: 40px; transform: rotate(-45deg); border: 4px solid white; box-shadow: 0 4px 12px rgba(33, 150, 243, 0.5); display: flex; align-items: center; justify-content: center;"><span style="transform: rotate(45deg); font-size: 24px;">📍</span></div><div style="position: absolute; bottom: -8px; left: 16px; width: 8px; height: 8px; background: #1976D2; border-radius: 50%; opacity: 0.3;"></div></div>',
          iconSize: [40, 40],
          iconAnchor: [20, 40],
          className: 'origin-pin-marker'
        });
        var mainMarker = L.marker([${markerPosition.latitude}, ${markerPosition.longitude}], {icon: originPinIcon, draggable: ${draggableMarker}}).addTo(map).bindPopup('<div style="font-family: Arial; font-weight: bold; color: #2196F3;">📍 Punto de recogida</div>');
        allImportantMarkers.push(mainMarker.getLatLng());
        ` : markerType === 'client' ? `
        // Icono de cliente (persona)
        var clientIcon = L.divIcon({
          html: '<div style="background: rgba(33, 150, 243, 0.2); border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 2px solid #2196F3;">👤</div>',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
          className: 'client-marker'
        });
        var mainMarker = L.marker([${markerPosition.latitude}, ${markerPosition.longitude}], {icon: clientIcon, draggable: ${draggableMarker}}).addTo(map).bindPopup('👤 Cliente');
        allImportantMarkers.push(mainMarker.getLatLng());
        ` : `
        // Icono de destino rojo mejorado
        var destPinIcon = L.divIcon({
          html: '<div style="position: relative;"><div style="background: linear-gradient(135deg, #FF0000 0%, #D32F2F 100%); border-radius: 50% 50% 50% 0; width: 40px; height: 40px; transform: rotate(-45deg); border: 4px solid white; box-shadow: 0 4px 12px rgba(255, 0, 0, 0.5); display: flex; align-items: center; justify-content: center;"><span style="transform: rotate(45deg); font-size: 24px;">🎯</span></div><div style="position: absolute; bottom: -8px; left: 16px; width: 8px; height: 8px; background: #D32F2F; border-radius: 50%; opacity: 0.3;"></div></div>',
          iconSize: [40, 40],
          iconAnchor: [20, 40],
          className: 'dest-pin-marker'
        });
        var mainMarker = L.marker([${markerPosition.latitude}, ${markerPosition.longitude}], {icon: destPinIcon, draggable: ${draggableMarker}}).addTo(map).bindPopup('<div style="font-family: Arial; font-weight: bold; color: #FF0000;">🎯 Destino</div>');
        allImportantMarkers.push(mainMarker.getLatLng());
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

        // ✅ MEJORADO: Agregar marcadores principales al grupo (fallback si no se crearon arriba)
        ${originMarker ? `allImportantMarkers.push(L.latLng(${originMarker.latitude}, ${originMarker.longitude}));` : ''}
        ${destinationMarker ? `allImportantMarkers.push(L.latLng(${destinationMarker.latitude}, ${destinationMarker.longitude}));` : ''}
        
        // Dibujar ruta
        ${routeCoordinates && routeCoordinates.length > 0 ? `
        var routeCoords = ${JSON.stringify(routeCoordinates.map(c => [c.latitude, c.longitude]))};
        var polyline = L.polyline(routeCoords, {
          color: '#2196F3',
          weight: 5,
          opacity: 0.8
        }).addTo(map);
        ` : ''}

        // Listener para clicks en el mapa (seleccionar origen/destino)
        ${onMapPress ? `
        map.on('click', function(e) {
          // Enviar evento de click en el mapa al frontend
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mapClick',
            lat: e.latlng.lat,
            lng: e.latlng.lng
          }));
        });
        ` : ''}

        // Agregar marcadores de conductores cercanos mejorados
        ${(nearbyDrivers || []).map(driver => `
          var driverIcon = L.divIcon({
            html: '<div style="background: linear-gradient(135deg, #2196F3 0%, #1565C0 100%); border-radius: 50%; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; font-size: 22px; border: 3px solid white; box-shadow: 0 3px 10px rgba(33, 150, 243, 0.5); transform: rotate(${driver.heading || 0}deg);"><span style="transform: rotate(-${driver.heading || 0}deg); display: inline-block;">🚗</span></div>',
            className: 'nearby-driver-marker',
            iconSize: [45, 45],
            iconAnchor: [22, 22]
          });
          L.marker([${driver.latitude}, ${driver.longitude}], { icon: driverIcon }).addTo(map).bindPopup('<div style="font-family: Arial; font-weight: bold; color: #2196F3;">🚗 Conductor disponible</div>');
        `).join('')}

        // ✅ NUEVO: Agregar marcadores de paradas extras
        var stopMarkers = [];
        ${(extraStopMarkers || []).map(stop => `
          var stopIcon = L.divIcon({
            html: '<div style="background: linear-gradient(135deg, ${stop.color || '#FFA500'} 0%, ${stop.color || '#FFA500'} 100%); border-radius: 50%; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 4px solid white; box-shadow: 0 4px 12px rgba(255, 165, 0, 0.5); z-index: 1000;"><span style="font-weight: bold; color: white;">${stop.index}</span></div>',
            className: 'stop-marker',
            iconSize: [45, 45],
            iconAnchor: [22, 22]
          });
          var stopMarker = L.marker([${stop.latitude}, ${stop.longitude}], { icon: stopIcon, zIndexOffset: 1000 }).addTo(map).bindPopup('<div style="font-family: Arial; font-weight: bold; color: ${stop.color || '#FFA500'};">🛑 Parada ${stop.index}</div>');
          stopMarkers.push(stopMarker);
          allImportantMarkers.push(L.latLng(${stop.latitude}, ${stop.longitude}));
          console.log('🟠 Marcador de parada agregado:', ${stop.latitude}, ${stop.longitude});
        `).join('')}
        
        // ✅ MEJORADO: Ajustar vista a todos los marcadores importantes
        if (allImportantMarkers.length > 1) {
          var bounds = L.latLngBounds(allImportantMarkers);
          map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16 });
          console.log('🗺️ Vista ajustada para incluir todos los marcadores:', allImportantMarkers.length);
        } else if (allImportantMarkers.length === 1) {
          map.setView(allImportantMarkers[0], 16);
          console.log('🗺️ Vista centrada en único marcador importante');
        } else if (routeCoordinates && routeCoordinates.length > 0) {
          // Si no hay marcadores pero hay ruta, ajustar a la ruta
          map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
          console.log('🗺️ Vista ajustada para incluir la ruta');
        }

        // Agregar marcadores de solicitudes de viaje disponibles (destinos múltiples)
        ${(rideRequests || []).map(request => `
          var requestIcon = L.divIcon({
            html: '<div style="background: linear-gradient(135deg, #FF5722 0%, #E64A19 100%); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 4px solid white; box-shadow: 0 4px 12px rgba(255, 87, 34, 0.5); position: relative;"><span style="font-size: 28px;">📍</span><div style="position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-top: 10px solid #E64A19;"></div></div>',
            className: 'request-marker',
            iconSize: [50, 60],
            iconAnchor: [25, 50]
          });
          var requestMarker = L.marker([${request.latitude}, ${request.longitude}], { icon: requestIcon }).addTo(map);
          allImportantMarkers.push(L.latLng(${request.latitude}, ${request.longitude}));
          requestMarker.bindPopup('<div style="font-family: Arial, sans-serif; background: white; border-radius: 8px; padding: 12px;"><b style="color: #FF5722;">📍 Solicitud de Viaje</b><br><small style="color: #666;">${request.address || 'Dirección no disponible'}</small><br>${request.estimatedPrice ? '<b style="color: #4CAF50;">💰 C$' + request.estimatedPrice + '</b><br>' : ''}${request.passengers ? '<span style="color: #2196F3;">👥 ' + request.passengers + ' pasajero(s)</span>' : ''}<br><br><button onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type: \\'rideRequestClick\\', rideId: \\'${request.id}\\'}));" style="background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%); color: white; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">🚗 Ver Detalles</button></div>');
        `).join('')}

        console.log('🗺️ OpenStreetMap cargado: ${(nearbyDrivers || []).length} conductores, ${(rideRequests || []).length} solicitudes, ${(extraStopMarkers || []).length} paradas extras');
        console.log('🚗 Conductores a renderizar:', ${JSON.stringify(nearbyDrivers || [])});
        console.log('📍 Solicitudes a renderizar:', ${JSON.stringify(rideRequests || [])});
        
        // Verificar que los marcadores se agregaron
        var allMarkers = [];
        map.eachLayer(function(layer) {
          if (layer instanceof L.Marker) {
            allMarkers.push(layer.getLatLng());
          }
        });
        console.log('🗺️ Total de marcadores en el mapa:', allMarkers.length, allMarkers);
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[styles.container, style]}>
      <WebView
        key={mapKey}
        source={{ html: htmlContent }}
        style={style}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        cacheEnabled={false}
        incognito={true}
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
