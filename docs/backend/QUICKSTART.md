# ⚡ Quick Start - Backend App Uber

## 🎯 Primer paso: Instalar dependencias

Los errores de lint que ves en el editor se resolverán después de instalar las dependencias.

```bash
cd Backend
npm install
```

## 🗄️ Segundo paso: Configurar Base de Datos

### Opción A: Usar Docker (Recomendado para desarrollo)

```bash
# Levanta Postgres + Redis automáticamente
docker compose up -d postgres redis

# Verifica que estén corriendo
docker ps
```

### Opción B: Instalar localmente

**PostgreSQL:**
```bash
# Windows (descarga desde postgresql.org)
# Crea la base de datos:
psql -U postgres
CREATE DATABASE app_uber;
\q
```

**Redis:**
```bash
# Windows: Descarga desde https://github.com/microsoftarchive/redis/releases
# O usa WSL2 con: sudo apt install redis-server
```

## 🔥 Tercer paso: Configurar Firebase

1. **Crear proyecto**: https://console.firebase.google.com/
2. **Descargar credenciales**:
   - Ve a Configuración del proyecto → Cuentas de servicio
   - Click "Generar nueva clave privada"
   - Guarda el archivo como `firebase-service-account.json` en la raíz de Backend
3. **Habilitar servicios**:
   - Authentication (Email/Password)
   - Cloud Messaging
   - Storage

4. **Actualizar `.env`**:
```env
FIREBASE_PROJECT_ID=tu-proyecto-id
FIREBASE_STORAGE_BUCKET=tu-proyecto-id.appspot.com
```

## 💳 Cuarto paso: Configurar Stripe (Opcional por ahora)

1. Crea cuenta: https://stripe.com/
2. Obtén las claves de prueba: https://dashboard.stripe.com/test/apikeys
3. Actualiza `.env`:
```env
STRIPE_SECRET_KEY=sk_test_tu_clave
```

## ▶️ Quinto paso: Ejecutar el Backend

```bash
# Modo desarrollo (con hot-reload)
npm run start:dev

# Verás algo como:
# Backend running on http://localhost:3000/api
```

## ✅ Verificar que funciona

Abre tu navegador en:
- http://localhost:3000/api

O usa Postman/Thunder Client:
```http
GET http://localhost:3000/api/users
```

## 📊 Ver la Base de Datos

```bash
# Conectar a Postgres
docker exec -it app-uber-postgres-1 psql -U postgres -d app_uber

# Ver tablas creadas automáticamente por TypeORM
\dt

# Salir
\q
```

## 🚨 Solución de Problemas Comunes

### Error: "Cannot find module '@nestjs/config'"
**Solución**: Ejecuta `npm install`

### Error: "ECONNREFUSED 127.0.0.1:5432"
**Solución**: 
1. Verifica que Postgres esté corriendo: `docker ps`
2. O inicia con: `docker compose up -d postgres`

### Error: "Firebase Admin SDK initialization failed"
**Solución**: Asegúrate de tener `firebase-service-account.json` en la raíz

### Error: TypeORM no crea las tablas
**Solución**: El `synchronize: true` solo funciona en `NODE_ENV=development`. Verifica tu `.env`

## 📱 Siguiente: Conectar con el Frontend

Una vez que el backend esté corriendo:

1. Ve a la carpeta Frontend
2. Actualiza `src/api/client.ts`:
```typescript
baseURL: 'http://localhost:3000/api'
```
3. Ejecuta el frontend: `npm run start`

## 🔗 Recursos Útiles

- **API Docs**: http://localhost:3000/api (pronto con Swagger)
- **PostgreSQL GUI**: [pgAdmin](https://www.pgadmin.org/) o [DBeaver](https://dbeaver.io/)
- **Redis GUI**: [RedisInsight](https://redis.com/redis-enterprise/redis-insight/)
- **Firebase Console**: https://console.firebase.google.com/
- **Stripe Dashboard**: https://dashboard.stripe.com/

## 🎓 Próximos Pasos

Una vez que tengas el backend corriendo, trabaja en:

1. **Crear DTOs** para validación de datos
2. **Implementar Guards** para protección de rutas por roles
3. **Refactorizar Services** para usar TypeORM repositories
4. **Agregar tests** unitarios y E2E
5. **Documentar API** con Swagger

---

**¿Necesitas ayuda?** Revisa el `README.md` completo o los logs:
```bash
docker compose logs -f backend
```
