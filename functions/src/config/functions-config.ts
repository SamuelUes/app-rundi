/**
 * Configuración optimizada para Cloud Functions 2nd Gen
 * Diseñado para soportar 3000 usuarios simultáneos
 */

import { RuntimeOptions } from 'firebase-functions/v1';

// Región por defecto para todas las funciones HTTP/callables
export const DEFAULT_REGION = 'us-central1';

// Type alias para mejor legibilidad
// concurrency es opcional y solo será usado por Cloud Functions 2nd Gen
type FunctionConfig = RuntimeOptions & { concurrency?: number };

/**
 * Configuración para funciones de alta demanda (auth, rides, tracking)
 * - 3000 usuarios simultáneos
 * - ~10 requests/usuario/minuto = 30,000 requests/minuto = 500 requests/segundo
 * - Optimizado para presupuesto de $200/mes
 */
export const highDemandConfig: FunctionConfig = {
  memory: '512MB',
  timeoutSeconds: 60,
  minInstances: 3, // 3 instancias siempre activas (balance costo/performance)
  maxInstances: 100, // Escala hasta 100 instancias en picos
  // Concurrency alto para maximizar conexiones por instancia (HTTP/callables)
  concurrency: 100,
};

/**
 * Configuración para funciones de demanda media (payments, notifications)
 * - Menos frecuentes pero críticas
 */
export const mediumDemandConfig: FunctionConfig = {
  memory: '512MB',
  timeoutSeconds: 120,
  minInstances: 2, // 2 instancias siempre activas
  maxInstances: 50,
  // Concurrency moderado: suficientes conexiones sin saturar CPU/DB
  concurrency: 40,
};

/**
 * Configuración específica para verificación de región (checkRegionAvailability)
 * - Sin minInstances para evitar costo mínimo mensual
 * - Memoria reducida a 256MB
 */
export const regionConfig: FunctionConfig = {
  memory: '256MB',
  timeoutSeconds: 30,
  minInstances: 0,
  maxInstances: 30,
  concurrency: 40,
};

/**
 * Configuración para funciones de baja demanda (admin, reports)
 * - Menos frecuentes, pueden tener cold starts
 */
export const lowDemandConfig: FunctionConfig = {
  memory: '256MB',
  timeoutSeconds: 300,
  minInstances: 0, // Permite cold starts
  maxInstances: 10,
  // Poca concurrencia: funciones poco usadas, priorizamos sencillez
  concurrency: 10,
};

/**
 * Configuración para webhooks (Bancos locales)
 * - Necesitan responder rápido
 */
export const webhookConfig: FunctionConfig = {
  memory: '256MB',
  timeoutSeconds: 60,
  minInstances: 1,
  maxInstances: 20,
  // Webhooks deben responder rápido pero sin bloquear por solicitud
  concurrency: 50,
};

/**
 * Configuración para funciones programadas (cleanup, analytics)
 * - Se ejecutan en background
 */
export const scheduledConfig: FunctionConfig = {
  memory: '1GB',
  timeoutSeconds: 540, // 9 minutos
  minInstances: 0,
  maxInstances: 1,
};

/**
 * Configuración para triggers de base de datos
 * - Responden a eventos de Firestore/Realtime DB
 */
export const triggerConfig: FunctionConfig = {
  memory: '256MB',
  timeoutSeconds: 60,
  minInstances: 1,
  maxInstances: 30,
  // Triggers de DB: concurrencia moderada para no saturar lecturas/escrituras
  concurrency: 20,
};

/**
 * CORS configuration para todas las funciones HTTP
 * En producción, restringe a dominios de la app
 */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

export const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (process.env.FUNCTIONS_EMULATOR) {
      callback(null, true);
      return;
    }
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
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
