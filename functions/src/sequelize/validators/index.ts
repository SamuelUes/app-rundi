/**
 * Validators Index - Exporta todos los validadores Zod
 */

export * from './driver.validator';
export * from './ride.validator';
export * from './payment.validator';
export * from './rating.validator';

import { ZodSchema } from 'zod';

/**
 * Función helper para validar datos con Zod
 */
export function validateData<T>(schema: ZodSchema, data: unknown): T {
  try {
    return schema.parse(data) as T;
  } catch (error: any) {
    throw new Error(`Validación fallida: ${error.message}`);
  }
}
