// database-v2/firestore/seed.mjs — documentos mínimos para que la app arranque.
//
//   node seed.mjs                      # proyecto/db de env o defaults
//   GCP_PROJECT_ID=x FIRESTORE_DATABASE_ID=y node seed.mjs
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node seed.mjs   # emulador local
//   FIRESTORE_DATABASE_ID=x — default '(default)'
//
// Auth: Application Default Credentials (gcloud auth application-default login)
// o GOOGLE_APPLICATION_CREDENTIALS=serviceAccount.json
//
// Docs sembrados (idempotente — set con merge; re-correr no duplica):
//   DATA-MAIN_service_areas/ni-managua  — área de servicio activa como POLÍGONO
//     de GeoPoints (platform.go chequea points[] primero; ray-casting).
//     centerLat/centerLng + radiusKm quedan como fallback/metadata.
//   DATA-MAIN_app_config/global         — config mínima del cliente.
//
// El catálogo (DATA-MAIN_services/features/pricing) NO se siembra aquí:
// las seeds SQL emiten eventos outbox 'pending' y el consumer los proyecta
// con la forma exacta. Este script solo cubre lo que ningún pipeline crea.

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, GeoPoint } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'rundi-dev-2';
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';

initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});

// (default) database — v2 usa la database default del proyecto
const db = DATABASE_ID === '(default)' ? getFirestore() : getFirestore(DATABASE_ID);

async function seed() {
  const batch = db.batch();

  // --- Service area activa (Managua) como POLÍGONO de GeoPoints.
  // platform.RegionAvailability chequea points[] primero (ExtractPolygon +
  // PointInPolygon); center/radiusKm quedan como fallback para otros lectores.
  // Polígono ~metropolitano: Ciudad Sandino → aeropuerto → lago → El Crucero.
  batch.set(
    db.collection('DATA-MAIN_service_areas').doc('ni-managua'),
    {
      name: 'Managua',
      active: true,
      points: [
        new GeoPoint(12.185, -86.350), // NW — Ciudad Sandino
        new GeoPoint(12.200, -86.160), // NE — norte / aeropuerto
        new GeoPoint(12.110, -86.135), // E  — este / Lago Xolotlán
        new GeoPoint(12.045, -86.215), // SE — hacia El Crucero
        new GeoPoint(12.070, -86.335), // SW — lado Pacífico
      ],
      centerLat: 12.1149,
      centerLng: -86.2362,
      radiusKm: 15,
      country: 'NI',
      seededAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // --- App config mínima (colección reservada para flags/versioning cliente)
  batch.set(
    db.collection('DATA-MAIN_app_config').doc('global'),
    {
      seeded: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
  console.log(`seed OK → project=${PROJECT_ID} db=${DATABASE_ID}`);
  console.log('  DATA-MAIN_service_areas/ni-managua (active, polígono 5 vértices)');
  console.log('  DATA-MAIN_app_config/global');
}

seed().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
