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
 *  • 1 student profile → collection: users
 *  • 6 availability blocks (within the next 4 h)
 *                      → collection: availabilities
 *  • 2 upcoming sessions → collection: tutoring_sessions
 *  • 3 completed sessions (only when --studentId is provided)
 *                      → collection: tutoring_sessions
 *    Ana García × 2 for Cálculo  → she becomes the "go-to tutor"
 *    Luis Mora   × 1 for Cálculo
 *  • 6 carousel events (last 2 days)
 *                      → collection: carouselEvents
 *
 * Usage
 * ─────
 *  node scripts/seed-demo.js                          ← base demo data
 *  node scripts/seed-demo.js --studentId=<firebase_uid>  ← seed for your real user
 *  node scripts/seed-demo.js --studentId=<uid> --studentEmail=<email> --studentName="Tu Nombre"
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

const studentEmailArg = process.argv
  .find((a) => a.startsWith('--studentEmail='))
  ?.split('=')[1]
  ?.trim();

const studentNameArg = process.argv
  .find((a) => a.startsWith('--studentName='))
  ?.split('=')[1]
  ?.trim();

// ── Seed IDs (must stay stable so --clean can remove them) ───────────────────

const COURSE_IDS   = ['demo-course-calculo', 'demo-course-prog'];
const TUTOR_IDS    = ['demo-tutor-001', 'demo-tutor-002', 'demo-tutor-003'];
const DEMO_STUDENT_ID = 'demo-student-001';
const AVAIL_IDS    = [
  'demo-avail-001a', 'demo-avail-001b',
  'demo-avail-002a', 'demo-avail-002b',
  'demo-avail-003a', 'demo-avail-003b',
];
// Completed session IDs — only written when --studentId is provided
const HISTORY_IDS  = ['demo-hist-001', 'demo-hist-002', 'demo-hist-003'];
const UPCOMING_SESSION_IDS = ['demo-session-001', 'demo-session-002'];
const CAROUSEL_EVENT_IDS = [
  'demo-carousel-001',
  'demo-carousel-002',
  'demo-carousel-003',
  'demo-carousel-004',
  'demo-carousel-005',
  'demo-carousel-006',
];

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

function resolveStudentContext() {
  const id = studentIdArg || DEMO_STUDENT_ID;
  const name = studentNameArg || (studentIdArg ? 'Student Seeded User' : 'Demo Student');
  const email =
    studentEmailArg ||
    (studentIdArg ? `student+${studentIdArg.slice(0, 8)}@demo.calico.app` : 'demo.student@uniandes.edu.co');

  return { id, name, email };
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

function buildStudent(student) {
  const now = ts(new Date());
  return {
    id: student.id,
    data: {
      email: student.email,
      name: student.name,
      phone: '+57 300 111 9999',
      isTutor: false,
      description: 'Perfil de estudiante para pruebas integrales del frontend.',
      createdAt: now,
      updatedAt: now,
    },
  };
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

function buildUpcomingSessions(student) {
  const now = ts(new Date());
  return [
    {
      id: 'demo-session-001',
      data: {
        tutorId: 'demo-tutor-001',
        studentId: student.id,
        studentEmail: student.email,
        courseId: 'demo-course-calculo',
        course: 'Cálculo Diferencial',
        tutorName: 'Ana García',
        tutorEmail: 'ana.garcia.demo@uniandes.edu.co',
        studentName: student.name,
        scheduledStart: ts(hoursFromNow(1)),
        scheduledEnd: ts(hoursFromNow(2)),
        status: 'scheduled',
        tutorApprovalStatus: 'approved',
        location: 'Virtual',
        price: 20,
        paymentStatus: 'pending',
        requiresApproval: false,
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-session-002',
      data: {
        tutorId: 'demo-tutor-003',
        studentId: student.id,
        studentEmail: student.email,
        courseId: 'demo-course-prog',
        course: 'Programación Orientada a Objetos',
        tutorName: 'María López',
        tutorEmail: 'maria.lopez.demo@uniandes.edu.co',
        studentName: student.name,
        scheduledStart: ts(hoursFromNow(3)),
        scheduledEnd: ts(hoursFromNow(4)),
        status: 'scheduled',
        tutorApprovalStatus: 'approved',
        location: 'Virtual',
        price: 22,
        paymentStatus: 'pending',
        requiresApproval: false,
        createdAt: now,
        updatedAt: now,
      },
    },
  ];
}

function buildHistory(studentId) {
  const now = ts(new Date());
  const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

  return [
    {
      id: 'demo-hist-001',
      data: {
        tutorId: 'demo-tutor-001',
        studentId,
        courseId: 'demo-course-calculo',
        course: 'Cálculo Diferencial',
        tutorName: 'Ana García',
        tutorEmail: 'ana.garcia.demo@uniandes.edu.co',
        scheduledStart: ts(daysAgo(5)),
        scheduledEnd:   ts(new Date(daysAgo(5).getTime() + 60 * 60 * 1000)),
        status: 'completed',
        tutorApprovalStatus: 'approved',
        location: 'Virtual',
        price: 20,
        paymentStatus: 'paid',
        requiresApproval: false,
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-hist-002',
      data: {
        tutorId: 'demo-tutor-001',
        studentId,
        courseId: 'demo-course-calculo',
        course: 'Cálculo Diferencial',
        tutorName: 'Ana García',
        tutorEmail: 'ana.garcia.demo@uniandes.edu.co',
        scheduledStart: ts(daysAgo(3)),
        scheduledEnd:   ts(new Date(daysAgo(3).getTime() + 60 * 60 * 1000)),
        status: 'completed',
        tutorApprovalStatus: 'approved',
        location: 'Virtual',
        price: 20,
        paymentStatus: 'paid',
        requiresApproval: false,
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'demo-hist-003',
      data: {
        tutorId: 'demo-tutor-002',
        studentId,
        courseId: 'demo-course-calculo',
        course: 'Cálculo Diferencial',
        tutorName: 'Luis Mora',
        tutorEmail: 'luis.mora.demo@uniandes.edu.co',
        scheduledStart: ts(daysAgo(7)),
        scheduledEnd:   ts(new Date(daysAgo(7).getTime() + 60 * 60 * 1000)),
        status: 'completed',
        tutorApprovalStatus: 'approved',
        location: 'Bloque ML, Sala 204',
        price: 18,
        paymentStatus: 'paid',
        requiresApproval: false,
        createdAt: now,
        updatedAt: now,
      },
    },
  ];
}

function buildCarouselEvents() {
  const now = new Date();
  const minutesAgo = (m) => new Date(now.getTime() - m * 60 * 1000);

  return [
    {
      id: 'demo-carousel-001',
      data: {
        event: 'results_shown',
        courseId: 'demo-course-calculo',
        tutorId: null,
        tutorRating: null,
        resultCount: 2,
        countdownMinutes: null,
        timestamp: ts(minutesAgo(120)),
      },
    },
    {
      id: 'demo-carousel-002',
      data: {
        event: 'tutor_clicked',
        courseId: 'demo-course-calculo',
        tutorId: 'demo-tutor-001',
        tutorRating: 4.9,
        resultCount: null,
        countdownMinutes: 25,
        timestamp: ts(minutesAgo(118)),
      },
    },
    {
      id: 'demo-carousel-003',
      data: {
        event: 'booking_completed',
        courseId: 'demo-course-calculo',
        tutorId: 'demo-tutor-001',
        tutorRating: 4.9,
        resultCount: null,
        countdownMinutes: null,
        timestamp: ts(minutesAgo(116)),
      },
    },
    {
      id: 'demo-carousel-004',
      data: {
        event: 'results_shown',
        courseId: 'demo-course-prog',
        tutorId: null,
        tutorRating: null,
        resultCount: 1,
        countdownMinutes: null,
        timestamp: ts(minutesAgo(60)),
      },
    },
    {
      id: 'demo-carousel-005',
      data: {
        event: 'tutor_clicked',
        courseId: 'demo-course-prog',
        tutorId: 'demo-tutor-003',
        tutorRating: 4.8,
        resultCount: null,
        countdownMinutes: 55,
        timestamp: ts(minutesAgo(57)),
      },
    },
    {
      id: 'demo-carousel-006',
      data: {
        event: 'results_shown',
        courseId: 'demo-course-calculo',
        tutorId: null,
        tutorRating: null,
        resultCount: 0,
        countdownMinutes: null,
        timestamp: ts(minutesAgo(15)),
      },
    },
  ];
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

  for (const id of UPCOMING_SESSION_IDS)
    batch.delete(db.collection('tutoring_sessions').doc(id));

  for (const id of HISTORY_IDS)
    batch.delete(db.collection('tutoring_sessions').doc(id));

  for (const id of CAROUSEL_EVENT_IDS)
    batch.delete(db.collection('carouselEvents').doc(id));

  // Only remove the default demo student. Never delete a real user UID provided by --studentId.
  batch.delete(db.collection('users').doc(DEMO_STUDENT_ID));

  await batch.commit();
  console.log('✅ Seed data deleted.\n');
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  const student = resolveStudentContext();
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

  // Student profile for Profile screen + student-centric endpoints
  console.log('\n🎓 Writing student profile …');
  const seededStudent = buildStudent(student);
  await db.collection('users').doc(seededStudent.id).set(seededStudent.data, {
    merge: true,
  });
  console.log(`   ✓ users/${seededStudent.id}  (${seededStudent.data.name})`);

  // Availabilities
  console.log('\n🕐 Writing availabilities …');
  for (const { id, data } of buildAvailabilities()) {
    await db.collection('availabilities').doc(id).set(data, { merge: true });
    const start = data.startDateTime.toDate();
    const hh = String(start.getHours()).padStart(2, '0');
    const mm = String(start.getMinutes()).padStart(2, '0');
    console.log(`   ✓ availabilities/${id}  (tutor: ${data.tutorId}, starts: ${hh}:${mm})`);
  }

  // Upcoming sessions
  console.log('\n📅 Writing upcoming sessions …');
  for (const session of buildUpcomingSessions(student)) {
    await db
      .collection('tutoring_sessions')
      .doc(session.id)
      .set(session.data, { merge: true });
    console.log(
      `   ✓ tutoring_sessions/${session.id}  (${session.data.tutorName} -> ${session.data.studentName})`,
    );
  }

  // Completed sessions (Your Go-To Tutor feature)
  console.log(`\n📖 Writing completed sessions for student ${student.id} …`);
  for (const { id, data } of buildHistory(student.id)) {
      await db.collection('tutoring_sessions').doc(id).set({
        ...data,
        studentName: student.name,
        studentEmail: student.email,
      }, { merge: true });
      console.log(`   ✓ tutoring_sessions/${id}  (${data.tutorName} × ${data.courseId}, completed)`);
  }

  // Analytics events for carousel dashboard + conversion rates
  console.log('\n📊 Writing carousel analytics events …');
  for (const event of buildCarouselEvents()) {
    await db.collection('carouselEvents').doc(event.id).set(event.data, { merge: true });
    console.log(`   ✓ carouselEvents/${event.id}  (${event.data.event})`);
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
  console.log('  Your Go-To Tutor');
  console.log('  └─ Ana García   ★ 4.9  ·  Booked 2×\n');
  console.log('  Upcoming Sessions');
  console.log('  ├─ Session with Ana García (Cálculo Diferencial, in ~1 h)');
  console.log('  └─ Session with María López (POO, in ~3 h)\n');
  console.log(`  Student used for seed: ${student.id} (${student.email})\n`);
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
