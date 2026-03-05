import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  private readonly scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  constructor(private readonly configService: ConfigService) {
    this.clientId = configService.get<string>('GOOGLE_CLIENT_ID') ?? '';
    this.clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET') ?? '';

    const configuredUri = configService.get<string>('GOOGLE_REDIRECT_URI');
    if (!configuredUri) {
      const port = configService.get<string>('PORT') ?? '3001';
      this.redirectUri = `http://localhost:${port}/api/calendar/callback`;
      this.logger.warn(`GOOGLE_REDIRECT_URI not set, using default: ${this.redirectUri}`);
    } else {
      this.redirectUri = configuredUri;
    }
  }

  private buildAuthClient(credentials?: { access_token?: string; refresh_token?: string }) {
    const client = new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
    if (credentials) {
      client.setCredentials(credentials);
    }
    return client;
  }

  private getCalendarApi(accessToken: string) {
    return google.calendar({ version: 'v3', auth: this.buildAuthClient({ access_token: accessToken }) });
  }

  getRedirectUri(): string {
    return this.redirectUri;
  }

  async getAuthUrl(format?: 'json'): Promise<string> {
    const url = this.buildAuthClient().generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent',
      state: format === 'json' ? 'format=json' : undefined,
    });
    this.logger.log(`Generated auth URL with redirect URI: ${this.redirectUri}`);
    return url;
  }

  async exchangeCodeForTokens(code: string) {
    const { tokens } = await this.buildAuthClient().getToken(code);
    return tokens;
  }

  /**
   * Validates an access token via the OAuth2 tokeninfo endpoint.
   * Much lighter than a full Calendar API call — no calendar data is fetched.
   */
  async verifyToken(accessToken: string): Promise<boolean> {
    try {
      await this.buildAuthClient().getTokenInfo(accessToken);
      return true;
    } catch {
      return false;
    }
  }

  async listCalendars(accessToken: string) {
    const response = await this.getCalendarApi(accessToken).calendarList.list();
    return response.data.items ?? [];
  }

  async listEvents(accessToken: string, calendarId: string, timeMin?: string, timeMax?: string) {
    const response = await this.getCalendarApi(accessToken).events.list({
      calendarId,
      timeMin: timeMin ?? new Date().toISOString(),
      timeMax,
      maxResults: 100,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return response.data.items ?? [];
  }

  async createEvent(accessToken: string, calendarId: string, eventData: any) {
    const response = await this.getCalendarApi(accessToken).events.insert({
      calendarId,
      requestBody: eventData,
    });
    return response.data;
  }

  async deleteEvent(accessToken: string, calendarId: string, eventId: string) {
    await this.getCalendarApi(accessToken).events.delete({ calendarId, eventId });
  }

  async refreshAccessToken(refreshToken: string) {
    const { credentials } = await this.buildAuthClient({ refresh_token: refreshToken }).refreshAccessToken();
    return credentials;
  }
}
