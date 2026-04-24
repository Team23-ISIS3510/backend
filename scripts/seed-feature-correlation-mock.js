/**
 * seed-feature-correlation-mock.js
 *
 * Seeds Firestore with deterministic mock data to exercise
 * AnalyticsFeatureCorrelationService.getStudentFeatureCorrelation (BQ-FC pipeline):
 *   • tutoring_sessions   — students mock_fc_stu_*, sessions mock_fc_sess_*
 *   • users               — tutors mock_fc_tutor_* with rating (for high-rated feature)
 *   • student_booking_context — carousel + instant-at-create for half the cohort
 *   • carouselEvents      — one legacy booking_completed aligned in time (optional path)
 *
 * All document IDs use the prefix "mock_fc_" so --clean can remove them without touching
 * real user/tutor/session data.
 *
 * Usage (from backend/, with .env FIREBASE_* set like other scripts)
 * ─────
 *   npm run seed:fc-mock
 *   npm run seed:fc-mock:clean
 */

require('dotenv').config();
const admin = require('firebase-admin');

const ID_PREFIX = 'mock_fc_';

// ── Firebase init ─────────────────────────────────────────────────────────────

if (!admin.apps.length) {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    try {
      privateKey = JSON.parse(privateKey);
    } catch {
      privateKey = privateKey.slice(1, -1).replace(/\\n/g, '\n');
    }
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

function ts(date) {
  return admin.firestore.Timestamp.fromDate(date);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAfter(base, h) {
  return new Date(base.getTime() + h * 60 * 60 * 1000);
}

/** Delete every doc whose id starts with mock_fc_ */
async function cleanCollection(name) {
  const snap = await db.collection(name).get();
  const targets = snap.docs.filter((d) => d.id.startsWith(ID_PREFIX));
  if (targets.length === 0) {
    console.log(`  (none) ${name}`);
    return 0;
  }
  for (let i = 0; i < targets.length; i += 450) {
    const batch = db.batch();
    targets.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`  🗑  ${name}: ${targets.length}`);
  return targets.length;
}

async function clean() {
  console.log('Cleaning mock_fc_* documents…');
  let total = 0;
  total += await cleanCollection('student_booking_context');
  total += await cleanCollection('tutoring_sessions');
  total += await cleanCollection('carouselEvents');
  total += await cleanCollection('users');
  console.log(`Done. Removed ${total} documents (ids prefixed ${ID_PREFIX}).`);
}

async function seed() {
  await clean();

  const tutors = [
    { id: `${ID_PREFIX}tutor_high`, rating: 4.95, displayName: 'FC Mock High' },
    { id: `${ID_PREFIX}tutor_mid`, rating: 4.62, displayName: 'FC Mock Mid' },
    { id: `${ID_PREFIX}tutor_low`, rating: 4.05, displayName: 'FC Mock Low' },
  ];

  const courses = [`${ID_PREFIX}c_math`, `${ID_PREFIX}c_physics`];

  const batch = db.batch();

  for (const t of tutors) {
    batch.set(db.collection('users').doc(t.id), {
      email: `${t.id}@mock-fc.invalid`,
      displayName: t.displayName,
      rating: t.rating,
      mockFcPipeline: true,
      updatedAt: ts(new Date()),
    });
  }

  /**
   * 12 students → groups >= 5 for lowSupport filters.
   * Students 00–05: richer behaviour (carousel context, repeats, multi-course, short-notice, high-rated).
   * Students 06–11: sparser sessions, requestedAt set (no instant fallback), no booking context.
   */
  const HIGH_GROUP = 6;
  const STUDENT_COUNT = 12;

  for (let s = 0; s < STUDENT_COUNT; s++) {
    const studentId = `${ID_PREFIX}stu_${String(s).padStart(2, '0')}`;
    const isHigh = s < HIGH_GROUP;

    if (isHigh) {
      // 5 sessions / student, all within ~last 25 days (works with windowDays=30)
      const baseDay = 14 + s * 2;
      for (let e = 0; e < 5; e++) {
        const created = daysAgo(baseDay - e * 3);
        const tutorId = e < 3 ? tutors[0].id : e === 3 ? tutors[0].id : tutors[1].id;
        const courseId = e <= 2 ? courses[0] : e === 3 ? courses[1] : courses[0];
        const sid = `${ID_PREFIX}sess_stu${String(s).padStart(2, '0')}_${e}`;
        const scheduledStart = e === 0 ? hoursAfter(created, 6) : hoursAfter(created, 48);
        const scheduledEnd = hoursAfter(scheduledStart, 1);

        batch.set(db.collection('tutoring_sessions').doc(sid), {
          studentId,
          tutorId,
          courseId,
          course: e <= 2 ? 'Mock Math' : 'Mock Physics',
          status: 'scheduled',
          tutorApprovalStatus: 'approved',
          paymentStatus: 'pending',
          location: 'mock',
          createdAt: ts(created),
          scheduledStart: ts(scheduledStart),
          scheduledEnd: ts(scheduledEnd),
          mockFcPipeline: true,
        });

        if (e === 0) {
          batch.set(db.collection('student_booking_context').doc(`${ID_PREFIX}ctx_stu${String(s).padStart(2, '0')}_0`), {
            studentId,
            sessionId: sid,
            bookedAt: ts(created),
            bookingSource: 'carousel',
            instantAtCreate: true,
            mockFcPipeline: true,
          });

          // Legacy carousel path: booking_completed within ±15 min of session createdAt
          batch.set(db.collection('carouselEvents').doc(`${ID_PREFIX}car_stu${String(s).padStart(2, '0')}_0`), {
            event: 'booking_completed',
            courseId,
            tutorId,
            timestamp: ts(new Date(created.getTime() + 5 * 60 * 1000)),
            mockFcPipeline: true,
          });
        }
      }
    } else {
      // 2 sessions, approval-style (requestedAt) → not instant via session fallback
      for (let e = 0; e < 2; e++) {
        const created = daysAgo(10 + (s - HIGH_GROUP) + e * 2);
        const tutorId = tutors[2].id;
        const courseId = courses[e % 2];
        const sid = `${ID_PREFIX}sess_stu${String(s).padStart(2, '0')}_${e}`;
        const scheduledStart = hoursAfter(created, 72);
        const scheduledEnd = hoursAfter(scheduledStart, 1);

        batch.set(db.collection('tutoring_sessions').doc(sid), {
          studentId,
          tutorId,
          courseId,
          course: 'Mock Course',
          status: 'scheduled',
          tutorApprovalStatus: 'approved',
          paymentStatus: 'pending',
          location: 'mock',
          requestedAt: ts(created),
          acceptedAt: ts(hoursAfter(created, 1)),
          createdAt: ts(created),
          scheduledStart: ts(scheduledStart),
          scheduledEnd: ts(scheduledEnd),
          mockFcPipeline: true,
        });
      }
    }
  }

  await batch.commit();

  const sessionTotal = HIGH_GROUP * 5 + (STUDENT_COUNT - HIGH_GROUP) * 2;

  console.log('✅  Seeded feature-correlation mock data:');
  console.log(`    • ${tutors.length} tutors (${ID_PREFIX}tutor_*)`);
  console.log(`    • ${STUDENT_COUNT} students (${ID_PREFIX}stu_*)`);
  console.log(`    • ${sessionTotal} tutoring_sessions (${ID_PREFIX}sess_*)`);
  console.log(`    • ${HIGH_GROUP} student_booking_context rows (${ID_PREFIX}ctx_*)`);
  console.log(`    • ${HIGH_GROUP} carouselEvents (${ID_PREFIX}car_*)`);
  console.log('');
  console.log('Call GET /analytics/feature-correlation?windowDays=90 or reload /analytics/dashboard.');
}

const isClean = process.argv.includes('--clean');
(isClean ? clean() : seed()).catch((err) => {
  console.error('❌  Script failed:', err.message);
  process.exit(1);
});
