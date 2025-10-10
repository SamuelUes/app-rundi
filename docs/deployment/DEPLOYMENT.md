# 🚀 DriveAngel.online - Guía de Deployment

## 🌐 Dominio
- **Producción**: `driveangel.online`
- **API**: `api.driveangel.online`
- **WebSocket**: `wss://api.driveangel.online/tracking`

---

## 📦 Backend Deployment

### Requisitos:
- Node.js 18+
- PostgreSQL 14+
- PM2 (para proceso)
- Nginx (como proxy reverso)

### 1. Configurar Variables de Entorno
```bash
cp .env.production .env
# Editar .env con valores reales de producción
```

### 2. Instalar Dependencias
```bash
cd Backend
npm install --production
```

### 3. Build
```bash
npm run build
```

### 4. Migraciones de Base de Datos
```bash
npm run typeorm migration:run
```

### 5. Iniciar con PM2
```bash
pm2 start dist/main.js --name driveangel-api
pm2 save
pm2 startup
```

### 6. Configurar Nginx
```nginx
server {
    listen 80;
    server_name api.driveangel.online;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket support
    location /tracking {
        proxy_pass http://localhost:3000/tracking;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

### 7. SSL con Let's Encrypt
```bash
sudo certbot --nginx -d api.driveangel.online
```

---

## 📱 Frontend Deployment

### Para Expo/React Native:

#### Desarrollo Local:
```bash
cd Frontend
npm start
```

#### Build para Producción:
```bash
# Cambiar NODE_ENV a production en .env
NODE_ENV=production

# Build para Android
eas build --platform android --profile production

# Build para iOS
eas build --platform ios --profile production
```

### Configuración de EAS Build:
Crear `eas.json`:
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "NODE_ENV": "development"
      }
    },
    "production": {
      "env": {
        "NODE_ENV": "production",
        "API_BASE_URL": "https://api.driveangel.online",
        "WS_URL": "https://api.driveangel.online"
      }
    }
  }
}
```

---

## 🔧 Configuración DNS

### Registros necesarios en driveangel.online:

```
A     @              -> IP_DEL_SERVIDOR
A     api            -> IP_DEL_SERVIDOR
CNAME www            -> driveangel.online
```

---

## ✅ Checklist Pre-Deployment

### Backend:
- [ ] Variables de entorno configuradas
- [ ] Base de datos PostgreSQL lista
- [ ] Firebase credentials configuradas
- [ ] Stripe keys de producción
- [ ] SSL certificado instalado
- [ ] PM2 configurado
- [ ] Nginx configurado
- [ ] Firewall configurado (puertos 80, 443)

### Frontend:
- [ ] NODE_ENV=production en build
- [ ] URLs de producción configuradas
- [ ] API keys de producción
- [ ] Build de Android/iOS generado
- [ ] Publicado en Play Store / App Store

### Base de Datos:
- [ ] Backups automáticos configurados
- [ ] Índices optimizados
- [ ] Conexiones SSL habilitadas

### Seguridad:
- [ ] Rate limiting configurado
- [ ] CORS configurado correctamente
- [ ] Secrets rotados
- [ ] Logs configurados
- [ ] Monitoring configurado (opcional: Sentry, DataDog)

---

## 🔄 Actualización en Producción

```bash
# 1. Pull cambios
git pull origin main

# 2. Instalar dependencias
npm install --production

# 3. Build
npm run build

# 4. Reiniciar PM2
pm2 restart driveangel-api

# 5. Verificar logs
pm2 logs driveangel-api
```

---

## 📊 Monitoreo

### PM2 Monitoring:
```bash
pm2 monit
pm2 status
pm2 logs driveangel-api --lines 100
```

### Base de Datos:
```bash
# Conexión a PostgreSQL
psql -h localhost -U driveangel_prod -d driveangel_production

# Ver viajes activos
SELECT COUNT(*) FROM rides WHERE status IN ('requested', 'accepted', 'in_progress');

# Ver conductores conectados
# (Implementar query según necesidad)
```

---

## 🆘 Troubleshooting

### Backend no inicia:
```bash
pm2 logs driveangel-api --err
```

### WebSocket no conecta:
- Verificar Nginx configuración de upgrade
- Verificar firewall permite WebSocket
- Verificar SSL en WebSocket (wss://)

### Base de datos lenta:
```sql
-- Ver queries lentas
SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
```

---

## 📞 Contacto
Para soporte de deployment: [tu-email@driveangel.online]
