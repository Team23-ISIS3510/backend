import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

// Cancelled bookings are dropped because they do not represent realised demand.
const EXCLUDED_STATUSES = new Set(['cancelled', 'declined', 'rejected']);

// Tolerance for attributing a session to a carousel `booking_completed` event
// when only (tutorId, courseId, timestamp) are available on the event.
const CAROUSEL_ATTRIBUTION_WINDOW_MS = 15 * 60 * 1000;

// Tutors with rating strictly above this threshold count as "high-rated"
// (same threshold the carousel/"Available Now" feature already uses).
const HIGH_RATING_THRESHOLD = 4.5;

// A booking counts as "short-notice" when created within this many hours of start.
const SHORT_NOTICE_HOURS = 24;

// Low-support cutoff: features with too few students in either group are flagged
// and excluded from ranking (but still reported for transparency).
const MIN_GROUP_SIZE = 5;

/**
 * BQ — Student-side feature correlation with booking frequency & repeat-session rate.
 *
 * Pipeline stages:
 *   1) Data extraction   — sessions, carousel events, tutor profiles within window
 *   2) Feature engineering — per-student binary feature-usage vector
 *   3) Outcome computation — bookingFrequency (sessions/week) and repeatSessionRate
 *   4) Correlation/uplift scoring — point-biserial correlation + raw & relative uplift
 *   5) Ranking            — ordered by |correlation| against each outcome
 *   6) Response shaping   — dashboard-ready payload w/ trend buckets and metadata
 *
 * All reads filter in-memory to avoid requiring additional Firestore composite indexes,
 * matching the convention already used by `AnalyticsService.fetchSessionsByDateRange`.
 */
@Injectable()
export class AnalyticsFeatureCorrelationService {
  private readonly logger = new Logger(AnalyticsFeatureCorrelationService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  // ────────────────────────────────────────────────────────────────────────────
  // Public entry point
  // ────────────────────────────────────────────────────────────────────────────

  async getStudentFeatureCorrelation(
    windowDays: number = 365,
  ): Promise<FeatureCorrelationReport> {
    const now = new Date();
    const analysisStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    this.logger.log(
      `BQ-FC: computing feature correlation (window=${windowDays}d, from ${analysisStart.toISOString()})`,
    );

    // 1) Data extraction
    const [sessions, carouselBookingEvents] = await Promise.all([
      this.fetchSessionsSince(analysisStart),
      this.fetchCarouselBookingEventsSince(analysisStart),
    ]);

    if (sessions.length === 0) {
      return this.emptyReport(windowDays, analysisStart, now);
    }

    const tutorRatings = await this.fetchTutorRatings(
      Array.from(new Set(sessions.map((s) => s.tutorId).filter(Boolean) as string[])),
    );

    // 2 + 3) Build per-student feature/outcome profiles
    const profiles = this.buildStudentProfiles(sessions, carouselBookingEvents, tutorRatings, {
      windowDays,
    });

    if (profiles.length === 0) {
      return this.emptyReport(windowDays, analysisStart, now);
    }

    // 4) Correlation/uplift scoring per feature
    const featureScores = FEATURE_DEFINITIONS.map((def) =>
      this.scoreFeature(def, profiles),
    );

    // Time-bucketed stability (quarters within window, max 4 buckets)
    const trendByFeature = this.computeTrend(
      sessions,
      carouselBookingEvents,
      tutorRatings,
      analysisStart,
      now,
    );
    for (const score of featureScores) {
      score.trend = trendByFeature.get(score.key) ?? [];
    }

    // 5) Ranking
    const rankedByFreq = [...featureScores]
      .filter((f) => !f.lowSupport)
      .sort((a, b) => Math.abs(b.bookingFrequency.correlation) - Math.abs(a.bookingFrequency.correlation));
    const rankedByRepeat = [...featureScores]
      .filter((f) => !f.lowSupport)
      .sort((a, b) => Math.abs(b.repeatSessionRate.correlation) - Math.abs(a.repeatSessionRate.correlation));

    rankedByFreq.forEach((f, i) => (f.rankByFrequencyCorrelation = i + 1));
    rankedByRepeat.forEach((f, i) => (f.rankByRepeatCorrelation = i + 1));

    // Stable output order: by booking-frequency rank, low-support pinned to the bottom.
    featureScores.sort((a, b) => {
      if (a.lowSupport !== b.lowSupport) return a.lowSupport ? 1 : -1;
      return (a.rankByFrequencyCorrelation ?? 999) - (b.rankByFrequencyCorrelation ?? 999);
    });

    // 6) Response shape
    const cohortFreq = mean(profiles.map((p) => p.bookingFrequency));
    const cohortRepeat = mean(profiles.map((p) => p.repeatSessionRate));

    return {
      meta: {
        analysisWindowDays: windowDays,
        analysisStart: analysisStart.toISOString(),
        analysisEnd: now.toISOString(),
        method:
          'Point-biserial correlation (Pearson between binary feature use and outcome) ' +
          'plus raw uplift (mean_with − mean_without) and relative uplift. ' +
          `Features with fewer than ${MIN_GROUP_SIZE} students in either group are flagged lowSupport and excluded from ranking.`,
        outcomes: {
          bookingFrequency: 'sessions per week per student, over the analysis window',
          repeatSessionRate:
            'share of a student\'s sessions that re-use a (tutor, course) pair already seen before',
        },
        notes: [
          'Excludes sessions with status in [cancelled, declined, rejected].',
          'Carousel attribution joins booking_completed events to sessions on ' +
            '(tutorId, courseId) within ±15 minutes of session createdAt, since ' +
            'carouselEvents does not carry studentId.',
        ],
      },
      cohort: {
        totalStudents: profiles.length,
        totalSessions: profiles.reduce((s, p) => s + p.totalSessions, 0),
        averageBookingFrequency: round(cohortFreq, 4),
        averageRepeatSessionRate: round(cohortRepeat, 4),
      },
      features: featureScores.map(reshapeForResponse),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Stage 1 — Data extraction
  // ────────────────────────────────────────────────────────────────────────────

  private async fetchSessionsSince(since: Date): Promise<SessionRow[]> {
    const db = this.firebaseService.getFirestore();
    const snap = await db.collection('tutoring_sessions').get();

    const rows: SessionRow[] = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (EXCLUDED_STATUSES.has(d.status)) return;
      const createdAt = safeToDate(d.createdAt);
      if (!createdAt || createdAt < since) return;
      if (!d.studentId) return;

      rows.push({
        id: doc.id,
        studentId: String(d.studentId),
        tutorId: d.tutorId ? String(d.tutorId) : null,
        courseId: d.courseId ? String(d.courseId) : d.course ? String(d.course) : null,
        status: String(d.status ?? ''),
        tutorApprovalStatus: d.tutorApprovalStatus ? String(d.tutorApprovalStatus) : null,
        createdAt,
        scheduledStart:
          safeToDate(d.scheduledStart) ??
          safeToDate(d.startDateTime) ??
          safeToDate(d.scheduledDateTime),
      });
    });

    this.logger.log(`BQ-FC: extracted ${rows.length} in-window sessions`);
    return rows;
  }

  private async fetchCarouselBookingEventsSince(since: Date): Promise<CarouselBookingEvent[]> {
    const db = this.firebaseService.getFirestore();
    const snap = await db.collection('carouselEvents').get();

    const out: CarouselBookingEvent[] = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (d.event !== 'booking_completed') return;
      const ts = safeToDate(d.timestamp);
      if (!ts || ts < since) return;
      if (!d.tutorId || !d.courseId) return;

      out.push({
        tutorId: String(d.tutorId),
        courseId: String(d.courseId),
        timestampMs: ts.getTime(),
      });
    });

    this.logger.log(`BQ-FC: extracted ${out.length} carousel booking_completed events`);
    return out;
  }

  /**
   * Reads tutor docs in batches of 30 (Firestore `in`-query ceiling is 30)
   * and returns a tutorId→rating map. Missing rating → null.
   */
  private async fetchTutorRatings(tutorIds: string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    if (tutorIds.length === 0) return out;

    const db = this.firebaseService.getFirestore();
    const chunkSize = 30;
    for (let i = 0; i < tutorIds.length; i += chunkSize) {
      const chunk = tutorIds.slice(i, i + chunkSize);
      const snap = await db
        .collection('users')
        .where('__name__', 'in', chunk)
        .get();
      snap.forEach((doc) => {
        const rating = doc.data().rating;
        out.set(doc.id, typeof rating === 'number' ? rating : null);
      });
      // Tutors with no user doc at all get null so feature checks don't crash.
      for (const id of chunk) if (!out.has(id)) out.set(id, null);
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Stage 2+3 — Feature engineering + outcome computation
  // ────────────────────────────────────────────────────────────────────────────

  private buildStudentProfiles(
    sessions: SessionRow[],
    carouselEvents: CarouselBookingEvent[],
    tutorRatings: Map<string, number | null>,
    opts: { windowDays: number },
  ): StudentProfile[] {
    // Index carousel events by (tutorId|courseId) for O(1) attribution lookup.
    const eventsByKey = new Map<string, number[]>();
    for (const e of carouselEvents) {
      const k = `${e.tutorId}|${e.courseId}`;
      if (!eventsByKey.has(k)) eventsByKey.set(k, []);
      eventsByKey.get(k)!.push(e.timestampMs);
    }

    // Group sessions by student.
    const byStudent = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      if (!byStudent.has(s.studentId)) byStudent.set(s.studentId, []);
      byStudent.get(s.studentId)!.push(s);
    }

    const weeksInWindow = opts.windowDays / 7;

    const profiles: StudentProfile[] = [];
    for (const [studentId, studentSessions] of byStudent.entries()) {
      const total = studentSessions.length;

      // Distinct (tutor,course) pairs → basis for repeat-session rate.
      const tutorCoursePairs = new Set<string>();
      const tutorCourseCounts = new Map<string, number>();
      for (const s of studentSessions) {
        if (!s.tutorId || !s.courseId) continue;
        const pair = `${s.tutorId}|${s.courseId}`;
        tutorCoursePairs.add(pair);
        tutorCourseCounts.set(pair, (tutorCourseCounts.get(pair) ?? 0) + 1);
      }

      // repeatSessionRate = share of sessions that re-use a (tutor,course) already seen.
      // If N sessions and K distinct pairs, repeats = N - K (bounded at 0).
      const repeats =
        total > 0 && tutorCoursePairs.size > 0 ? Math.max(0, total - tutorCoursePairs.size) : 0;
      const repeatSessionRate = total > 0 ? repeats / total : 0;

      // bookingFrequency = sessions per week across the fixed analysis window
      // (fixed window keeps the metric comparable across students).
      const bookingFrequency = weeksInWindow > 0 ? total / weeksInWindow : 0;

      // ── Feature flags ──────────────────────────────────────────────────────
      const features: Record<FeatureKey, boolean> = {
        used_carousel_booking: studentSessions.some((s) =>
          hasCarouselAttribution(s, eventsByKey),
        ),
        used_returning_tutor: Array.from(tutorCourseCounts.values()).some((c) => c >= 2),
        used_instant_booking: studentSessions.some(
          (s) => s.tutorApprovalStatus === 'approved' && s.status === 'scheduled',
        ),
        used_high_rated_tutor: studentSessions.some((s) => {
          const r = s.tutorId ? tutorRatings.get(s.tutorId) ?? null : null;
          return r !== null && r > HIGH_RATING_THRESHOLD;
        }),
        used_multiple_courses:
          new Set(studentSessions.map((s) => s.courseId).filter(Boolean)).size >= 2,
        used_short_notice_booking: studentSessions.some((s) => {
          if (!s.scheduledStart) return false;
          const hoursAhead =
            (s.scheduledStart.getTime() - s.createdAt.getTime()) / (60 * 60 * 1000);
          return hoursAhead >= 0 && hoursAhead <= SHORT_NOTICE_HOURS;
        }),
      };

      profiles.push({
        studentId,
        totalSessions: total,
        bookingFrequency,
        repeatSessionRate,
        features,
      });
    }

    this.logger.log(`BQ-FC: built ${profiles.length} student profiles`);
    return profiles;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Stage 4 — Correlation / uplift scoring
  // ────────────────────────────────────────────────────────────────────────────

  private scoreFeature(def: FeatureDefinition, profiles: StudentProfile[]): FeatureScore {
    const withFeature = profiles.filter((p) => p.features[def.key]);
    const without = profiles.filter((p) => !p.features[def.key]);

    const freq = this.computeMetric(
      withFeature.map((p) => p.bookingFrequency),
      without.map((p) => p.bookingFrequency),
      profiles.map((p) => p.bookingFrequency),
      profiles.map((p) => (p.features[def.key] ? 1 : 0)),
    );
    const repeat = this.computeMetric(
      withFeature.map((p) => p.repeatSessionRate),
      without.map((p) => p.repeatSessionRate),
      profiles.map((p) => p.repeatSessionRate),
      profiles.map((p) => (p.features[def.key] ? 1 : 0)),
    );

    const lowSupport =
      withFeature.length < MIN_GROUP_SIZE || without.length < MIN_GROUP_SIZE;

    return {
      key: def.key,
      label: def.label,
      description: def.description,
      adoption: {
        withFeature: withFeature.length,
        withoutFeature: without.length,
        adoptionRate:
          profiles.length > 0 ? round(withFeature.length / profiles.length, 4) : 0,
      },
      bookingFrequency: freq,
      repeatSessionRate: repeat,
      lowSupport,
      trend: [],
      rankByFrequencyCorrelation: null,
      rankByRepeatCorrelation: null,
    };
  }

  private computeMetric(
    withValues: number[],
    withoutValues: number[],
    allOutcome: number[],
    allFeatureBinary: number[],
  ): MetricScore {
    const meanWith = withValues.length > 0 ? mean(withValues) : 0;
    const meanWithout = withoutValues.length > 0 ? mean(withoutValues) : 0;
    const uplift = meanWith - meanWithout;
    const relativeUplift = meanWithout > 0 ? uplift / meanWithout : null;
    const correlation = pearson(allFeatureBinary, allOutcome);
    return {
      meanWith: round(meanWith, 4),
      meanWithout: round(meanWithout, 4),
      uplift: round(uplift, 4),
      relativeUplift: relativeUplift !== null ? round(relativeUplift, 4) : null,
      correlation: round(correlation, 4),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Stage — Time-bucketed stability ("over time")
  // ────────────────────────────────────────────────────────────────────────────

  private computeTrend(
    sessions: SessionRow[],
    carouselEvents: CarouselBookingEvent[],
    tutorRatings: Map<string, number | null>,
    analysisStart: Date,
    analysisEnd: Date,
  ): Map<FeatureKey, TrendPoint[]> {
    const trend = new Map<FeatureKey, TrendPoint[]>();
    for (const def of FEATURE_DEFINITIONS) trend.set(def.key, []);

    const bucketCount = 4;
    const totalMs = analysisEnd.getTime() - analysisStart.getTime();
    if (totalMs <= 0) return trend;

    const bucketMs = Math.floor(totalMs / bucketCount);
    const bucketDays = bucketMs / (24 * 60 * 60 * 1000);

    for (let i = 0; i < bucketCount; i++) {
      const start = new Date(analysisStart.getTime() + i * bucketMs);
      const end =
        i === bucketCount - 1
          ? analysisEnd
          : new Date(analysisStart.getTime() + (i + 1) * bucketMs);

      const bucketSessions = sessions.filter(
        (s) => s.createdAt >= start && s.createdAt < end,
      );
      const bucketEvents = carouselEvents.filter(
        (e) => e.timestampMs >= start.getTime() && e.timestampMs < end.getTime(),
      );

      const profiles = this.buildStudentProfiles(bucketSessions, bucketEvents, tutorRatings, {
        windowDays: bucketDays,
      });
      if (profiles.length === 0) {
        for (const def of FEATURE_DEFINITIONS) {
          trend.get(def.key)!.push({
            bucketStart: start.toISOString(),
            bucketEnd: end.toISOString(),
            upliftFrequency: 0,
            upliftRepeat: 0,
            sampleSize: 0,
          });
        }
        continue;
      }

      for (const def of FEATURE_DEFINITIONS) {
        const withVals = profiles.filter((p) => p.features[def.key]);
        const withoutVals = profiles.filter((p) => !p.features[def.key]);
        const upliftFreq =
          mean0(withVals.map((p) => p.bookingFrequency)) -
          mean0(withoutVals.map((p) => p.bookingFrequency));
        const upliftRep =
          mean0(withVals.map((p) => p.repeatSessionRate)) -
          mean0(withoutVals.map((p) => p.repeatSessionRate));

        trend.get(def.key)!.push({
          bucketStart: start.toISOString(),
          bucketEnd: end.toISOString(),
          upliftFrequency: round(upliftFreq, 4),
          upliftRepeat: round(upliftRep, 4),
          sampleSize: profiles.length,
        });
      }
    }

    return trend;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────────

  private emptyReport(
    windowDays: number,
    analysisStart: Date,
    analysisEnd: Date,
  ): FeatureCorrelationReport {
    return {
      meta: {
        analysisWindowDays: windowDays,
        analysisStart: analysisStart.toISOString(),
        analysisEnd: analysisEnd.toISOString(),
        method: 'No data in analysis window — returning empty report.',
        outcomes: {
          bookingFrequency: 'sessions per week per student, over the analysis window',
          repeatSessionRate:
            'share of a student\'s sessions that re-use a (tutor, course) pair already seen before',
        },
        notes: [],
      },
      cohort: {
        totalStudents: 0,
        totalSessions: 0,
        averageBookingFrequency: 0,
        averageRepeatSessionRate: 0,
      },
      features: [],
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export type FeatureKey =
  | 'used_carousel_booking'
  | 'used_returning_tutor'
  | 'used_instant_booking'
  | 'used_high_rated_tutor'
  | 'used_multiple_courses'
  | 'used_short_notice_booking';

interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  description: string;
}

const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: 'used_carousel_booking',
    label: 'Carousel-driven booking',
    description:
      'Student made at least one booking attributable to the "Available Now" tutor carousel ' +
      '(matched via a carouselEvents booking_completed event within ±15 minutes).',
  },
  {
    key: 'used_returning_tutor',
    label: 'Returning-tutor rebooking',
    description:
      'Student rebooked the same tutor for the same course at least twice ' +
      '(proxies usage of the "Your Go-To Tutor" surface and loyalty behaviour).',
  },
  {
    key: 'used_instant_booking',
    label: 'Instant booking (auto-approved)',
    description:
      'Student has at least one session that was auto-approved and scheduled without manual tutor confirmation ' +
      '(tutorApprovalStatus=approved AND status=scheduled).',
  },
  {
    key: 'used_high_rated_tutor',
    label: 'Booked a high-rated tutor (>4.5★)',
    description:
      'Student booked at least one session with a tutor whose profile rating is above 4.5, ' +
      'the same threshold powering the "Available Now" carousel.',
  },
  {
    key: 'used_multiple_courses',
    label: 'Multi-course usage',
    description: 'Student booked sessions across two or more distinct courses.',
  },
  {
    key: 'used_short_notice_booking',
    label: 'Short-notice booking (<24h ahead)',
    description:
      'Student made at least one booking whose scheduled start was within 24h of creation — ' +
      'proxies urgency / on-demand flow use.',
  },
];

interface SessionRow {
  id: string;
  studentId: string;
  tutorId: string | null;
  courseId: string | null;
  status: string;
  tutorApprovalStatus: string | null;
  createdAt: Date;
  scheduledStart: Date | null;
}

interface CarouselBookingEvent {
  tutorId: string;
  courseId: string;
  timestampMs: number;
}

interface StudentProfile {
  studentId: string;
  totalSessions: number;
  bookingFrequency: number;
  repeatSessionRate: number;
  features: Record<FeatureKey, boolean>;
}

export interface MetricScore {
  meanWith: number;
  meanWithout: number;
  uplift: number;
  relativeUplift: number | null;
  correlation: number;
}

interface FeatureScore {
  key: FeatureKey;
  label: string;
  description: string;
  adoption: { withFeature: number; withoutFeature: number; adoptionRate: number };
  bookingFrequency: MetricScore;
  repeatSessionRate: MetricScore;
  lowSupport: boolean;
  trend: TrendPoint[];
  rankByFrequencyCorrelation: number | null;
  rankByRepeatCorrelation: number | null;
}

export interface TrendPoint {
  bucketStart: string;
  bucketEnd: string;
  upliftFrequency: number;
  upliftRepeat: number;
  sampleSize: number;
}

export interface FeatureCorrelationResult {
  key: FeatureKey;
  label: string;
  description: string;
  adoption: { withFeature: number; withoutFeature: number; adoptionRate: number };
  bookingFrequency: MetricScore;
  repeatSessionRate: MetricScore;
  rankByFrequencyCorrelation: number | null;
  rankByRepeatCorrelation: number | null;
  lowSupport: boolean;
  trend: TrendPoint[];
}

export interface FeatureCorrelationReport {
  meta: {
    analysisWindowDays: number;
    analysisStart: string;
    analysisEnd: string;
    method: string;
    outcomes: { bookingFrequency: string; repeatSessionRate: string };
    notes: string[];
  };
  cohort: {
    totalStudents: number;
    totalSessions: number;
    averageBookingFrequency: number;
    averageRepeatSessionRate: number;
  };
  features: FeatureCorrelationResult[];
}

// ════════════════════════════════════════════════════════════════════════════
// Small local utilities (kept local to avoid leaking a one-off helper module)
// ════════════════════════════════════════════════════════════════════════════

function reshapeForResponse(f: FeatureScore) {
  return {
    key: f.key,
    label: f.label,
    description: f.description,
    adoption: f.adoption,
    bookingFrequency: f.bookingFrequency,
    repeatSessionRate: f.repeatSessionRate,
    rankByFrequencyCorrelation: f.rankByFrequencyCorrelation,
    rankByRepeatCorrelation: f.rankByRepeatCorrelation,
    lowSupport: f.lowSupport,
    trend: f.trend,
  };
}

function hasCarouselAttribution(
  session: SessionRow,
  eventsByKey: Map<string, number[]>,
): boolean {
  if (!session.tutorId || !session.courseId) return false;
  const stamps = eventsByKey.get(`${session.tutorId}|${session.courseId}`);
  if (!stamps || stamps.length === 0) return false;
  const sessionMs = session.createdAt.getTime();
  return stamps.some((ts) => Math.abs(ts - sessionMs) <= CAROUSEL_ATTRIBUTION_WINDOW_MS);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// mean-or-0: avoid pulling NaN into uplift arithmetic when a group is empty
function mean0(values: number[]): number {
  return values.length === 0 ? 0 : mean(values);
}

/**
 * Pearson correlation. When feature is 0/1 this equals the point-biserial
 * correlation. Returns 0 if either series has zero variance (degenerate case).
 */
function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0 || n !== y.length) return 0;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (!isFinite(denom) || denom === 0) return 0;
  return num / denom;
}

function round(v: number, digits: number): number {
  if (!isFinite(v)) return 0;
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

function safeToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value !== null && typeof (value as any).toDate === 'function') {
    try {
      const d = (value as any).toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
