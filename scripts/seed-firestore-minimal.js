/**
 * seed-firestore-minimal.js
 *
 * Seed minimal (but functional) Firestore data for all collections used by backend.
 * Includes documented collections + backend-only collections.
 *
 * Usage:
 *   node scripts/seed-firestore-minimal.js
 *   node scripts/seed-firestore-minimal.js --clean
 */

require('dotenv').config();
const admin = require('firebase-admin');

function resolvePrivateKey() {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    try {
      privateKey = JSON.parse(privateKey);
    } catch {
      privateKey = privateKey.slice(1, -1).replace(/\\n/g, '\n');
    }
  }
  return privateKey;
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: resolvePrivateKey(),
  }),
});

const db = admin.firestore();
const now = () => admin.firestore.Timestamp.now();
const tsFromDate = (date) => admin.firestore.Timestamp.fromDate(date);
const plusMinutes = (m) => new Date(Date.now() + m * 60 * 1000);
const plusDays = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);
const minusMinutes = (m) => new Date(Date.now() - m * 60 * 1000);

const IDS = {
  major: ['seed-major-sistemas', 'seed-major-matematicas'],
  course: ['seed-course-calculo', 'seed-course-poo'],
  users: ['seed-tutor-001', 'seed-student-001'],
  legacyUser: ['seed-student-legacy-001'],
  availabilities: ['seed-avail-001'],
  tutoringSessions: ['seed-session-001'],
  slotBookings: ['seed-slot-001'],
  notifications: ['seed-notif-001'],
  payments: ['seed-payment-001'],
  carouselEvents: ['seed-carousel-001'],
  bugReports: ['seed-bug-001'],
  tutorApplications: ['seed-app-001'],
  occupancy: ['seed-occupancy-001'],
  studentBookingContext: ['seed-sbc-001'],
};

async function seed() {
  console.log('Seeding minimal Firestore dataset...');
  const batch = db.batch();
  const createdAt = now();

  // major
  batch.set(db.collection('major').doc(IDS.major[0]), {
    name: 'Ingenieria de Sistemas',
    faculty: 'Ingenieria',
    description: 'Carrera enfocada en software',
    duration: 10,
    type: 'Pregrado',
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });
  batch.set(db.collection('major').doc(IDS.major[1]), {
    name: 'Matematicas',
    faculty: 'Ciencias',
    description: 'Carrera de ciencias basicas',
    duration: 8,
    type: 'Pregrado',
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });

  // course
  batch.set(db.collection('course').doc(IDS.course[0]), {
    name: 'Calculo Diferencial',
    code: 'MATE1105',
    faculty: 'Ciencias',
    credits: 3,
    prerequisites: [],
    difficulty: 'Intermedio',
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });
  batch.set(db.collection('course').doc(IDS.course[1]), {
    name: 'Programacion Orientada a Objetos',
    code: 'ISIS1204',
    faculty: 'Ingenieria',
    credits: 3,
    prerequisites: [],
    difficulty: 'Intermedio',
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });

  // users (backend real collection)
  batch.set(db.collection('users').doc(IDS.users[0]), {
    email: 'seed.tutor@uniandes.edu.co',
    name: 'Tutor Seed',
    phone: '+57 3000000001',
    isTutor: true,
    courses: [IDS.course[0], IDS.course[1]],
    rating: 4.8,
    description: 'Tutor de prueba para ambiente local',
    bio: 'Tutor con datos minimos',
    hourlyRate: 25000,
    majorId: IDS.major[0],
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });
  batch.set(db.collection('users').doc(IDS.users[1]), {
    email: 'seed.student@uniandes.edu.co',
    name: 'Student Seed',
    phone: '+57 3000000002',
    isTutor: false,
    courses: [],
    description: 'Estudiante de prueba',
    majorId: IDS.major[0],
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });

  // user (legacy/documented collection name)
  batch.set(db.collection('user').doc(IDS.legacyUser[0]), {
    name: 'Legacy User Seed',
    mail: 'legacy.seed@uniandes.edu.co',
    phone_number: '+57 3000000003',
    major: `major/${IDS.major[0]}`,
    isTutor: false,
    semester: 4,
    enrolledCourses: ['MATE1105'],
    created_at: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  // availabilities
  batch.set(db.collection('availabilities').doc(IDS.availabilities[0]), {
    tutorId: IDS.users[0],
    tutorEmail: 'seed.tutor@uniandes.edu.co',
    title: 'Disponibilidad Seed',
    location: 'Virtual',
    course: IDS.course[0],
    startDateTime: tsFromDate(plusMinutes(30)),
    endDateTime: tsFromDate(plusMinutes(90)),
    googleEventId: IDS.availabilities[0],
    htmlLink: 'https://calendar.google.com/',
    recurring: false,
    recurrenceRule: null,
    sourceCalendarId: 'seed-calendar@group.calendar.google.com',
    sourceCalendarName: 'Disponibilidad Seed',
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });

  // tutoring_sessions
  batch.set(db.collection('tutoring_sessions').doc(IDS.tutoringSessions[0]), {
    tutorId: IDS.users[0],
    tutorEmail: 'seed.tutor@uniandes.edu.co',
    tutorName: 'Tutor Seed',
    studentId: IDS.users[1],
    studentEmail: 'seed.student@uniandes.edu.co',
    studentName: 'Student Seed',
    courseId: IDS.course[0],
    course: 'Calculo Diferencial',
    subject: IDS.course[0],
    status: 'scheduled',
    tutorApprovalStatus: 'approved',
    location: 'Virtual',
    scheduledStart: tsFromDate(plusMinutes(30)),
    scheduledEnd: tsFromDate(plusMinutes(90)),
    requestedAt: tsFromDate(minusMinutes(30)),
    paymentStatus: 'pending',
    price: 25000,
    parentAvailabilityId: IDS.availabilities[0],
    slotIndex: 0,
    slotId: 'seed-slot-id-001',
    bookingSource: 'seed-script',
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });

  // slot_bookings
  batch.set(db.collection('slot_bookings').doc(IDS.slotBookings[0]), {
    parentAvailabilityId: IDS.availabilities[0],
    slotIndex: 0,
    slotId: 'seed-slot-id-001',
    tutorEmail: 'seed.tutor@uniandes.edu.co',
    studentEmail: 'seed.student@uniandes.edu.co',
    sessionId: IDS.tutoringSessions[0],
    slotStartTime: tsFromDate(plusMinutes(30)),
    slotEndTime: tsFromDate(plusMinutes(90)),
    course: IDS.course[0],
    bookedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });

  // notifications
  batch.set(db.collection('notifications').doc(IDS.notifications[0]), {
    recipientId: IDS.users[0],
    type: 'pending_session_request',
    title: 'Sesion de prueba',
    message: 'Tienes una sesion agendada de prueba',
    courseId: IDS.course[0],
    isRead: false,
    relatedEntityId: IDS.tutoringSessions[0],
    relatedEntityType: 'tutoring_session',
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });

  // payments
  batch.set(db.collection('payments').doc(IDS.payments[0]), {
    sessionId: IDS.tutoringSessions[0],
    tutorId: IDS.users[0],
    studentId: IDS.users[1],
    amount: 25000,
    currency: 'COP',
    method: 'card',
    status: 'pending',
    transactionId: 'seed-txn-001',
    provider: 'wompi',
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });

  // backend-only: carouselEvents
  batch.set(db.collection('carouselEvents').doc(IDS.carouselEvents[0]), {
    event: 'results_shown',
    courseId: IDS.course[0],
    tutorId: IDS.users[0],
    tutorRating: 4.8,
    resultCount: 1,
    countdownMinutes: 30,
    timestamp: createdAt,
  }, { merge: true });

  // backend-only: bugReports
  batch.set(db.collection('bugReports').doc(IDS.bugReports[0]), {
    title: 'Bug de prueba seed',
    description: 'Documento semilla para validar coleccion bugReports',
    severity: 'low',
    status: 'open',
    userId: IDS.users[1],
    userEmail: 'seed.student@uniandes.edu.co',
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });

  // backend-only: tutorApplications
  batch.set(db.collection('tutorApplications').doc(IDS.tutorApplications[0]), {
    tutorId: IDS.users[0],
    tutorEmail: 'seed.tutor@uniandes.edu.co',
    tutorName: 'Tutor Seed',
    courseId: IDS.course[0],
    courseName: 'Calculo Diferencial',
    courseCode: 'MATE1105',
    status: 'pending',
    notes: 'Solicitud de ejemplo',
    appliedAt: tsFromDate(minusMinutes(10)),
  }, { merge: true });

  // backend-only: occupancy
  batch.set(db.collection('occupancy').doc(IDS.occupancy[0]), {
    tutorId: IDS.users[0],
    subjectId: IDS.course[0],
    occupancyRate: 0.5,
    totalHoursAvailable: 2,
    totalHoursBooked: 1,
    lastCalculatedAt: createdAt,
    windowStart: tsFromDate(plusDays(-7)),
    windowEnd: createdAt,
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });

  // backend-only: student_booking_context
  batch.set(db.collection('student_booking_context').doc(IDS.studentBookingContext[0]), {
    studentId: IDS.users[1],
    sessionId: IDS.tutoringSessions[0],
    bookedAt: createdAt,
    bookingSource: 'seed-script',
    instantAtCreate: true,
  }, { merge: true });

  await batch.commit();
  console.log('Done. Minimal dataset created for all detected collections.');
}

async function clean() {
  console.log('Cleaning seeded documents...');
  const deletions = [
    ['major', IDS.major],
    ['course', IDS.course],
    ['users', IDS.users],
    ['user', IDS.legacyUser],
    ['availabilities', IDS.availabilities],
    ['tutoring_sessions', IDS.tutoringSessions],
    ['slot_bookings', IDS.slotBookings],
    ['notifications', IDS.notifications],
    ['payments', IDS.payments],
    ['carouselEvents', IDS.carouselEvents],
    ['bugReports', IDS.bugReports],
    ['tutorApplications', IDS.tutorApplications],
    ['occupancy', IDS.occupancy],
    ['student_booking_context', IDS.studentBookingContext],
  ];

  const batch = db.batch();
  for (const [collectionName, ids] of deletions) {
    for (const id of ids) {
      batch.delete(db.collection(collectionName).doc(id));
    }
  }
  await batch.commit();
  console.log('Done. Seeded documents removed.');
}

(async () => {
  try {
    if (process.argv.includes('--clean')) {
      await clean();
    } else {
      await seed();
    }
  } catch (error) {
    console.error('Seed error:', error.message || error);
    process.exitCode = 1;
  } finally {
    await admin.app().delete();
  }
})();
