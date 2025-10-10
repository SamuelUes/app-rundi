import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private app: admin.app.App;

  async onModuleInit() {
    try {
      // Configurar Firebase Admin
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
        databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
      });

      console.log('🔥 Firebase Admin SDK inicializado correctamente');
    } catch (error) {
      console.error('❌ Error inicializando Firebase:', error);
    }
  }

  /**
   * Obtener instancia de Firestore
   */
  getFirestore(): admin.firestore.Firestore {
    return admin.firestore();
  }

  /**
   * Obtener instancia de Realtime Database
   */
  getDatabase(): admin.database.Database {
    return admin.database();
  }

  /**
   * Obtener instancia de Auth
   */
  getAuth(): admin.auth.Auth {
    return admin.auth();
  }

  /**
   * Verificar token de Firebase
   */
  async verifyToken(token: string): Promise<admin.auth.DecodedIdToken> {
    try {
      return await admin.auth().verifyIdToken(token);
    } catch (error) {
      throw new Error('Token inválido');
    }
  }

  /**
   * Crear usuario en Firebase Auth
   */
  async createUser(email: string, password: string, displayName: string) {
    try {
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName,
        emailVerified: false,
      });

      console.log(`✅ Usuario creado en Firebase: ${userRecord.uid}`);
      return userRecord;
    } catch (error) {
      console.error('❌ Error creando usuario en Firebase:', error);
      throw error;
    }
  }

  /**
   * Obtener usuario de Firebase Auth
   */
  async getUser(uid: string) {
    try {
      return await admin.auth().getUser(uid);
    } catch (error) {
      throw new Error('Usuario no encontrado');
    }
  }

  /**
   * Actualizar usuario en Firebase Auth
   */
  async updateUser(uid: string, data: admin.auth.UpdateRequest) {
    try {
      return await admin.auth().updateUser(uid, data);
    } catch (error) {
      console.error('❌ Error actualizando usuario:', error);
      throw error;
    }
  }

  /**
   * Eliminar usuario de Firebase Auth
   */
  async deleteUser(uid: string) {
    try {
      await admin.auth().deleteUser(uid);
      console.log(`🗑️ Usuario eliminado: ${uid}`);
    } catch (error) {
      console.error('❌ Error eliminando usuario:', error);
      throw error;
    }
  }

  /**
   * Guardar datos de usuario en Firestore
   */
  async saveUserProfile(uid: string, data: any) {
    try {
      await this.getFirestore().collection('users').doc(uid).set({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ Perfil guardado en Firestore: ${uid}`);
    } catch (error) {
      console.error('❌ Error guardando perfil:', error);
      throw error;
    }
  }

  /**
   * Obtener perfil de usuario de Firestore
   */
  async getUserProfile(uid: string) {
    try {
      const doc = await this.getFirestore().collection('users').doc(uid).get();
      
      if (!doc.exists) {
        throw new Error('Perfil no encontrado');
      }

      return doc.data();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Actualizar perfil de usuario en Firestore
   */
  async updateUserProfile(uid: string, data: any) {
    try {
      await this.getFirestore().collection('users').doc(uid).update({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ Perfil actualizado: ${uid}`);
    } catch (error) {
      console.error('❌ Error actualizando perfil:', error);
      throw error;
    }
  }

  /**
   * Guardar ubicación de conductor en Realtime Database
   */
  async updateDriverLocation(driverId: string, lat: number, lng: number) {
    try {
      await this.getDatabase().ref(`drivers/${driverId}/location`).set({
        lat,
        lng,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (error) {
      console.error('❌ Error actualizando ubicación:', error);
      throw error;
    }
  }

  /**
   * Publicar viaje activo en Realtime Database
   */
  async publishActiveRide(rideId: string, rideData: any) {
    try {
      await this.getDatabase().ref(`activeRides/${rideId}`).set({
        ...rideData,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      });

      console.log(`✅ Viaje publicado en Firebase: ${rideId}`);
    } catch (error) {
      console.error('❌ Error publicando viaje:', error);
      throw error;
    }
  }

  /**
   * Eliminar viaje activo de Realtime Database
   */
  async removeActiveRide(rideId: string) {
    try {
      await this.getDatabase().ref(`activeRides/${rideId}`).remove();
      console.log(`🗑️ Viaje eliminado de Firebase: ${rideId}`);
    } catch (error) {
      console.error('❌ Error eliminando viaje:', error);
      throw error;
    }
  }

  /**
   * Enviar notificación push
   */
  async sendNotification(token: string, title: string, body: string, data?: any) {
    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title,
          body,
        },
        data: data || {},
      };

      const response = await admin.messaging().send(message);
      console.log(`✅ Notificación enviada: ${response}`);
      return response;
    } catch (error) {
      console.error('❌ Error enviando notificación:', error);
      throw error;
    }
  }
}
