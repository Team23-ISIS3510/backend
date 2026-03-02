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
        return this.auth; // Already initialized
      }

      // Get service account key from environment
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

      this.logger.log('✅ Google Calendar Service Account initialized successfully');
      return this.auth;
    } catch (error) {
      this.logger.error('❌ Error initializing Google Calendar Service Account:', error);
      throw new Error(`Failed to initialize Google Calendar Service Account: ${error.message}`);
    }
  }

}
