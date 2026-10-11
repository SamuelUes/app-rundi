/**
 * Utilidades para validación con Zod
 * Helpers para validar datos en Cloud Functions
 */

import { z } from 'zod';
import * as functions from 'firebase-functions/v1';

/**
 * Validar datos con un schema de Zod
 * Lanza HttpsError si la validación falla
 * Ignora campos undefined y campos desconocidos
 */
export function validateData<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> {
  try {
    // Limpiar datos: remover campos undefined
    const cleanData = data && typeof data === 'object' 
      ? Object.fromEntries(
          Object.entries(data).filter(([_, v]) => v !== undefined)
        )
      : data;
    
    // Usar .strict() para rechazar campos desconocidos, pero permitir undefined
    return schema.parse(cleanData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err: any) => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
      
      console.error('❌ Validation error:', JSON.stringify(errors, null, 2));
      console.error('❌ Data received:', JSON.stringify(data, null, 2));
      
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Datos de entrada inválidos',
        { errors }
      );
    }
    throw error;
  }
}

/**
 * Validar datos de forma segura (no lanza error)
 * Retorna { success: true, data } o { success: false, error }
 */
export function safeValidate<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}

/**
 * Validar parcialmente (permite campos opcionales)
 */
export function validatePartial<T extends z.ZodObject<any>>(
  schema: T,
  data: unknown
): Partial<z.infer<T>> {
  try {
    return schema.partial().parse(data) as Partial<z.infer<T>>;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err: any) => ({
        path: err.path.join('.'),
        message: err.message,
      }));
      
      console.error('❌ Partial validation error:', errors);
      
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Datos de entrada inválidos',
        { errors }
      );
    }
    throw error;
  }
}

/**
 * Formatear errores de Zod para respuestas amigables
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((err: any) => `${err.path.join('.')}: ${err.message}`)
    .join(', ');
}

/**
 * Middleware para validar request.data en Cloud Functions
 */
export function withValidation<T extends z.ZodTypeAny>(
  schema: T,
  handler: (data: z.infer<T>, context: functions.https.CallableContext) => Promise<any>
) {
  return async (data: unknown, context: functions.https.CallableContext) => {
    const validatedData = validateData(schema, data);
    return handler(validatedData, context);
  };
}
