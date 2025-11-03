export function getOpenStreetMapHtml(): string {
  return String.raw`
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body { margin: 0; padding: 0; height: 100%; }
          #map { height: 100%; width: 100%; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          (function () {
            var RN = window.ReactNativeWebView;
            function postMessage(message) {
              if (RN && typeof RN.postMessage === 'function') {
                RN.postMessage(JSON.stringify(message));
              }
            }

            function log(message) {
              postMessage({ type: 'mapLog', message: message });
            }

            var map = L.map('map', { zoomControl: true, attributionControl: false });
            map.setView([0, 0], 15);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19,
            }).addTo(map);

            var state = {
              originMarker: null,
              destinationMarker: null,
              clientMarker: null,
              mainMarker: null,
              routeLine: null,
              extraStopMarkers: [],
              driverMarkers: [],
              rideRequestMarkers: [],
              mapClickEnabled: false,
              mapClickHandler: null,
            };

            function clearMarker(marker) {
              if (marker) {
                map.removeLayer(marker);
              }
              return null;
            }

            function clearMarkerList(list) {
              if (list && list.length) {
                list.forEach(function (marker) {
                  map.removeLayer(marker);
                });
              }
              return [];
            }

            function createIcon(html, size, anchor, className) {
              return L.divIcon({
                html: html,
                iconSize: size,
                iconAnchor: anchor,
                className: className || '',
              });
            }

            function originHtml() {
              return '<div style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 3px solid white; box-shadow: 0 3px 8px rgba(33,150,243,0.4); position: relative;">' +
                '<span style="font-size: 20px;">📍</span>' +
                '<div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #1976D2;"></div>' +
              '</div>';
            }

            function destinationHtml() {
              return '<div style="background: linear-gradient(135deg, #F44336 0%, #D32F2F 100%); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 3px solid white; box-shadow: 0 3px 8px rgba(244,67,54,0.4); position: relative;">' +
                '<span style="font-size: 20px;">🎯</span>' +
                '<div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #D32F2F;"></div>' +
              '</div>';
            }

            function clientHtml() {
              return '<div style="background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; font-size: 22px; border: 4px solid white; box-shadow: 0 4px 12px rgba(255,152,0,0.45);">' +
                '<span style="font-size: 26px;">👤</span>' +
              '</div>';
            }

            function mainMarkerHtml(type) {
              if (type === 'car') {
                return '<div style="background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%); border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 4px solid white; box-shadow: 0 4px 12px rgba(76,175,80,0.4);">' +
                  '<span style="font-size: 28px;">🚗</span>' +
                '</div>';
              }
              if (type === 'origin') {
                return '<div style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); border-radius: 50% 50% 50% 0; width: 40px; height: 40px; transform: rotate(-45deg); border: 4px solid white; box-shadow: 0 4px 12px rgba(33,150,243,0.5); display: flex; align-items: center; justify-content: center;">' +
                  '<span style="transform: rotate(45deg); font-size: 24px;">📍</span>' +
                '</div>';
              }
              if (type === 'client') {
                return '<div style="background: rgba(33,150,243,0.2); border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 2px solid #2196F3;">👤</div>';
              }
              if (type === 'destination') {
                return '<div style="background: linear-gradient(135deg, #F44336 0%, #D32F2F 100%); border-radius: 50% 50% 50% 0; width: 40px; height: 40px; transform: rotate(-45deg); border: 4px solid white; box-shadow: 0 4px 12px rgba(244,67,54,0.45); display: flex; align-items: center; justify-content: center;">' +
                  '<span style="transform: rotate(45deg); font-size: 24px;">🎯</span>' +
                '</div>';
              }
              return '<div style="background: linear-gradient(135deg, #673AB7 0%, #512DA8 100%); border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; font-size: 22px; border: 4px solid white; box-shadow: 0 4px 10px rgba(103,58,183,0.4);">🚕</div>';
            }

            function driverHtml(driver) {
              var heading = driver && typeof driver.heading === 'number' ? driver.heading : 0;
              return '<div style="background: linear-gradient(135deg, #2196F3 0%, #1565C0 100%); border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; font-size: 22px; border: 3px solid white; box-shadow: 0 4px 10px rgba(33,150,243,0.45); transform: rotate(' + heading + 'deg);">' +
                '<span style="transform: rotate(' + (-heading) + 'deg); display: inline-block;">🚗</span>' +
              '</div>';
            }

            function stopHtml(stop) {
              var color = stop && stop.color ? stop.color : '#FFA500';
              var index = stop && typeof stop.index !== 'undefined' ? stop.index : '';
              return '<div style="background: linear-gradient(135deg, ' + color + ' 0%, ' + color + ' 100%); border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 4px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">' +
                '<span style="font-weight: bold; color: white;">' + index + '</span>' +
              '</div>';
            }

            function ensureMarker(existing, coords, options, dragEvent) {
              existing = clearMarker(existing);
              if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
                return null;
              }

              var marker = L.marker([coords.latitude, coords.longitude], options || {});
              marker.addTo(map);

              if (coords.popup) {
                marker.bindPopup(coords.popup);
              }

              if (dragEvent && options && options.draggable) {
                marker.on('dragend', function (e) {
                  var pos = e.target.getLatLng();
                  postMessage({ type: dragEvent, lat: pos.lat, lng: pos.lng });
                });
              }

              return marker;
            }

            function enableMapClick(enabled) {
              if (enabled && !state.mapClickEnabled) {
                state.mapClickHandler = function (e) {
                  postMessage({ type: 'mapClick', lat: e.latlng.lat, lng: e.latlng.lng });
                };
                map.on('click', state.mapClickHandler);
              } else if (!enabled && state.mapClickEnabled && state.mapClickHandler) {
                map.off('click', state.mapClickHandler);
                state.mapClickHandler = null;
              }
              state.mapClickEnabled = !!enabled;
            }

            function clearDrivers() {
              state.driverMarkers = clearMarkerList(state.driverMarkers);
            }

            function updateDrivers(drivers, markersToFit) {
              clearDrivers();
              if (!drivers || !drivers.length) {
                return;
              }

              drivers.forEach(function (driver) {
                if (typeof driver.latitude !== 'number' || typeof driver.longitude !== 'number') {
                  return;
                }

                var driverIcon = createIcon(driverHtml(driver), [44, 44], [22, 22], 'driver-marker');
                var marker = L.marker([driver.latitude, driver.longitude], { icon: driverIcon });
                marker.addTo(map);
                state.driverMarkers.push(marker);
                markersToFit.push(marker.getLatLng());
              });
            }

            function updateRideRequests(requests, markersToFit) {
              state.rideRequestMarkers = clearMarkerList(state.rideRequestMarkers);
              if (!requests || !requests.length) {
                return;
              }

              requests.forEach(function (request) {
                if (typeof request.latitude !== 'number' || typeof request.longitude !== 'number') {
                  return;
                }

                var requestIcon = createIcon('<div style="background: linear-gradient(135deg, #FF5722 0%, #E64A19 100%); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; font-size: 24px; border: 4px solid white; box-shadow: 0 4px 12px rgba(255,87,34,0.45);">📍</div>', [50, 50], [25, 25], 'ride-request-marker');
                var marker = L.marker([request.latitude, request.longitude], { icon: requestIcon });
                marker.addTo(map);

                marker.on('click', function () {
                  postMessage({ type: 'rideRequestClick', rideId: request.id });
                });

                if (request.address || request.estimatedPrice || request.passengers) {
                  var price = request.estimatedPrice ? '💰 C$' + request.estimatedPrice : '';
                  var passengers = request.passengers ? '👥 ' + request.passengers + ' pasajero(s)' : '';
                  var content = '<div style="font-family: Arial, sans-serif; color: #333; font-size: 13px;">' +
                    '<strong style="color: #FF5722;">Solicitud de viaje</strong><br />' +
                    (request.address ? '<span>' + request.address + '</span><br />' : '') +
                    (price ? '<span style="color:#4CAF50;">' + price + '</span><br />' : '') +
                    (passengers ? '<span style="color:#2196F3;">' + passengers + '</span><br />' : '') +
                    '<span style="color:#888;">Toca el pin para ver detalles</span>' +
                  '</div>';
                  marker.bindPopup(content);
                }

                state.rideRequestMarkers.push(marker);
                markersToFit.push(marker.getLatLng());
              });
            }

            function updateExtraStops(stops, markersToFit) {
              state.extraStopMarkers = clearMarkerList(state.extraStopMarkers);
              if (!stops || !stops.length) {
                return;
              }

              stops.forEach(function (stop) {
                if (typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number') {
                  return;
                }

                var stopIcon = createIcon(stopHtml(stop), [44, 44], [22, 22], 'extra-stop-marker');
                var marker = L.marker([stop.latitude, stop.longitude], { icon: stopIcon, zIndexOffset: 1000 });
                marker.addTo(map);
                state.extraStopMarkers.push(marker);
                markersToFit.push(marker.getLatLng());
              });
            }

            function fitMarkers(markers, routeBounds) {
              if (markers.length > 1) {
                map.fitBounds(L.latLngBounds(markers), { padding: [60, 60], maxZoom: 16 });
              } else if (markers.length === 1) {
                map.setView(markers[0], Math.max(map.getZoom(), 16));
              } else if (routeBounds) {
                map.fitBounds(routeBounds, { padding: [50, 50] });
              }
            }

            function update(data) {
              if (!data) {
                return;
              }

              if (typeof data.enableMapClick !== 'undefined') {
                enableMapClick(!!data.enableMapClick);
              }

              if (data.center && typeof data.center.latitude === 'number' && typeof data.center.longitude === 'number') {
                var zoom = typeof data.center.zoom === 'number' ? data.center.zoom : map.getZoom();
                map.setView([data.center.latitude, data.center.longitude], zoom || 15);
              }

              var markersToFit = [];

              state.originMarker = ensureMarker(
                state.originMarker,
                data.originMarker,
                data.originMarker
                  ? { icon: createIcon(originHtml(), [36, 44], [18, 44], 'origin-marker'), draggable: !!data.originMarker.draggable }
                  : undefined,
                'originMarkerMoved',
              );
              if (state.originMarker) {
                markersToFit.push(state.originMarker.getLatLng());
              }

              state.destinationMarker = ensureMarker(
                state.destinationMarker,
                data.destinationMarker,
                data.destinationMarker
                  ? { icon: createIcon(destinationHtml(), [36, 44], [18, 44], 'destination-marker'), draggable: !!data.destinationMarker.draggable }
                  : undefined,
                'destinationMarkerMoved',
              );
              if (state.destinationMarker) {
                markersToFit.push(state.destinationMarker.getLatLng());
              }

              state.clientMarker = ensureMarker(
                state.clientMarker,
                data.clientMarker,
                data.clientMarker ? { icon: createIcon(clientHtml(), [48, 48], [24, 24], 'client-marker') } : undefined,
                undefined,
              );
              if (state.clientMarker) {
                markersToFit.push(state.clientMarker.getLatLng());
              }

              if (data.showMarker && data.markerPosition && typeof data.markerPosition.latitude === 'number' && typeof data.markerPosition.longitude === 'number') {
                state.mainMarker = ensureMarker(
                  state.mainMarker,
                  data.markerPosition,
                  {
                    icon: createIcon(mainMarkerHtml(data.markerType || 'default'), [48, 48], [24, 24], 'main-marker'),
                    draggable: !!data.draggableMarker,
                  },
                  'markerDragEnd',
                );
                if (state.mainMarker) {
                  markersToFit.push(state.mainMarker.getLatLng());
                }
              } else {
                state.mainMarker = clearMarker(state.mainMarker);
              }

              state.extraStopMarkers = clearMarkerList(state.extraStopMarkers);
              updateExtraStops(data.extraStopMarkers, markersToFit);

              if (state.routeLine) {
                map.removeLayer(state.routeLine);
                state.routeLine = null;
              }

              var routeBounds = null;
              if (data.routeCoordinates && data.routeCoordinates.length > 1) {
                var routeLatLngs = data.routeCoordinates
                  .filter(function (point) {
                    return typeof point.latitude === 'number' && typeof point.longitude === 'number';
                  })
                  .map(function (point) {
                    return [point.latitude, point.longitude];
                  });

                if (routeLatLngs.length > 1) {
                  state.routeLine = L.polyline(routeLatLngs, { color: '#2196F3', weight: 5, opacity: 0.8 }).addTo(map);
                  routeBounds = state.routeLine.getBounds();
                }
              }

              updateDrivers(data.nearbyDrivers, markersToFit);
              updateRideRequests(data.rideRequests, markersToFit);

              if (data.fitToMarkers) {
                fitMarkers(markersToFit, routeBounds);
              }

              map.invalidateSize();
            }

            function handleMessage(event) {
              try {
                var message = JSON.parse(event.data);
                if (!message) {
                  return;
                }

                if (message.type === 'updateData') {
                  update(message.payload || {});
                }
              } catch (error) {
                log('Error parsing message: ' + error.message);
              }
            }

            document.addEventListener('message', handleMessage);
            window.addEventListener('message', handleMessage);

            postMessage({ type: 'mapReady' });
          })();
        </script>
      </body>
    </html>
  `;
}
