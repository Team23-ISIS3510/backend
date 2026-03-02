import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private configService: ConfigService) {}

  getOAuth2Client() {
    return new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_REDIRECT_URI'),
    );
  }

  async getAuthUrl(format?: 'json'): Promise<string> {
    let redirectUri = this.configService.get('GOOGLE_REDIRECT_URI');
    
    // If redirect URI is not set, use default based on PORT
    if (!redirectUri) {
      const port = this.configService.get('PORT') || 3001;
      redirectUri = `http://localhost:${port}/api/calendar/callback`;
      this.logger.warn(`GOOGLE_REDIRECT_URI not set, using default: ${redirectUri}`);
    }
    
    // IMPORTANT: Google OAuth requires the redirect URI to match EXACTLY what's registered
    // We cannot include query parameters in the redirect URI sent to Google
    // The format=json parameter will be added by the callback endpoint when Google redirects
    this.logger.log(`Using redirect URI (base, no query params): ${redirectUri}`);
    
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    const oauth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      redirectUri, // Use base URI without query params
    );

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      // Add state parameter to indicate format preference
      state: format === 'json' ? 'format=json' : undefined,
    });

    this.logger.log(`Generated auth URL. Callback will be: ${redirectUri}${format === 'json' ? '?format=json' : ''}`);
    return url;
  }

  async exchangeCodeForTokens(code: string) {
    try {
      const oauth2Client = this.getOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      this.logger.error('Error exchanging code for tokens:', error);
      throw error;
    }
  }

  async listCalendars(accessToken: string) {
    try {
      const oauth2Client = this.getOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const response = await calendar.calendarList.list();

      return response.data.items || [];
    } catch (error) {
      this.logger.error('Error listing calendars:', error);
      throw error;
    }
  }

  async listEvents(accessToken: string, calendarId: string, timeMin?: string, timeMax?: string) {
    try {
      const oauth2Client = this.getOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const response = await calendar.events.list({
        calendarId,
        timeMin: timeMin || new Date().toISOString(),
        timeMax,
        maxResults: 100,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      this.logger.error('Error listing events:', error);
      throw error;
    }
  }

  async createEvent(accessToken: string, calendarId: string, eventData: any) {
    try {
      const oauth2Client = this.getOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const response = await calendar.events.insert({
        calendarId,
        requestBody: eventData,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error creating event:', error);
      throw error;
    }
  }

  async deleteEvent(accessToken: string, calendarId: string, eventId: string) {
    try {
      const oauth2Client = this.getOAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      await calendar.events.delete({
        calendarId,
        eventId,
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Error deleting event:', error);
      throw error;
    }
  }

  async refreshAccessToken(refreshToken: string) {
    try {
      const oauth2Client = this.getOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      const { credentials } = await oauth2Client.refreshAccessToken();
      return credentials;
    } catch (error) {
      this.logger.error('Error refreshing access token:', error);
      throw error;
    }
  }
}
