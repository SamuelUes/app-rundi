/**
 * Configuración optimizada para Cloud Functions 2nd Gen
 * Diseñado para soportar 3000 usuarios simultáneos
 */

import { GlobalOptions } from 'firebase-functions/v2/options';

// Type alias para mejor legibilidad
type FunctionConfig = GlobalOptions;

/**
 * Configuración para funciones de alta demanda (auth, rides, tracking)
 * - 3000 usuarios simultáneos
 * - ~10 requests/usuario/minuto = 30,000 requests/minuto = 500 requests/segundo
 * - Optimizado para presupuesto de $200/mes
 */
export const highDemandConfig: FunctionConfig = {
  region: 'us-central1',
  memory: '512MiB',
  timeoutSeconds: 60,
  minInstances: 3, // 3 instancias siempre activas (balance costo/performance)
  maxInstances: 100, // Escala hasta 100 instancias en picos
  concurrency: 100, // 100 requests simultáneos por instancia
  cpu: 1,
};

/**
 * Configuración para funciones de demanda media (payments, notifications)
 * - Menos frecuentes pero críticas
 */
export const mediumDemandConfig: FunctionConfig = {
  region: 'us-central1',
  memory: '512MiB',
  timeoutSeconds: 120,
  minInstances: 2, // 2 instancias siempre activas
  maxInstances: 50,
  concurrency: 80,
  cpu: 1,
};

/**
 * Configuración para funciones de baja demanda (admin, reports)
 * - Menos frecuentes, pueden tener cold starts
 */
export const lowDemandConfig: FunctionConfig = {
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 300,
  minInstances: 0, // Permite cold starts
  maxInstances: 10,
  concurrency: 50,
  cpu: 1,
};

/**
 * Configuración para webhooks (Stripe)
 * - Necesitan responder rápido
 */
export const webhookConfig: FunctionConfig = {
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 60,
  minInstances: 1,
  maxInstances: 20,
  concurrency: 100,
  cpu: 1,
};

/**
 * Configuración para funciones programadas (cleanup, analytics)
 * - Se ejecutan en background
 */
export const scheduledConfig: FunctionConfig = {
  region: 'us-central1',
  memory: '1GiB',
  timeoutSeconds: 540, // 9 minutos
  minInstances: 0,
  maxInstances: 1,
  concurrency: 1,
  cpu: 1,
};

/**
 * Configuración para triggers de base de datos
 * - Responden a eventos de Firestore/Realtime DB
 */
export const triggerConfig: FunctionConfig = {
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 60,
  minInstances: 1,
  maxInstances: 30,
  concurrency: 50,
  cpu: 1,
};

/**
 * CORS configuration para todas las funciones HTTP
 */
export const corsConfig = {
  origin: true, // Permite todos los orígenes (ajustar en producción)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

/**
 * Configuración de rate limiting (requests por minuto)
 */
export const rateLimits = {
  auth: 10, // 10 login/register por minuto por IP
  rides: 100, // 100 requests de viajes por minuto por usuario
  tracking: 300, // 300 updates de ubicación por minuto por conductor
  payments: 20, // 20 requests de pago por minuto por usuario
  general: 60, // 60 requests generales por minuto por usuario
};

/**
 * Estimación de capacidad y costos:
 * 
 * CAPACIDAD:
 * - High Demand: 3 min instances × 100 concurrency = 300 requests simultáneos base
 * - Escala hasta: 100 instances × 100 concurrency = 10,000 requests simultáneos
 * 
 * Para 3000 usuarios simultáneos (16 horas/día):
 * - Si cada usuario hace 1 request cada 5 segundos = 600 requests/segundo
 * - Capacidad actual: 10,000 requests simultáneos >> 600 requests/segundo ✅
 * 
 * COSTOS ESTIMADOS (Presupuesto: $200/mes):
 * 
 * Cloud Functions 2nd Gen:
 * - 3 min instances × 16 horas × 30 días = 1,440 instance-hours/mes
 * - Costo min instances: ~$35-45/mes
 * - Invocaciones adicionales (30M/mes): ~$25-35/mes
 * - Subtotal: ~$60-80/mes
 * 
 * Firebase:
 * - Firestore (10GB + 50M reads): ~$25-35/mes
 * - Realtime DB (1GB + bandwidth): ~$20-30/mes
 * - Auth: $0 (gratis)
 * - Performance Monitoring: $0 (gratis)
 * - Subtotal: ~$45-65/mes
 * 
 * Supabase PostgreSQL (Pro):
 * - Plan Pro: $25/mes
 * - 8GB DB, 50GB bandwidth, 500K API requests/día
 * - Subtotal: $25/mes
 * 
 * Redis Cache (Upstash):
 * - Pay-as-you-go: ~50M comandos/mes
 * - Subtotal: ~$10-15/mes
 * 
 * Otros:
 * - Google Cloud Monitoring: ~$5-10/mes
 * - API Gateway: ~$10-15/mes
 * - Sentry: $0 (free tier)
 * - Cloud Storage: ~$5-10/mes
 * - Subtotal: ~$20-35/mes
 * 
 * TOTAL ESTIMADO: $160-195/mes
 * MARGEN DE SEGURIDAD: $5-40/mes
 * 
 * ✅ Dentro del presupuesto de $200/mes
 */
