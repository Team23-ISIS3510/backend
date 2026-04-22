/**
 * seed-demo.js
 *
 * Creates (or resets) demo data in Firestore for testing two smart features:
 *   • "Top Rated & Available Soon" carousel (course detail screen)
 *   • "Your Go-To Tutor" card  (course detail screen, personalised)
 *
 * What it seeds
 * ─────────────
 *  • 2 courses         → collection: course
 *  • 3 tutors          → collection: users
 *  • 6 availability blocks (within the next 4 h)
 *                      → collection: availabilities
 *  • 1 upcoming session → collection: tutoring_sessions
 *  • 3 completed sessions (only when --studentId is provided)
 *                      → collection: tutoring_sessions
 *    Ana García × 2 for Cálculo  → she becomes the "go-to tutor"
 *    Luis Mora   × 1 for Cálculo
 *
 * Usage
 * ─────
 *  node scripts/seed-demo.js                          ← base demo data
 *  node scripts/seed-demo.js --studentId=<firebase_uid>  ← + personalised history
 *  node scripts/seed-demo.js --clean                  ← delete seed documents
 *  node scripts/seed-demo.js --clean --studentId=<uid> ← delete everything incl. history
 *
 * All seed documents use predictable IDs → script is fully idempotent.
 */

require('dotenv').config();
const admin = require('firebase-admin');

// ── Firebase init ────────────────────────────────────────────────────────────

let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? '';
if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
  try { privateKey = JSON.parse(privateKey); }
  catch { privateKey = privateKey.slice(1, -1).replace(/\\n/g, '\n'); }
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  }),
});

const db = admin.firestore();

// ── CLI args ─────────────────────────────────────────────────────────────────

const studentIdArg = process.argv
  .find((a) => a.startsWith('--studentId='))
  ?.split('=')[1]
  ?.trim();

// ── Seed IDs (must stay stable so --clean can remove them) ───────────────────

const COURSE_IDS   = ['demo-course-calculo', 'demo-course-prog'];
const TUTOR_IDS    = ['demo-tutor-001', 'demo-tutor-002', 'demo-tutor-003'];
const AVAIL_IDS    = [
  'demo-avail-001a', 'demo-avail-001b',
  'demo-avail-002a', 'demo-avail-002b',
  'demo-avail-003a', 'demo-avail-003b',
];
// Completed session IDs — only written when --studentId is provided
const HISTORY_IDS  = ['demo-hist-001', 'demo-hist-002', 'demo-hist-003'];

// ── Helper ───────────────────────────────────────────────────────────────────

function ts(date) {
  return admin.firestore.Timestamp.fromDate(date);
}

function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

function minsFromNow(m) {
  return new Date(Date.now() + m * 60 * 1000);
}

// ── Data definitions ─────────────────────────────────────────────────────────

function buildCourses() {
  const now = ts(new Date());
  return [
    {
      id: 'demo-course-calculo',
      data: {
        name: 'Cálculo Diferencial',
        code: 'MAT1104',
        credits: 3,
        faculty: 'Ingeniería',
        prerequisites: [],
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-course-prog',
      data: {
        name: 'Programación Orientada a Objetos',
        code: 'ISIS1205',
        credits: 3,
        faculty: 'Ingeniería',
        prerequisites: [],
        createdAt: now,
        updatedAt: now,
      },
    },
  ];
}

function buildTutors() {
  const now = ts(new Date());
  return [
    {
      id: 'demo-tutor-001',
      data: {
        email: 'ana.garcia.demo@uniandes.edu.co',
        name: 'Ana García',
        phone: '+57 300 111 0001',
        isTutor: true,
        rating: 4.9,
        courses: ['demo-course-calculo', 'demo-course-prog'],
        location: 'Virtual',
        bio: 'Ingeniería de Sistemas, 8° semestre. Especialista en cálculo y POO.',
        hourlyRate: 20,
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-tutor-002',
      data: {
        email: 'luis.mora.demo@uniandes.edu.co',
        name: 'Luis Mora',
        phone: '+57 300 111 0002',
        isTutor: true,
        rating: 4.7,
        courses: ['demo-course-calculo'],
        location: 'Bloque ML, Sala 204',
        bio: 'Matemáticas, 6° semestre. Monitor oficial de Cálculo Diferencial.',
        hourlyRate: 18,
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-tutor-003',
      data: {
        email: 'maria.lopez.demo@uniandes.edu.co',
        name: 'María López',
        phone: '+57 300 111 0003',
        isTutor: true,
        rating: 4.8,
        courses: ['demo-course-prog'],
        location: 'Virtual',
        bio: 'Ingeniería de Sistemas, 9° semestre. Experta en Java y Python.',
        hourlyRate: 22,
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-tutor-004',
      data: {
        email: 'carlos.ruiz.demo@uniandes.edu.co',
        name: 'Carlos Ruiz',
        phone: '+57 300 111 0004',
        isTutor: true,
        rating: 4.6,
        courses: ['demo-course-calculo', 'demo-course-prog'],
        location: 'Bloque W, Sala 101',
        bio: 'Ingeniería Civil, 7° semestre. Tutor de cálculo y programación.',
        hourlyRate: 19,
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-tutor-005',
      data: {
        email: 'sofia.castro.demo@uniandes.edu.co',
        name: 'Sofía Castro',
        phone: '+57 300 111 0005',
        isTutor: true,
        rating: 4.9,
        courses: ['demo-course-prog'],
        location: 'Virtual',
        bio: 'Ingeniería de Sistemas, 10° semestre. Experta en patrones de diseño.',
        hourlyRate: 25,
        createdAt: now,
        updatedAt: now,
      },
    },
  ];
}

function buildAvailabilities() {
  const now = ts(new Date());

  return [
    {
      id: 'demo-avail-001a',
      data: {
        tutorId: 'demo-tutor-001',
        course: 'demo-course-calculo',
        title: 'Tutoría Cálculo Diferencial',
        location: 'Virtual',
        startDateTime: ts(minsFromNow(30)),
        endDateTime:   ts(minsFromNow(90)),
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-avail-001b',
      data: {
        tutorId: 'demo-tutor-001',
        course: 'demo-course-prog',
        title: 'Tutoría POO – Java',
        location: 'Virtual',
        startDateTime: ts(hoursFromNow(2)),
        endDateTime:   ts(hoursFromNow(3)),
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-avail-002a',
      data: {
        tutorId: 'demo-tutor-002',
        course: 'demo-course-calculo',
        title: 'Tutoría Límites y Derivadas',
        location: 'Bloque ML, Sala 204',
        startDateTime: ts(minsFromNow(45)),
        endDateTime:   ts(minsFromNow(105)),
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-avail-002b',
      data: {
        tutorId: 'demo-tutor-002',
        course: 'demo-course-calculo',
        title: 'Tutoría Integrales',
        location: 'Bloque ML, Sala 204',
        startDateTime: ts(hoursFromNow(2.5)),
        endDateTime:   ts(hoursFromNow(3.5)),
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-avail-003a',
      data: {
        tutorId: 'demo-tutor-003',
        course: 'demo-course-prog',
        title: 'Tutoría POO – Herencia y Polimorfismo',
        location: 'Virtual',
        startDateTime: ts(hoursFromNow(1)),
        endDateTime:   ts(hoursFromNow(2)),
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-avail-003b',
      data: {
        tutorId: 'demo-tutor-003',
        course: 'demo-course-prog',
        title: 'Tutoría Patrones de Diseño',
        location: 'Virtual',
        startDateTime: ts(hoursFromNow(3)),
        endDateTime:   ts(hoursFromNow(4)),
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-avail-004a',
      data: {
        tutorId: 'demo-tutor-004',
        course: 'demo-course-calculo',
        title: 'Tutoría Cálculo – Presencial',
        location: 'Bloque W, Sala 101',
        startDateTime: ts(minsFromNow(60)),
        endDateTime:   ts(minsFromNow(120)),
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-avail-005a',
      data: {
        tutorId: 'demo-tutor-005',
        course: 'demo-course-prog',
        title: 'Tutoría POO – Patrones de Diseño',
        location: 'Virtual',
        startDateTime: ts(minsFromNow(90)),
        endDateTime:   ts(minsFromNow(150)),
        createdAt: now,
        updatedAt: now,
      },
    },
  ];
}

// ── Session data (one upcoming session so the Sessions section isn't empty) ───

const SESSION_ID = 'demo-session-001';

function buildSession() {
  const now = ts(new Date());
  return {
    id: SESSION_ID,
    data: {
      tutorId:    'demo-tutor-001',
      studentId:  'demo-student-001',
      courseId:   'demo-course-calculo',
      course:     'Cálculo Diferencial',
      tutorName:  'Ana García',
      studentName:'Demo Student',
      scheduledStart: ts(hoursFromNow(1)),
      scheduledEnd:   ts(hoursFromNow(2)),
      status: 'scheduled',
      tutorApprovalStatus: 'approved',
      location: 'Virtual',
      price: 20,
      paymentStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    },
  };
}

// ── Clean ─────────────────────────────────────────────────────────────────────

async function clean() {
  console.log('🧹 Removing seed documents …\n');
  const batch = db.batch();

  for (const id of COURSE_IDS)
    batch.delete(db.collection('course').doc(id));

  for (const id of TUTOR_IDS)
    batch.delete(db.collection('users').doc(id));

  for (const id of AVAIL_IDS)
    batch.delete(db.collection('availabilities').doc(id));

  batch.delete(db.collection('tutoring_sessions').doc(SESSION_ID));

  for (const id of HISTORY_IDS)
    batch.delete(db.collection('tutoring_sessions').doc(id));

  await batch.commit();
  console.log('✅ Seed data deleted.\n');
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Seeding demo data …\n');

  // Courses
  console.log('📚 Writing courses …');
  for (const { id, data } of buildCourses()) {
    await db.collection('course').doc(id).set(data, { merge: true });
    console.log(`   ✓ course/${id}  (${data.name} – ${data.code})`);
  }

  // Tutors
  console.log('\n👤 Writing tutors …');
  for (const { id, data } of buildTutors()) {
    await db.collection('users').doc(id).set(data, { merge: true });
    console.log(`   ✓ users/${id}  (${data.name}, ★ ${data.rating})`);
  }

  // Availabilities
  console.log('\n🕐 Writing availabilities …');
  for (const { id, data } of buildAvailabilities()) {
    await db.collection('availabilities').doc(id).set(data, { merge: true });
    const start = data.startDateTime.toDate();
    const hh = String(start.getHours()).padStart(2, '0');
    const mm = String(start.getMinutes()).padStart(2, '0');
    console.log(`   ✓ availabilities/${id}  (tutor: ${data.tutorId}, starts: ${hh}:${mm})`);
  }

  // Upcoming session
  console.log('\n📅 Writing demo session …');
  const session = buildSession();
  await db.collection('tutoring_sessions').doc(session.id).set(session.data, { merge: true });
  console.log(`   ✓ tutoring_sessions/${session.id}`);

  // Completed sessions (Your Go-To Tutor feature)
  if (studentIdArg) {
    console.log(`\n📖 Writing completed sessions for student ${studentIdArg} …`);
    for (const { id, data } of buildHistory(studentIdArg)) {
      await db.collection('tutoring_sessions').doc(id).set(data, { merge: true });
      console.log(`   ✓ tutoring_sessions/${id}  (${data.tutorName} × ${data.courseId}, completed)`);
    }
  } else {
    console.log('\n💡 Tip: pass --studentId=<your_firebase_uid> to also seed the');
    console.log('   "Your Go-To Tutor" history (completed sessions).');
  }

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('✅  Done! Open the app and you should see:\n');
  console.log('  Courses section');
  console.log('  ├─ Cálculo Diferencial  (MAT1104)');
  console.log('  └─ Programación OO      (ISIS1205)\n');
  console.log('  [Cálculo Diferencial detail screen]');
  console.log('  Top Rated & Available Soon');
  console.log('  ├─ Ana García   ★ 4.9  (in ~30 min)');
  console.log('  └─ Luis Mora   ★ 4.7  (in ~45 min)');
  if (studentIdArg) {
    console.log('  Your Go-To Tutor');
    console.log('  └─ Ana García   ★ 4.9  ·  Booked 2×\n');
  } else {
    console.log('  (Your Go-To Tutor hidden — no history seeded)\n');
  }
  console.log('  Upcoming Sessions');
  console.log('  └─ Session with Ana García (Cálculo Diferencial, in ~1 h)\n');
  console.log('Run  node scripts/seed-demo.js --clean  to remove this data.');
  console.log('─────────────────────────────────────────────────────────────\n');
}

// ── Entry point ───────────────────────────────────────────────────────────────

(async () => {
  try {
    if (process.argv.includes('--clean')) {
      await clean();
    } else {
      await seed();
    }
  } catch (err) {
    console.error('❌ Error:', err.message ?? err);
    process.exit(1);
  } finally {
    await admin.app().delete();
  }
})();
