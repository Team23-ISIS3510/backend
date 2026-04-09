import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

const TIMEZONE = 'America/Bogota';

@Injectable()
export class CalicoCalendarService implements OnModuleInit {
  private readonly logger = new Logger(CalicoCalendarService.name);
  private auth: any = null;
  private calendarId: string | null = null;
  private calendarClient: any = null; // cached alongside auth — built once in initializeAuth

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    // Fire-and-forget: don't block startup if Google Calendar init fails
    this.initializeAuth().catch(error => {
      this.logger.warn(
        `Google Calendar Service Account initialization deferred (will retry on first use): ${error.message}`,
      );
    });
  }

  async initializeAuth() {
    try {
      if (this.auth) return this.auth;

      const serviceAccountKey = this.configService.get('GOOGLE_SERVICE_ACCOUNT_KEY');
      if (!serviceAccountKey) {
        this.logger.warn('GOOGLE_SERVICE_ACCOUNT_KEY not set - Calico Calendar features will be disabled');
        return null;
      }

      this.calendarId = this.configService.get('CALICO_CALENDAR_ID') ?? null;
      if (!this.calendarId) {
        this.logger.warn('CALICO_CALENDAR_ID not set - Calico Calendar features will be disabled');
        return null;
      }

      let credentials: any;
      try {
        credentials = typeof serviceAccountKey === 'string' ? JSON.parse(serviceAccountKey) : serviceAccountKey;
      } catch (parseError: any) {
        throw new Error(`Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY: ${parseError.message}`);
      }

      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
        ],
      });

      // Build and cache the Calendar API client at the same time as auth
      this.calendarClient = google.calendar({ version: 'v3', auth: this.auth });

      this.logger.log('Google Calendar Service Account initialized successfully');
      return this.auth;
    } catch (error: any) {
      this.logger.error('Error initializing Google Calendar Service Account:', error);
      throw new Error(`Failed to initialize Google Calendar Service Account: ${error.message}`);
    }
  }

  isConfigured(): boolean {
    return !!(this.auth && this.calendarId);
  }

  private async getCalendarClient() {
    if (!this.calendarClient) {
      await this.initializeAuth();
    }
    if (!this.calendarClient) {
      throw new Error('Service Account not configured');
    }
    return this.calendarClient;
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
        this.logger.warn('Google Calendar Service not configured. Skipping calendar creation.');
        return {
          success: true,
          warning: 'Google Calendar not configured — event not created in external calendar',
          eventId: null,
          htmlLink: null,
          meetLink: null,
          event: null,
          attendees,
        };
      }

      // Normalize: map string entries to objects and drop anything without an email
      const normalized: Array<{ email: string; displayName?: string; responseStatus?: string }> = attendees
        .map((a) => (typeof a === 'string' ? { email: a } : a))
        .filter((a): a is { email: string; displayName?: string; responseStatus?: string } => Boolean(a?.email));

      // Ensure tutor is present
      if (!normalized.some((a) => a.email === tutorEmail)) {
        normalized.push({ email: tutorEmail, displayName: tutorName ?? tutorEmail, responseStatus: 'accepted' });
      }

      // Dedupe by email, preserving highest-priority responseStatus
      const statusPriority: Record<string, number> = { accepted: 2, tentative: 1, needsAction: 1, declined: 0 };
      const byEmail = new Map<string, { email: string; displayName?: string; responseStatus?: string }>();
      for (const a of normalized) {
        const existing = byEmail.get(a.email);
        if (!existing) {
          byEmail.set(a.email, { ...a });
          continue;
        }
        if (a.displayName) existing.displayName = a.displayName;
        if ((statusPriority[a.responseStatus ?? ''] ?? 0) > (statusPriority[existing.responseStatus ?? ''] ?? 0)) {
          existing.responseStatus = a.responseStatus;
        }
      }
      const finalAttendees = [...byEmail.values()];
      this.logger.log(`Normalized attendees count: ${finalAttendees.length}`);

      const start = startDateTime instanceof Date ? startDateTime.toISOString() : startDateTime;
      const end = endDateTime instanceof Date ? endDateTime.toISOString() : endDateTime;

      const studentInfo = finalAttendees.find((a) => a.email !== tutorEmail);
      const studentName = studentInfo?.displayName ?? studentInfo?.email ?? 'Estudiante';

      const event: any = {
        summary,
        description:
          description ??
          `Sesión de tutoría agendada a través de Calico.\n\nTutor: ${tutorName ?? tutorEmail}\nEstudiante: ${studentName}\n\nNOTA: Este evento se creó en el calendario central de Calico. Los participantes serán notificados por separado.`,
        start: { dateTime: start, timeZone: TIMEZONE },
        end: { dateTime: end, timeZone: TIMEZONE },
        location,
        // Attendees intentionally omitted — Service Account requires Domain-Wide Delegation to invite external users
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        status: 'confirmed',
        visibility: 'default',
        guestsCanInviteOthers: false,
        guestsCanModify: false,
        guestsCanSeeOtherGuests: false,
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 30 }],
        },
      };

      this.logger.log('Creating tutoring session event in Calico calendar...');
      const calendar = await this.getCalendarClient();

      let response: any;
      let meetLink: string | null = null;

      try {
        response = await calendar.events.insert({
          calendarId: this.calendarId!,
          requestBody: event,
          conferenceDataVersion: 1, // Required for Google Meet creation
          sendUpdates: 'none',
        });

        meetLink =
          response.data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri ??
          response.data.hangoutLink ??
          null;

        this.logger.log(meetLink ? 'Google Meet link created' : 'Event created but no Meet link generated');
      } catch (meetError: any) {
        this.logger.warn(`Failed to create event with Meet, retrying without conference data: ${meetError.message}`);

        // Retry without conferenceData using destructuring (no mutation)
        const { conferenceData: _omitted, ...eventWithoutMeet } = event;
        response = await calendar.events.insert({
          calendarId: this.calendarId!,
          requestBody: eventWithoutMeet,
          sendUpdates: 'none',
        });

        this.logger.log('Event created without Meet link');
      }

      this.logger.log(`Tutoring session event created: ${response.data.id}`);
      return {
        success: true,
        eventId: response.data.id,
        tutorId,
        htmlLink: response.data.htmlLink,
        hangoutLink: response.data.hangoutLink,
        meetLink,
        event: response.data,
      };
    } catch (error: any) {
      this.logger.error('Error creating tutoring session event:', error);
      if (error.code === 403) {
        throw new Error('No se tienen permisos para crear eventos en el calendario central. Verifica la configuración de la Service Account.');
      }
      if (error.code === 404) {
        throw new Error('El calendario central no fue encontrado. Verifica el CALICO_CALENDAR_ID.');
      }
      if (error.code === 400) {
        throw new Error(`Datos del evento inválidos: ${error.message}`);
      }
      throw new Error(`Error creando evento en calendario central: ${error.message}`);
    }
  }

  /**
   * Update specific fields of a tutoring session event.
   * Uses PATCH so only the provided fields are sent — no need to fetch the current event first.
   */
  async updateTutoringSessionEvent(
    eventId: string,
    updateData: {
      summary?: string;
      description?: string;
      startDateTime?: Date | string;
      endDateTime?: Date | string;
      location?: string;
    },
  ) {
    try {
      if (!eventId) throw new Error('Event ID is required for update');
      if (!this.isConfigured()) throw new Error('Service Account not configured');

      this.logger.log(`Updating tutoring session event: ${eventId}`);

      const patch: any = {};
      if (updateData.summary !== undefined) patch.summary = updateData.summary;
      if (updateData.description !== undefined) patch.description = updateData.description;
      if (updateData.location !== undefined) patch.location = updateData.location;
      if (updateData.startDateTime !== undefined) {
        patch.start = {
          dateTime: updateData.startDateTime instanceof Date ? updateData.startDateTime.toISOString() : updateData.startDateTime,
          timeZone: TIMEZONE,
        };
      }
      if (updateData.endDateTime !== undefined) {
        patch.end = {
          dateTime: updateData.endDateTime instanceof Date ? updateData.endDateTime.toISOString() : updateData.endDateTime,
          timeZone: TIMEZONE,
        };
      }

      const calendar = await this.getCalendarClient();
      const response = await calendar.events.patch({
        calendarId: this.calendarId!,
        eventId,
        requestBody: patch,
        sendUpdates: 'none',
      });

      this.logger.log('Tutoring session event updated successfully');
      return { success: true, eventId: response.data.id, event: response.data };
    } catch (error: any) {
      this.logger.error('Error updating tutoring session event:', error);
      throw new Error(`Error actualizando evento: ${error.message}`);
    }
  }

  /**
   * Cancel a tutoring session event (marks as cancelled, preserves history)
   */
  async cancelTutoringSessionEvent(eventId: string, reason = 'Sesión cancelada') {
    try {
      if (!eventId) throw new Error('Event ID is required for cancellation');
      if (!this.isConfigured()) throw new Error('Service Account not configured');

      this.logger.log(`Cancelling tutoring session event: ${eventId}`);

      const calendar = await this.getCalendarClient();
      const response = await calendar.events.patch({
        calendarId: this.calendarId!,
        eventId,
        requestBody: { status: 'cancelled', summary: `[CANCELADA] ${reason}` },
        sendUpdates: 'none',
      });

      this.logger.log('Tutoring session event cancelled successfully');
      return { success: true, eventId: response.data.id, status: 'cancelled' };
    } catch (error: any) {
      this.logger.error('Error cancelling tutoring session event:', error);
      throw new Error(`Error cancelando evento: ${error.message}`);
    }
  }

  /**
   * Permanently delete a tutoring session event
   */
  async deleteTutoringSessionEvent(eventId: string) {
    try {
      if (!eventId) throw new Error('Event ID is required for deletion');
      if (!this.isConfigured()) throw new Error('Service Account not configured');

      this.logger.log(`Deleting tutoring session event: ${eventId}`);

      const calendar = await this.getCalendarClient();
      await calendar.events.delete({
        calendarId: this.calendarId!,
        eventId,
        sendUpdates: 'none',
      });

      this.logger.log('Tutoring session event deleted successfully');
      return { success: true, eventId, deleted: true };
    } catch (error: any) {
      this.logger.error('Error deleting tutoring session event:', error);
      throw new Error(`Error eliminando evento: ${error.message}`);
    }
  }

  /**
   * Get information about a specific event
   */
  async getTutoringSessionEvent(eventId: string) {
    try {
      if (!eventId) throw new Error('Event ID is required');
      if (!this.isConfigured()) throw new Error('Service Account not configured');

      const calendar = await this.getCalendarClient();
      const response = await calendar.events.get({
        calendarId: this.calendarId!,
        eventId,
      });

      return { success: true, event: response.data };
    } catch (error: any) {
      this.logger.error('Error getting tutoring session event:', error);
      throw new Error(`Error obteniendo evento: ${error.message}`);
    }
  }
}
