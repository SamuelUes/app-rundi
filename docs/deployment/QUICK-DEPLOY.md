# ⚡ DriveAngel.online - Despliegue Rápido

## 🎯 Resumen
- **Dominio**: driveangel.online
- **API**: api.driveangel.online
- **Actualmente**: Desarrollo local ✅
- **Listo para**: Producción (solo configurar servidor)

---

## 🚀 Pasos para Producción

### 1️⃣ Configurar DNS (en tu proveedor de dominio)
```
Tipo    Nombre    Valor
A       @         [IP_DE_TU_SERVIDOR]
A       api       [IP_DE_TU_SERVIDOR]
CNAME   www       driveangel.online
```

### 2️⃣ Backend - Configurar Servidor

#### Instalar dependencias del sistema:
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm postgresql nginx certbot python3-certbot-nginx

# Instalar PM2 globalmente
sudo npm install -g pm2
```

#### Clonar y configurar:
```bash
cd /var/www
git clone [tu-repo] driveangel
cd driveangel/Backend

# Copiar y editar variables de producción
cp .env.production .env
nano .env  # Editar con valores reales

# Instalar dependencias
npm install --production

# Build
npm run build

# Iniciar con PM2
pm2 start dist/main.js --name driveangel-api
pm2 save
pm2 startup
```

#### Configurar Nginx:
```bash
sudo nano /etc/nginx/sites-available/driveangel
```

Pegar esta configuración:
```nginx
server {
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

Activar y SSL:
```bash
sudo ln -s /etc/nginx/sites-available/driveangel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo certbot --nginx -d api.driveangel.online
```

### 3️⃣ Base de Datos PostgreSQL

```bash
sudo -u postgres psql

CREATE DATABASE driveangel_production;
CREATE USER driveangel_prod WITH PASSWORD 'tu-password-seguro';
GRANT ALL PRIVILEGES ON DATABASE driveangel_production TO driveangel_prod;
\q
```

### 4️⃣ Frontend - Build para Producción

```bash
cd Frontend

# Cambiar a producción
npm run env:prod

# Build para Android
npx eas build --platform android --profile production

# Build para iOS
npx eas build --platform ios --profile production
```

---

## 🔄 Cambiar entre Entornos

### Desarrollo (Local):
```bash
cd Frontend
npm run env:dev
npm start
```

### Producción:
```bash
cd Frontend
npm run env:prod
npm start
```

---

## ✅ Verificación Post-Deployment

### Backend:
```bash
# Verificar que está corriendo
pm2 status

# Ver logs
pm2 logs driveangel-api

# Probar API
curl https://api.driveangel.online/api/maps/provider
```

### Frontend:
- Abrir app y verificar que conecta a producción
- Verificar logs: debe mostrar "PRODUCTION" environment

---

## 🔧 Variables Importantes a Cambiar

### Backend (.env):
- ✅ `DB_PASSWORD` - Password seguro de PostgreSQL
- ✅ `JWT_SECRET` - Secret único para JWT
- ✅ `STRIPE_SECRET_KEY` - Key de producción de Stripe
- ⚠️ `FIREBASE_PRIVATE_KEY` - Credentials de Firebase

### Frontend (.env.production):
- ✅ `STRIPE_PUBLIC_KEY` - Key pública de producción
- ✅ Ya configurado con driveangel.online

---

## 📊 Monitoreo

```bash
# Ver estado
pm2 status

# Ver logs en tiempo real
pm2 logs driveangel-api --lines 50

# Reiniciar
pm2 restart driveangel-api

# Ver métricas
pm2 monit
```

---

## 🆘 Rollback Rápido

Si algo falla en producción:

```bash
# Volver a versión anterior
cd /var/www/driveangel/Backend
git checkout [commit-anterior]
npm run build
pm2 restart driveangel-api
```

---

## 📱 URLs Finales

- **Web**: https://driveangel.online
- **API**: https://api.driveangel.online
- **WebSocket**: wss://api.driveangel.online/tracking
- **Docs API**: https://api.driveangel.online/api-docs (si implementas Swagger)

---

## 💡 Notas

- ✅ El código YA está preparado para producción
- ✅ Solo cambiar NODE_ENV=production
- ✅ Sistema detecta automáticamente el entorno
- ✅ CORS configurado para driveangel.online
- ✅ WebSocket listo para WSS
- 🔒 Recuerda cambiar todos los secrets en producción
