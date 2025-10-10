# 🚗 DriveAngel.ni - Plataforma de Transporte

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/yourusername/driveangel)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Domain](https://img.shields.io/badge/domain-driveangel.online-orange.svg)](https://driveangel.online)

Plataforma de transporte privado y conductor designado para Nicaragua.

---

## 🌟 Características

### Para Clientes:
- 📍 Solicitud de viajes en tiempo real
- 🗺️ Mapas con OpenStreetMap + MapBox
- 💰 Cálculo automático de tarifas (C$50 base + C$35/km)
- 🚗 Servicio de conductor designado
- 📱 Tracking en vivo del conductor
- 💳 Pagos con Stripe
- ⭐ Sistema de calificaciones
- 🔗 Compartir enlace de tracking

### Para Conductores:
- 🔔 Notificaciones en tiempo real de nuevos viajes
- ✅ Aceptación de viajes con validaciones
- 📋 Inspección de vehículo con firma digital
- 💵 Seguimiento de ganancias
- 🗺️ Navegación integrada
- 📊 Historial de viajes

### Técnicas:
- 🔌 WebSocket para comunicación en tiempo real
- 🗺️ Sistema jerárquico de mapas (MapBox → OSM → TomTom)
- ✅ Validaciones exhaustivas en backend
- 🔐 Autenticación con Firebase
- 💾 Base de datos PostgreSQL
- 🚀 Backend con NestJS
- 📱 Frontend con React Native + Expo

---

## 🏗️ Arquitectura

```
┌─────────────────┐
│  React Native   │  Frontend (Expo)
│   + Expo Go     │  - Cliente: Solicitar viajes
└────────┬────────┘  - Conductor: Aceptar viajes
         │
         ├─── HTTP/REST ───┐
         │                 │
         └─── WebSocket ───┤
                          │
                ┌─────────▼────────┐
                │   NestJS API     │  Backend
                │  (Port 3000)     │  - Validaciones
                └─────────┬────────┘  - Lógica de negocio
                          │
                ┌─────────┴────────┐
                │   PostgreSQL     │  Base de Datos
                │   (Port 5432)    │  - Usuarios, Viajes, Pagos
                └──────────────────┘
```

---

## 🚀 Inicio Rápido

### Prerrequisitos:
- Node.js 18+
- PostgreSQL 14+
- Expo CLI
- Android Studio / Xcode (opcional)

### 1. Clonar Repositorio
```bash
git clone [tu-repo]
cd App-Uber
```

### 2. Backend Setup
```bash
cd Backend
npm install
cp .env.example .env
# Editar .env con tus credenciales
npm run start:dev
```

### 3. Frontend Setup
```bash
cd Frontend
npm install
cp .env.example .env
# Editar .env con tu IP local
npm start
```

### 4. Abrir en Expo Go
- Escanear QR code con Expo Go (Android)
- O usar emulador: `npm run android`

---

## 🌐 Entornos

### Desarrollo (Actual):
```bash
# Frontend
API: http://192.168.1.18:3000/api
WebSocket: http://192.168.1.18:3000/tracking

# Backend
npm run start:dev
```

### Producción (driveangel.online):
```bash
# Frontend
API: https://api.driveangel.online
WebSocket: wss://api.driveangel.online/tracking

# Backend
NODE_ENV=production npm run build
pm2 start dist/main.js
```

**Cambiar entorno:**
```bash
cd Frontend
npm run env:dev   # Desarrollo
npm run env:prod  # Producción
```

---

## 📁 Estructura del Proyecto

```
App-Uber/
├── Backend/                 # NestJS API
│   ├── src/
│   │   ├── auth/           # Autenticación
│   │   ├── users/          # Gestión de usuarios
│   │   ├── drivers/        # Gestión de conductores
│   │   ├── rides/          # Lógica de viajes
│   │   ├── payments/       # Integración Stripe
│   │   ├── tracking/       # WebSocket tracking
│   │   ├── maps/           # Sistema de mapas
│   │   └── notifications/  # Notificaciones
│   ├── .env.example
│   └── .env.production
│
├── Frontend/               # React Native + Expo
│   ├── src/
│   │   ├── screens/       # Pantallas
│   │   │   ├── Client/    # Pantallas de cliente
│   │   │   └── Driver/    # Pantallas de conductor
│   │   ├── components/    # Componentes reutilizables
│   │   ├── services/      # Servicios API
│   │   ├── hooks/         # Custom hooks
│   │   ├── navigation/    # Navegación
│   │   └── config/        # Configuración
│   ├── .env.example
│   └── .env.production
│
├── DEPLOYMENT.md          # Guía completa de deployment
├── QUICK-DEPLOY.md        # Guía rápida
└── README.md              # Este archivo
```

---

## 🔑 Variables de Entorno

Ver archivos `.env.example` en Backend y Frontend para la lista completa.

**Importantes:**
- `API_BASE_URL` - URL del backend
- `WS_URL` - URL del WebSocket
- `DB_*` - Credenciales de PostgreSQL
- `STRIPE_*` - Keys de Stripe
- `MAPBOX_TOKEN` - Token de MapBox

---

## 📚 Documentación

- [Guía de Deployment Completa](DEPLOYMENT.md)
- [Guía de Deployment Rápido](QUICK-DEPLOY.md)
- API Docs: `https://api.driveangel.online/api-docs` (próximamente)

---

## 🛠️ Stack Tecnológico

### Backend:
- **Framework**: NestJS
- **Base de Datos**: PostgreSQL + TypeORM
- **WebSocket**: Socket.io
- **Autenticación**: Firebase Admin SDK
- **Pagos**: Stripe
- **Mapas**: MapBox, OpenStreetMap, TomTom

### Frontend:
- **Framework**: React Native + Expo
- **Navegación**: React Navigation
- **Estado**: React Hooks + Context
- **HTTP**: Axios
- **WebSocket**: Socket.io-client
- **Mapas**: Leaflet (WebView)

---

## 📊 Estado del Proyecto

### ✅ Completado:
- Sistema de autenticación
- Gestión de usuarios y conductores
- Solicitud y aceptación de viajes
- Tracking en tiempo real
- Sistema de mapas jerárquico
- Notificaciones WebSocket
- Cálculo de tarifas
- Inspección de vehículos
- Compartir enlace de tracking
- Configuración multi-entorno

### 🚧 En Desarrollo:
- Integración completa de pagos
- Sistema de calificaciones
- Historial de viajes
- Panel de administración

---

## 🤝 Contribuir

1. Fork el proyecto
2. Crear rama: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m 'Agregar nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Pull Request

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

---

## 📞 Contacto

- **Website**: https://driveangel.online
- **Email**: soporte@driveangel.online
- **WhatsApp**: +505 1234-5678

---

## 🇳🇮 Hecho en Nicaragua con ❤️

**DriveAngel.ni** - Tu compañero de viaje seguro
