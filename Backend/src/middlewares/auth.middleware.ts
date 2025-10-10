import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import { initFirebaseAdmin } from '../config/firebase.config';

@Injectable()
export class FirebaseAuthMiddleware implements NestMiddleware {
  constructor() {
    initFirebaseAdmin();
  }

  async use(req: Request & { user?: any }, _res: Response, next: NextFunction) {
    // En desarrollo local sin Firebase, saltar autenticación
    if (getApps().length === 0) {
      console.log('🔓 Auth skipped (Firebase not configured)');
      return next();
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    // Sin token, continuar (rutas públicas)
    if (!token) return next();

    try {
      const decoded = await getAuth().verifyIdToken(token);
      req.user = decoded;
      return next();
    } catch (e) {
      // En desarrollo, advertir pero no bloquear
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️  Invalid Firebase token, but allowing in dev mode');
        return next();
      }
      // En producción, rechazar
      throw new Error('Invalid Firebase token');
    }
  }
}
