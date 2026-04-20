/**
 * seed-carousel-events.js
 *
 * Seeds realistic BQ2 carousel interaction events into the `carouselEvents`
 * Firestore collection so the dashboard has meaningful data to display.
 *
 * What it generates (last 7 days)
 * ────────────────────────────────
 *  • results_shown   – one per "session" (always)
 *  • tutor_clicked   – ~60% of impressions (realistic CTR)
 *  • booking_completed – ~40% of clicks (realistic conversion)
 *
 * Usage
 * ─────
 *  node scripts/seed-carousel-events.js           ← seed 7 days of events
 *  node scripts/seed-carousel-events.js --clean   ← delete all seeded events
 */

require('dotenv').config();
const admin = require('firebase-admin');

// ── Firebase init ─────────────────────────────────────────────────────────────

if (!admin.apps.length) {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    try { privateKey = JSON.parse(privateKey); }
    catch { privateKey = privateKey.slice(1, -1).replace(/\\n/g, '\n'); }
  } else {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const db = admin.firestore();
const COLLECTION = 'carouselEvents';
const SEED_TAG = '__bq2_seed__';

// ── Config — adjust these to match IDs that exist in your DB ─────────────────

const COURSES = ['ISIS3710', 'ISIS2603'];

const TUTORS = [
  { id: 'tutor-ana-001',  name: 'Ana García', rating: 4.9 },
  { id: 'tutor-luis-002', name: 'Luis Mora',  rating: 4.7 },
  { id: 'tutor-sara-003', name: 'Sara López', rating: 4.8 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Timestamp somewhere within a given calendar day (past 7 days) */
function timestampOnDay(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(randomInt(8, 22), randomInt(0, 59), randomInt(0, 59), 0);
  return d;
}

/** Countdown in minutes — weighted toward <60 min (urgency drives clicks) */
function randomCountdown() {
  const buckets = [
    { weight: 3, fn: () => randomInt(5, 29) },    // <30 min
    { weight: 3, fn: () => randomInt(30, 59) },   // 30-60 min
    { weight: 2, fn: () => randomInt(60, 119) },  // 1-2 h
    { weight: 1, fn: () => randomInt(120, 239) }, // 2-4 h
  ];
  const total = buckets.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;
  for (const b of buckets) {
    r -= b.weight;
    if (r <= 0) return b.fn();
  }
  return randomInt(5, 29);
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  const batch_size = 400; // Firestore batch limit is 500
  let ops = [];
  let totalWritten = 0;

  async function flush() {
    if (ops.length === 0) return;
    const batch = db.batch();
    for (const { ref, data } of ops) batch.set(ref, data);
    await batch.commit();
    totalWritten += ops.length;
    ops = [];
  }

  async function addDoc(data) {
    ops.push({ ref: db.collection(COLLECTION).doc(), data: { ...data, _seed: SEED_TAG } });
    if (ops.length >= batch_size) await flush();
  }

  // Generate events for each of the last 7 days
  for (let day = 6; day >= 0; day--) {
    // 3-8 impressions per day
    const impressions = randomInt(3, 8);

    for (let i = 0; i < impressions; i++) {
      const courseId = randomChoice(COURSES);
      const resultCount = randomInt(1, 3);
      const ts = timestampOnDay(day);

      // Always: results_shown
      await addDoc({
        event: 'results_shown',
        courseId,
        tutorId: null,
        tutorRating: null,
        resultCount,
        countdownMinutes: null,
        timestamp: ts,
      });

      // ~60% CTR → tutor_clicked
      if (Math.random() < 0.60) {
        const tutor = randomChoice(TUTORS);
        const clickTs = new Date(ts.getTime() + randomInt(5, 60) * 1000);
        const countdown = randomCountdown();

        await addDoc({
          event: 'tutor_clicked',
          courseId,
          tutorId: tutor.id,
          tutorRating: tutor.rating,
          resultCount: null,
          countdownMinutes: countdown,
          timestamp: clickTs,
        });

        // ~40% of clicks → booking_completed
        if (Math.random() < 0.40) {
          const bookTs = new Date(clickTs.getTime() + randomInt(10, 120) * 1000);
          await addDoc({
            event: 'booking_completed',
            courseId,
            tutorId: tutor.id,
            tutorRating: tutor.rating,
            resultCount: null,
            countdownMinutes: null,
            timestamp: bookTs,
          });
        }
      }
    }
  }

  await flush();
  console.log(`✅  Seeded ${totalWritten} carousel events into '${COLLECTION}'`);
}

// ── Clean ─────────────────────────────────────────────────────────────────────

async function clean() {
  const snap = await db.collection(COLLECTION).where('_seed', '==', SEED_TAG).get();
  if (snap.empty) {
    console.log('Nothing to delete — no seeded events found.');
    return;
  }

  let deleted = 0;
  const chunks = [];
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) chunks.push(docs.slice(i, i + 400));

  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += chunk.length;
  }

  console.log(`🗑️  Deleted ${deleted} seeded carousel events.`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const isClean = process.argv.includes('--clean');
(isClean ? clean() : seed()).catch((err) => {
  console.error('❌  Script failed:', err.message);
  process.exit(1);
});
