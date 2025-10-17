# Instalar Dependencias de Notificaciones

## Expo Notifications

```bash
cd Frontend
npx expo install expo-notifications expo-constants expo-device
```

## Configuración en app.json

Agregar en `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#2196F3",
          "sounds": ["./assets/notification-sound.wav"]
        }
      ]
    ],
    "notification": {
      "icon": "./assets/notification-icon.png",
      "color": "#2196F3",
      "androidMode": "default",
      "androidCollapsedTitle": "DriveAngel"
    }
  }
}
```

## Testing

Después de instalar, ejecutar:

```bash
npm start -- --clear
```
