# 🚀 Checklist de Producción - DriveAngel.ni

## 📋 Pre-Requisitos

- [ ] Cuenta de Stripe activada y verificada
- [ ] Dominio configurado: driveangel.online
- [ ] Servidor con Ubuntu/Debian
- [ ] PostgreSQL instalado
- [ ] Node.js 18+ instalado
- [ ] Nginx instalado
- [ ] Certificado SSL (Let's Encrypt)

---

## 🔐 1. Configuración de Stripe

### Backend (.env.production - Líneas 27-29)
```env
STRIPE_SECRET_KEY=sk_live_your_production_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret
```

### Frontend (.env.production - Líneas 18-19)
```env
STRIPE_PUBLIC_KEY=pk_live_your_production_stripe_key
```

### Pasos:
- [ ] Ir a https://dashboard.stripe.com/apikeys
- [ ] Copiar `pk_live_...` (Publishable key)
- [ ] Copiar `sk_live_...` (Secret key)
- [ ] Ir a https://dashboard.stripe.com/webhooks
- [ ] Crear webhook: `https://api.driveangel.online/payments/webhook`
- [ ] Seleccionar eventos:
  - [ ] `payment_intent.succeeded`
  - [ ] `payment_intent.payment_failed`
  - [ ] `charge.refunded`
- [ ] Copiar `whsec_...` (Webhook secret)
- [ ] Actualizar archivos `.env.production`

---

## 💾 2. Base de Datos

### Configuración
- [ ] Crear base de datos PostgreSQL
- [ ] Configurar usuario y contraseña
- [ ] Actualizar `.env.production`:
  ```env
  DB_HOST=localhost
  DB_PORT=5432
  DB_USERNAME=driveangel_user
  DB_PASSWORD=secure_password_here
  DB_DATABASE=driveangel_production
  ```

### Migraciones
```bash
cd Backend
npm run build
npm run migration:run
```

- [ ] Ejecutar migraciones
- [ ] Verificar tablas creadas
- [ ] Crear usuario admin inicial

---

## 🔧 3. Backend - Deployment

### Preparación
```bash
cd Backend
npm install --production
npm run build
```

### PM2 Setup
```bash
npm install -g pm2
pm2 start dist/main.js --name driveangel-api
pm2 startup
pm2 save
```

### Verificación
- [ ] Backend corriendo en puerto 3000
- [ ] Logs sin errores: `pm2 logs driveangel-api`
- [ ] Probar endpoint: `curl http://localhost:3000/health`

---

## 🌐 4. Nginx - Reverse Proxy

### Configuración
```nginx
# /etc/nginx/sites-available/driveangel-api

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
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Activar
```bash
sudo ln -s /etc/nginx/sites-available/driveangel-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

- [ ] Configuración creada
- [ ] Nginx recargado
- [ ] API accesible en http://api.driveangel.online

---

## 🔒 5. SSL - Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.driveangel.online
```

- [ ] Certificado SSL instalado
- [ ] HTTPS funcionando
- [ ] Auto-renovación configurada
- [ ] Probar: https://api.driveangel.online/health

---

## 📱 6. Frontend - Build

### Configuración
- [ ] Actualizar `Frontend/.env.production`
- [ ] Verificar `API_BASE_URL=https://api.driveangel.online`

### Build Android
```bash
cd Frontend
eas build --platform android --profile production
```

### Build iOS
```bash
eas build --platform ios --profile production
```

- [ ] APK generado
- [ ] IPA generado (si aplica)
- [ ] Probar en dispositivo real

---

## 🧪 7. Testing en Producción

### Backend
- [ ] GET https://api.driveangel.online/health → 200 OK
- [ ] POST https://api.driveangel.online/auth/login → Funciona
- [ ] WebSocket wss://api.driveangel.online/tracking → Conecta

### Stripe
- [ ] Crear viaje de prueba
- [ ] Completar viaje
- [ ] Procesar pago con tarjeta real
- [ ] Verificar webhook recibido
- [ ] Verificar pago en Stripe Dashboard
- [ ] Verificar recibo generado

### App Completa
- [ ] Registro de cliente funciona
- [ ] Registro de conductor funciona
- [ ] Login funciona
- [ ] Solicitar viaje funciona
- [ ] Aceptar viaje funciona
- [ ] Tracking en tiempo real funciona
- [ ] Chat funciona
- [ ] Completar viaje funciona
- [ ] Pago funciona
- [ ] Calificación funciona

---

## 📊 8. Monitoreo

### Logs
```bash
# Backend logs
pm2 logs driveangel-api

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# PostgreSQL logs
tail -f /var/log/postgresql/postgresql-*.log
```

### Stripe Dashboard
- [ ] Configurar alertas de pago
- [ ] Revisar métricas diarias
- [ ] Configurar notificaciones por email

### Uptime Monitoring
- [ ] Configurar UptimeRobot o similar
- [ ] Monitorear https://api.driveangel.online/health
- [ ] Alertas por email/SMS

---

## 🔐 9. Seguridad

### Backend
- [ ] Cambiar JWT_SECRET a valor seguro
- [ ] Configurar rate limiting
- [ ] Habilitar CORS solo para dominios permitidos
- [ ] Configurar helmet.js
- [ ] Validar todas las entradas

### Base de Datos
- [ ] Cambiar contraseña de PostgreSQL
- [ ] Configurar backup automático
- [ ] Restringir acceso solo a localhost
- [ ] Encriptar conexiones

### Stripe
- [ ] Verificar webhook signature
- [ ] Usar claves de producción
- [ ] Configurar límites de monto
- [ ] Revisar configuración de fraude

---

## 📱 10. App Stores

### Google Play Store
- [ ] Crear cuenta de desarrollador ($25 único)
- [ ] Preparar assets (icon, screenshots, descripción)
- [ ] Subir APK/AAB
- [ ] Completar ficha de la app
- [ ] Enviar a revisión

### Apple App Store
- [ ] Crear cuenta de desarrollador ($99/año)
- [ ] Preparar assets (icon, screenshots, descripción)
- [ ] Subir IPA via Xcode
- [ ] Completar ficha de la app
- [ ] Enviar a revisión

---

## 🚨 11. Plan de Contingencia

### Backup
- [ ] Backup diario de base de datos
- [ ] Backup de archivos de configuración
- [ ] Backup de código (Git)
- [ ] Probar restauración de backup

### Rollback
- [ ] Mantener versión anterior del backend
- [ ] Mantener versión anterior de la app
- [ ] Procedimiento de rollback documentado

### Soporte
- [ ] Email de soporte configurado
- [ ] Número de WhatsApp de soporte
- [ ] FAQ actualizado
- [ ] Sistema de tickets (opcional)

---

## ✅ 12. Post-Launch

### Día 1
- [ ] Monitorear logs constantemente
- [ ] Verificar todos los pagos
- [ ] Responder a usuarios rápidamente
- [ ] Corregir bugs críticos inmediatamente

### Semana 1
- [ ] Recopilar feedback de usuarios
- [ ] Analizar métricas de uso
- [ ] Optimizar performance
- [ ] Actualizar FAQ

### Mes 1
- [ ] Revisar costos de infraestructura
- [ ] Analizar retención de usuarios
- [ ] Planear nuevas features
- [ ] Marketing y promoción

---

## 📞 Contactos Importantes

- **Stripe Support**: https://support.stripe.com
- **Expo Support**: https://expo.dev/support
- **PostgreSQL**: https://www.postgresql.org/support/
- **Nginx**: https://nginx.org/en/docs/

---

## 🎯 Estado Actual

### Completado ✅
- [x] Sistema de mapas
- [x] Solicitud y aceptación de viajes
- [x] Tracking en tiempo real
- [x] Chat en tiempo real
- [x] Sistema de calificaciones
- [x] Historial de viajes
- [x] Sistema de pagos (Stripe)
- [x] Registro de conductores con vehículos
- [x] Auto-cancelación de viajes
- [x] Perfil y configuración

### Pendiente ⏳
- [ ] Upload de fotos/documentos
- [ ] Panel de administración
- [ ] Notificaciones push
- [ ] Deploy a producción

---

## 📝 Notas

**Claves de Stripe:**
- Frontend: `d:\Documentos\GitHub\App-Uber\Frontend\.env.production` (Líneas 18-19)
- Backend: `d:\Documentos\GitHub\App-Uber\Backend\.env.production` (Líneas 27-29)

**IMPORTANTE:** 
- ❌ NUNCA commitear archivos `.env.production` con claves reales
- ✅ Configurar variables de entorno directamente en el servidor
- ✅ Usar secrets management en producción (AWS Secrets Manager, etc.)

---

**Última actualización:** 2025-10-08
**Versión:** 1.0.0
**Estado:** Listo para producción (90%)
