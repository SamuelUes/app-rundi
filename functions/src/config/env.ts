/**
 * Carga de variables de entorno (.env.development / .env.production)
 *
 * Debe importarse ANTES de cualquier módulo que lea process.env a nivel
 * de módulo (los imports se ejecutan en orden). index.ts lo importa primero;
 * módulos con lecturas eager también deben importarlo directamente.
 */
import dotenv from 'dotenv';
import path from 'path';

const nodeEnv = process.env.NODE_ENV === 'production' ? 'production' : 'development';
dotenv.config({ path: path.resolve(__dirname, '..', '..', `.env.${nodeEnv}`) });
