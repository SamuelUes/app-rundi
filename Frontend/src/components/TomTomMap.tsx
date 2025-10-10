import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const TOMTOM_API_KEY = '3NDFoFMjpXAs6W2PbCIEAMG0eAlQymMA';

interface TomTomMapProps {
  latitude: number;
  longitude: number;
  style?: any;
  onMapPress?: (event: { latitude: number; longitude: number }) => void;
  showMarker?: boolean;
  markerPosition?: { latitude: number; longitude: number };
  markerType?: 'default' | 'car' | 'origin' | 'destination'; // Tipo de marcador
  originMarker?: { latitude: number; longitude: number };
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
}

export default function TomTomMap({ 
  latitude, 
  longitude, 
  style, 
  onMapPress,
  showMarker = true,
  markerPosition,
  markerType = 'default',
  originMarker,
  routeCoordinates
}: TomTomMapProps) {
  const webViewRef = useRef<WebView>(null);

  const handleMessage = (event: any) => {
    if (onMapPress) {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'mapClick') {
          onMapPress({ latitude: data.lat, longitude: data.lng });
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    }
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" type="text/css" href="https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/6.25.0/maps/maps.css"/>
      <script src="https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/6.25.0/maps/maps-web.min.js"></script>
      <style>
        body, html {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        #map {
          width: 100%;
          height: 100%;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = tt.map({
          key: '${TOMTOM_API_KEY}',
          container: 'map',
          center: [${longitude}, ${latitude}],
          zoom: 15,
          style: 'https://api.tomtom.com/style/1/style/22.2.1-*?map=basic_main&poi=poi_main'
        });

        // Marcador de origen (azul)
        ${originMarker ? `
        var originMarkerEl = new tt.Marker({
          color: '#0000FF'
        })
        .setLngLat([${originMarker.longitude}, ${originMarker.latitude}])
        .addTo(map);
        ` : ''}

        // Marcador principal (con tipo personalizado)
        ${showMarker && markerPosition ? `
        ${markerType === 'car' ? `
        // Crear elemento HTML personalizado para el carro
        var carElement = document.createElement('div');
        carElement.innerHTML = \`
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="11" fill="#4CAF50" opacity="0.2"/>
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" fill="#4CAF50"/>
          </svg>
        \`;
        carElement.style.width = '40px';
        carElement.style.height = '40px';
        carElement.style.cursor = 'pointer';
        
        var carMarker = new tt.Marker({
          element: carElement,
          anchor: 'center'
        })
        .setLngLat([${markerPosition.longitude}, ${markerPosition.latitude}])
        .addTo(map);
        ` : `
        // Marcador por defecto
        var destMarkerEl = new tt.Marker({
          color: '${markerType === 'origin' ? '#0000FF' : '#FF0000'}'
        })
        .setLngLat([${markerPosition.longitude}, ${markerPosition.latitude}])
        .addTo(map);
        `}
        ` : ''}

        // Dibujar ruta
        ${routeCoordinates && routeCoordinates.length > 0 ? `
        var routeCoords = ${JSON.stringify(routeCoordinates.map(c => [c.longitude, c.latitude]))};
        
        map.on('load', function() {
          map.addLayer({
            'id': 'route',
            'type': 'line',
            'source': {
              'type': 'geojson',
              'data': {
                'type': 'Feature',
                'properties': {},
                'geometry': {
                  'type': 'LineString',
                  'coordinates': routeCoords
                }
              }
            },
            'layout': {
              'line-join': 'round',
              'line-cap': 'round'
            },
            'paint': {
              'line-color': '#2196F3',
              'line-width': 5,
              'line-opacity': 0.8
            }
          });

          // Ajustar el mapa para mostrar toda la ruta
          var bounds = new tt.LngLatBounds();
          routeCoords.forEach(function(coord) {
            bounds.extend(coord);
          });
          map.fitBounds(bounds, { padding: 50 });
        });
        ` : ''}

        // Listener para clicks en el mapa
        ${onMapPress ? `
        map.on('click', function(e) {
          var lngLat = e.lngLat;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'mapClick',
            lat: lngLat.lat,
            lng: lngLat.lng
          }));
        });
        ` : ''}

        // Agregar controles de navegación
        map.addControl(new tt.NavigationControl());

        // Deshabilitar rotación con dos dedos
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();

        console.log('TomTom Map loaded successfully');
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
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        scalesPageToFit={true}
        scrollEnabled={false}
        onMessage={handleMessage}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error: ', nativeEvent);
        }}
        onLoad={() => console.log('TomTom Map WebView loaded')}
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
