/**
 * seed-profile-updates.js
 *
 * Populates the `profile_updates` Firestore collection with realistic
 * mock data so the BQ9 dashboard chart has something to show.
 *
 * Seeds ~50 profile update events across 5 tutors over the last 30 days.
 * Fields match what UpdateUserDto accepts: name, phone, description,
 * courses, profilePictureUrl, isTutor.
 *
 * Usage
 * ─────
 *  node scripts/seed-profile-updates.js           ← seed data
 *  node scripts/seed-profile-updates.js --clean   ← delete seeded docs
 */

require('dotenv').config();
const admin = require('firebase-admin');

// ── Firebase init ────────────────────────────────────────────────────────────

let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? '';
if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
  privateKey = privateKey.slice(1, -1);
}
privateKey = privateKey.replace(/\\n/g, '\n');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

if (emulatorHost) {
  admin.initializeApp({ projectId });
  console.log(`Using Firestore emulator at ${emulatorHost}`);
} else {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  console.log('Using production Firestore');
}

const db = admin.firestore();
const COLLECTION = 'profile_updates';

// ── Mock data ────────────────────────────────────────────────────────────────

const TUTOR_IDS = [
  'tutor-seed-ana',
  'tutor-seed-luis',
  'tutor-seed-maria',
  'tutor-seed-carlos',
  'tutor-seed-sofia',
];

const FIELD_COMBOS = [
  ['description'],
  ['description', 'courses'],
  ['courses'],
  ['name'],
  ['profilePictureUrl'],
  ['phone'],
  ['description', 'profilePictureUrl'],
  ['courses', 'description'],
  ['name', 'phone'],
  ['description'],
  ['courses'],
  ['profilePictureUrl'],
  ['description'],
  ['description', 'courses'],
  ['courses'],
];

function randomDate(daysBack) {
  const now = Date.now();
  const offset = Math.random() * daysBack * 24 * 60 * 60 * 1000;
  return new Date(now - offset);
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  const batch = db.batch();
  const docIds = [];

  for (let i = 0; i < 50; i++) {
    const tutorId = TUTOR_IDS[Math.floor(Math.random() * TUTOR_IDS.length)];
    const fields = FIELD_COMBOS[Math.floor(Math.random() * FIELD_COMBOS.length)];
    const timestamp = randomDate(30);

    const docId = `seed-bq9-${String(i).padStart(3, '0')}`;
    docIds.push(docId);

    batch.set(db.collection(COLLECTION).doc(docId), {
      tutorId,
      fields,
      timestamp: admin.firestore.Timestamp.fromDate(timestamp),
    });
  }

  await batch.commit();
  console.log(`Seeded ${docIds.length} profile_updates documents.`);
}

// ── Clean ────────────────────────────────────────────────────────────────────

async function clean() {
  const snapshot = await db
    .collection(COLLECTION)
    .where(admin.firestore.FieldPath.documentId(), '>=', 'seed-bq9-')
    .where(admin.firestore.FieldPath.documentId(), '<=', 'seed-bq9-')
    .get();

  if (snapshot.empty) {
    console.log('No seeded documents found.');
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`Deleted ${snapshot.size} seeded documents.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const isClean = process.argv.includes('--clean');
(isClean ? clean() : seed())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
