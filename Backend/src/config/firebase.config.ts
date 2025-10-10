import { initializeApp, getApps, cert } from 'firebase-admin/app';
import * as fs from 'fs';
import * as path from 'path';

export function initFirebaseAdmin() {
  // En desarrollo local, Firebase es opcional
  if (getApps().length > 0) return;

  try {
    const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
    
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
      console.log('✅ Firebase Admin SDK initialized');
    } else {
      console.warn('⚠️  Firebase credentials not found - Running without Firebase (some features disabled)');
      console.warn('   To enable Firebase: Download firebase-service-account.json from Firebase Console');
    }
  } catch (error) {
    console.warn('⚠️  Firebase initialization skipped:', error instanceof Error ? error.message : String(error));
  }
}
