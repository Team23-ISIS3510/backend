import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

@Injectable()
export class CalicoCalendarService implements OnModuleInit {
  private readonly logger = new Logger(CalicoCalendarService.name);
  private auth: any = null;
  private calendarId: string | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeAuth();
  }

  /**
   * Initialize authentication with Service Account
   */
  async initializeAuth() {
    try {
      if (this.auth) {
        return this.auth;
      }

      const serviceAccountKey = this.configService.get('GOOGLE_SERVICE_ACCOUNT_KEY');
      if (!serviceAccountKey) {
        this.logger.warn('GOOGLE_SERVICE_ACCOUNT_KEY not set - Calico Calendar features will be disabled');
        return null;
      }

      // Get central calendar ID
      this.calendarId = this.configService.get('CALICO_CALENDAR_ID') ?? null;
      if (!this.calendarId) {
        this.logger.warn('CALICO_CALENDAR_ID not set - Calico Calendar features will be disabled');
        return null;
      }

      // Parse credentials JSON
      let credentials;
      try {
        credentials = typeof serviceAccountKey === 'string' ? JSON.parse(serviceAccountKey) : serviceAccountKey;
      } catch (parseError) {
        this.logger.error(`Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY: ${parseError.message}`);
        throw new Error(`Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY: ${parseError.message}`);
      }

      // Configure Google Auth with Service Account
      this.auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
        ],
      });

      this.logger.log(' Google Calendar Service Account initialized successfully');
      return this.auth;
    } catch (error) {
      this.logger.error(' Error initializing Google Calendar Service Account:', error);
      throw new Error(`Failed to initialize Google Calendar Service Account: ${error.message}`);
    }
  }

  /**
   * Get authenticated Google Calendar client
   */
  async getCalendarClient() {
    try {
      if (!this.auth) {
        await this.initializeAuth();
      }

      if (!this.auth) {
        throw new Error('Service Account not configured');
      }

      const calendar = google.calendar({ version: 'v3', auth: this.auth });
      return calendar;
    } catch (error) {
      this.logger.error('Error getting calendar client:', error);
      throw error;
    }
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return !!(this.auth && this.calendarId);
  }

  /**
   * Create a tutoring session event in Calico's central calendar
   */
  async createTutoringSessionEvent(sessionData: {
    summary: string;
    description?: string;
    startDateTime: Date | string;
    endDateTime: Date | string;
    attendees?: Array<string | { email: string; displayName?: string; responseStatus?: string }>;
    location?: string;
    tutorEmail: string;
    tutorId: string;
    tutorName?: string;
  }) {
    try {
      this.logger.log(' Creating tutoring session event in Calico calendar...');

      const {
        summary,
        description,
        startDateTime,
        endDateTime,
        attendees = [],
        location = 'Virtual/Presencial',
        tutorEmail,
        tutorName,
        tutorId,
      } = sessionData;

      if (!summary || !startDateTime || !endDateTime) {
        throw new Error('summary, startDateTime, and endDateTime are required');
      }

      if (!tutorEmail) {
        throw new Error('tutorEmail is required');
      }

      if (!this.isConfigured()) {
        this.logger.warn(' Google Calendar Service not configured. Skipping calendar creation.');
        return {
          success: true,
          warning: 'Google Calendar not configured — event not created in external calendar',
          eventId: null,
          htmlLink: null,
          meetLink: null,
          event: null,
          attendees: attendees,
        };
      }

      // Normalize attendees list
      let normalizedAttendees: Array<{ email: string; displayName?: string; responseStatus?: string }> = [];
      if (Array.isArray(attendees)) {
        normalizedAttendees = attendees
          .map((a) => {
            if (typeof a === 'string') return { email: a };
            if (a && typeof a === 'object' && a.email) return a;
            return null;
          })
          .filter((a): a is { email: string; displayName?: string; responseStatus?: string } => a !== null);
      } else if (attendees) {
        if (typeof attendees === 'string') {
          normalizedAttendees = [{ email: attendees }];
        } else if (typeof attendees === 'object' && (attendees as any).email) {
          normalizedAttendees = [attendees as { email: string; displayName?: string; responseStatus?: string }];
        }
      }

      // Ensure tutor is in attendees list
      const hasTutor = normalizedAttendees.some(
        (a) => (a.email || a) == tutorEmail || a.email == tutorEmail,
      );
      if (!hasTutor) {
        normalizedAttendees.push({
          email: tutorEmail,
          displayName: tutorName || tutorEmail,
          responseStatus: 'accepted',
        });
      }

      // Dedupe attendees by email
      const attendeesByEmail: Record<string, any> = {};
      normalizedAttendees.forEach((a) => {
        const email = a && a.email ? a.email : typeof a === 'string' ? a : null;
        if (!email) return;

        const existing = attendeesByEmail[email];
        if (!existing) {
          attendeesByEmail[email] = { ...a, email };
          return;
        }

        if (a.displayName && a.displayName !== existing.displayName) {
          attendeesByEmail[email].displayName = a.displayName;
        }

        const statusOrder: Record<string, number> = { accepted: 2, needsAction: 1, tentative: 1, declined: 0 };
        const existingScore = statusOrder[existing.responseStatus] || 0;
        const newScore = statusOrder[a.responseStatus ?? ''] || 0;
        if (newScore > existingScore) {
          attendeesByEmail[email].responseStatus = a.responseStatus;
        }
      });

      normalizedAttendees = Object.values(attendeesByEmail);

      this.logger.log(` Normalized (deduped) attendees: ${normalizedAttendees.length}`);

      // Configure dates with Colombia timezone
      const timeZone = 'America/Bogota';

      // Ensure dates are in ISO format
      const start = startDateTime instanceof Date ? startDateTime.toISOString() : startDateTime;
      const end = endDateTime instanceof Date ? endDateTime.toISOString() : endDateTime;

      const studentInfo = normalizedAttendees.find((a) => (a.email || a) !== tutorEmail);
      const studentName = studentInfo?.displayName || studentInfo?.email || studentInfo || 'Estudiante';

      // Configure event WITHOUT attendees to avoid permission issues
      const event = {
        summary: summary,
        description:
          description ||
          `Sesión de tutoría agendada a través de Calico.\n\nTutor: ${tutorName || tutorEmail}\nEstudiante: ${studentName}\n\nNOTA: Este evento se creó en el calendario central de Calico. Los participantes serán notificados por separado.`,
        start: {
          dateTime: start,
          timeZone: timeZone,
        },
        end: {
          dateTime: end,
          timeZone: timeZone,
        },
        location: location,
        // NO incluir attendees para evitar problemas de permisos con Service Account
        // attendees: [...], // Comentado para evitar Domain-Wide Delegation requirement

        //  Add Google Meet automatically
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },


        status: 'confirmed',
        visibility: 'default',
        guestsCanInviteOthers: false,
        guestsCanModify: false,
        guestsCanSeeOtherGuests: false,

        // Reminders only for central calendar
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 30 }], // 30 minutes before
        },
      };

      this.logger.log(' Creating tutoring session event in Calico calendar...');

      // Get calendar client
      const calendar = await this.getCalendarClient();

      let response;
      let meetLink: string | null = null;

      try {
        // Try to create event WITH Google Meet
        this.logger.log(' Attempting to create event with Google Meet...');
        response = await calendar.events.insert({
          calendarId: this.calendarId!,
          requestBody: event,
          conferenceDataVersion: 1, // Required for Google Meet
          sendUpdates: 'none', // Don't send invitations to avoid permission issues
        });

        // Extract Google Meet link if created
        meetLink =
          response.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
          response.data.hangoutLink ||
          null;

        if (meetLink) {
          this.logger.log(' Google Meet link created');
        } else {
          this.logger.warn(' Event created but no Meet link generated');
        }
      } catch (meetError: any) {
        this.logger.warn(` Failed to create event with Meet, trying without conference data: ${meetError.message}`);

        // If fails with Meet, create without conferenceData
        const eventWithoutMeet = { ...event };
        delete (eventWithoutMeet as any).conferenceData;

        response = await calendar.events.insert({
          calendarId: this.calendarId!,
          requestBody: eventWithoutMeet,
          sendUpdates: 'none',
        });

        this.logger.log(' Event created without Meet link');
      }

      this.logger.log(` Tutoring session event created successfully: ${response.data.id}`);

      return {
        success: true,
        eventId: response.data.id,
        tutorId: tutorId,
        htmlLink: response.data.htmlLink,
        hangoutLink: response.data.hangoutLink,
        meetLink: meetLink,
        event: response.data,
      };
    } catch (error: any) {
      this.logger.error(' Error creating tutoring session event:', error);

      // Handle specific Google Calendar API errors
      if (error.code === 403) {
        throw new Error(
          'No se tienen permisos para crear eventos en el calendario central. Verifica la configuración de la Service Account.',
        );
      } else if (error.code === 404) {
        throw new Error('El calendario central no fue encontrado. Verifica el CALICO_CALENDAR_ID.');
      } else if (error.code === 400) {
        throw new Error(`Datos del evento inválidos: ${error.message}`);
      }

      throw new Error(`Error creando evento en calendario central: ${error.message}`);
    }
  }

 

}
