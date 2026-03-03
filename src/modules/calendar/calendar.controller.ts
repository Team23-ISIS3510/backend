import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  Req,
  Res,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';

@ApiTags('Calendar')
@Controller('calendar')
export class CalendarController {
  private readonly logger = new Logger(CalendarController.name);

  private readonly isProduction: boolean;
  private readonly frontendUrl: string;

  constructor(
    private readonly calendarService: CalendarService,
    private readonly configService: ConfigService,
  ) {
    this.isProduction = configService.get<string>('NODE_ENV') === 'production';
    this.frontendUrl = configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }

  @ApiOperation({ summary: 'Get Google Calendar auth URL (redirects to Google)' })
  @ApiResponse({ status: 302, description: 'Redirect to Google auth URL' })
  @Get('auth')
  async getAuthUrl(@Res() res: Response) {
    try {
      const authUrl = await this.calendarService.getAuthUrl();
      return res.redirect(authUrl);
    } catch (error) {
      this.logger.error('Error generating auth URL:', error);
      throw new HttpException('Error generating auth URL', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get Google Calendar auth URL as JSON (for API clients)' })
  @ApiResponse({ status: 200, description: 'Returns auth URL as JSON' })
  @ApiQuery({ name: 'format', required: false, description: 'Set to "json" to receive tokens as JSON instead of a redirect after auth' })
  @Get('auth-url')
  async getAuthUrlJson(@Query('format') format?: string) {
    try {
      const isJson = format === 'json';
      const authUrl = await this.calendarService.getAuthUrl(isJson ? 'json' : undefined);
      const redirectUri = this.calendarService.getRedirectUri();

      return {
        success: true,
        authUrl,
        redirectUri,
        callbackUrl: redirectUri,
        message: 'Visit the authUrl to authorize Google Calendar access',
        instructions: isJson
          ? 'After authorization, add ?format=json to the callback URL to get tokens as JSON'
          : 'After authorization, you will be redirected to the callback URL',
        ...(isJson && {
          note: 'IMPORTANT: When Google redirects you, manually add ?format=json to the URL to get JSON response',
        }),
      };
    } catch (error) {
      this.logger.error('Error generating auth URL:', error);
      throw new HttpException('Error generating auth URL', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'OAuth callback handler (redirects to frontend or returns JSON)' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend after auth' })
  @ApiResponse({ status: 200, description: 'Returns tokens as JSON if format=json' })
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'format', required: false, description: 'Set to "json" to return tokens instead of redirecting' })
  @ApiQuery({ name: 'state', required: false, description: 'OAuth state parameter (may contain format=json)' })
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('format') format: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const useJsonFormat = format === 'json' || state === 'format=json';

    try {
      if (!code) {
        if (useJsonFormat) {
          return res.status(HttpStatus.BAD_REQUEST).json({ success: false, error: 'No authorization code provided' });
        }
        throw new HttpException('No authorization code provided', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`Processing OAuth callback. Format: ${useJsonFormat ? 'json' : 'redirect'}`);

      const tokens = await this.calendarService.exchangeCodeForTokens(code);

      if (useJsonFormat) {
        return res.json({
          success: true,
          message: 'Authorization successful',
          tokens: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
            token_type: tokens.token_type ?? 'Bearer',
          },
        });
      }

      res.cookie('calendar_access_token', tokens.access_token, {
        httpOnly: true,
        secure: this.isProduction,
        maxAge: 3_600_000, // 1 hour
        sameSite: 'lax',
      });

      if (tokens.refresh_token) {
        res.cookie('calendar_refresh_token', tokens.refresh_token, {
          httpOnly: true,
          secure: this.isProduction,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          sameSite: 'lax',
        });
      }

      return res.redirect(`${this.frontendUrl}/tutor/disponibilidad?calendar_connected=true`);
    } catch (error) {
      this.logger.error('Error in calendar callback:', error);

      if (error.message?.includes('redirect_uri_mismatch')) {
        this.logger.error(
          `Redirect URI mismatch! Current URI: ${this.calendarService.getRedirectUri()}. Make sure it is registered in Google Cloud Console.`,
        );
      }

      if (useJsonFormat) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          error: error.message ?? 'Error processing authorization',
          ...(error.message?.includes('redirect_uri_mismatch') && {
            details: 'The redirect URI used does not match what is registered in Google Cloud Console.',
          }),
        });
      }

      return res.redirect(
        `${this.frontendUrl}/calendar-error?error=${encodeURIComponent(error.message ?? 'Unknown error')}&calendar_connected=false`,
      );
    }
  }

  @ApiOperation({ summary: 'Exchange authorization code for tokens (for API clients)' })
  @ApiResponse({ status: 200, description: 'Returns tokens as JSON' })
  @ApiQuery({ name: 'code', required: true })
  @Post('exchange-token')
  async exchangeToken(@Query('code') code: string) {
    try {
      if (!code) {
        throw new HttpException('No authorization code provided', HttpStatus.BAD_REQUEST);
      }

      const tokens = await this.calendarService.exchangeCodeForTokens(code);

      return {
        success: true,
        message: 'Tokens obtained successfully',
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
          token_type: tokens.token_type ?? 'Bearer',
        },
      };
    } catch (error) {
      this.logger.error('Error exchanging code for tokens:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { success: false, error: error.message ?? 'Error exchanging authorization code' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Check calendar connection status' })
  @ApiResponse({ status: 200, description: 'Connection status' })
  @Get('check-connection')
  async checkConnection(@Req() req: Request) {
    const accessToken = req.cookies?.calendar_access_token;
    const refreshToken = req.cookies?.calendar_refresh_token;

    // Uses the lightweight OAuth2 tokeninfo endpoint — no Calendar API call needed
    const tokenValid = accessToken ? await this.calendarService.verifyToken(accessToken) : false;

    return {
      connected: tokenValid,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      tokenValid,
    };
  }

  @ApiOperation({ summary: 'List connected calendars' })
  @ApiResponse({ status: 200, description: 'List of calendars' })
  @Get('list')
  async listCalendars(@Req() req: Request) {
    try {
      const accessToken = req.cookies?.calendar_access_token;

      if (!accessToken) {
        throw new HttpException(
          { success: false, error: 'No Google Calendar connection found' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      const calendars = await this.calendarService.listCalendars(accessToken);
      return { success: true, calendars };
    } catch (error) {
      this.logger.error('Error listing calendars:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'List events from a calendar' })
  @ApiResponse({ status: 200, description: 'List of events' })
  @ApiQuery({ name: 'calendarId', required: true })
  @ApiQuery({ name: 'timeMin', required: false })
  @ApiQuery({ name: 'timeMax', required: false })
  @Get('events')
  async listEvents(
    @Query('calendarId') calendarId: string,
    @Query('timeMin') timeMin: string,
    @Query('timeMax') timeMax: string,
    @Req() req: Request,
  ) {
    try {
      const accessToken = req.cookies?.calendar_access_token;

      if (!accessToken) {
        throw new HttpException(
          { success: false, error: 'No Google Calendar connection found' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (!calendarId) {
        throw new HttpException('calendarId is required', HttpStatus.BAD_REQUEST);
      }

      const events = await this.calendarService.listEvents(accessToken, calendarId, timeMin, timeMax);
      return { success: true, events, totalEvents: events.length };
    } catch (error) {
      this.logger.error('Error listing events:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Create an event in a calendar' })
  @ApiResponse({ status: 201, description: 'Event created' })
  @ApiBody({ schema: { example: { calendarId: 'string', summary: 'Meeting', start: {}, end: {} } } })
  @Post('create-event')
  async createEvent(@Body() eventData: any, @Req() req: Request) {
    try {
      const accessToken = req.cookies?.calendar_access_token;

      if (!accessToken) {
        throw new HttpException(
          { success: false, error: 'No Google Calendar connection found' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      const { calendarId, ...event } = eventData;

      if (!calendarId) {
        throw new HttpException('calendarId is required', HttpStatus.BAD_REQUEST);
      }

      const createdEvent = await this.calendarService.createEvent(accessToken, calendarId, event);
      return { success: true, event: createdEvent };
    } catch (error) {
      this.logger.error('Error creating event:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Delete an event from a calendar' })
  @ApiResponse({ status: 200, description: 'Event deleted' })
  @ApiQuery({ name: 'calendarId', required: true })
  @ApiQuery({ name: 'eventId', required: true })
  @Delete('delete-event')
  async deleteEvent(
    @Query('calendarId') calendarId: string,
    @Query('eventId') eventId: string,
    @Req() req: Request,
  ) {
    try {
      const accessToken = req.cookies?.calendar_access_token;

      if (!accessToken) {
        throw new HttpException(
          { success: false, error: 'No Google Calendar connection found' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (!calendarId || !eventId) {
        throw new HttpException('calendarId and eventId are required', HttpStatus.BAD_REQUEST);
      }

      await this.calendarService.deleteEvent(accessToken, calendarId, eventId);
      return { success: true, message: 'Event deleted successfully' };
    } catch (error) {
      this.logger.error('Error deleting event:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Refresh calendar access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  @Post('refresh-token')
  async refreshToken(@Req() req: Request, @Res() res: Response) {
    try {
      const refreshToken = req.cookies?.calendar_refresh_token;

      if (!refreshToken) {
        throw new HttpException('No refresh token available', HttpStatus.UNAUTHORIZED);
      }

      const newTokens = await this.calendarService.refreshAccessToken(refreshToken);

      res.cookie('calendar_access_token', newTokens.access_token, {
        httpOnly: true,
        secure: this.isProduction,
        maxAge: 3_600_000,
        sameSite: 'lax',
      });

      return res.json({ success: true, message: 'Token refreshed successfully' });
    } catch (error) {
      this.logger.error('Error refreshing token:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException('Failed to refresh token', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Disconnect calendar and clear cookies' })
  @ApiResponse({ status: 200, description: 'Disconnected' })
  @Post('disconnect')
  async disconnect(@Res() res: Response) {
    res.clearCookie('calendar_access_token');
    res.clearCookie('calendar_refresh_token');
    return res.json({ success: true, message: 'Disconnected from Google Calendar' });
  }

  @ApiOperation({ summary: 'Diagnostic endpoint - Check OAuth configuration' })
  @ApiResponse({ status: 200, description: 'Configuration status' })
  @Get('diagnostics')
  async diagnostics() {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.calendarService.getRedirectUri();
    const port = this.configService.get<string>('PORT') ?? '3001';

    const issues: string[] = [];
    const warnings: string[] = [];

    if (!clientId) {
      issues.push('GOOGLE_CLIENT_ID is not set');
    } else if (!clientId.includes('.apps.googleusercontent.com')) {
      warnings.push('GOOGLE_CLIENT_ID format looks incorrect');
    }

    if (!clientSecret) {
      issues.push('GOOGLE_CLIENT_SECRET is not set');
    }

    if (!this.configService.get('GOOGLE_REDIRECT_URI')) {
      issues.push('GOOGLE_REDIRECT_URI is not set');
    } else {
      try {
        const url = new URL(redirectUri);
        if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
          warnings.push('Redirect URI is not localhost - make sure this matches Google Cloud Console');
        }
        if (url.port && url.port !== port) {
          warnings.push(`Redirect URI port (${url.port}) doesn't match server port (${port})`);
        }
      } catch {
        issues.push('GOOGLE_REDIRECT_URI is not a valid URL');
      }
    }

    const redirectUriWithFormat = `${redirectUri}?format=json`;

    return {
      success: issues.length === 0,
      configuration: {
        clientId: clientId ? `${clientId.substring(0, 20)}...` : 'NOT SET',
        clientSecret: clientSecret ? 'SET (hidden)' : 'NOT SET',
        redirectUri,
        redirectUriWithFormat,
        frontendUrl: this.frontendUrl,
        serverPort: port,
      },
      issues,
      warnings,
      instructions: {
        step1: 'Make sure your .env file has GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI',
        step2: 'Add these URIs to your Google Cloud Console OAuth 2.0 Client ID authorized redirect URIs:',
        redirectUrisToAdd: [redirectUri, redirectUriWithFormat],
        step3: 'Go to: https://console.cloud.google.com/apis/credentials',
        step4: 'Click on your OAuth 2.0 Client ID',
        step5: 'Under "Authorized redirect URIs", click "ADD URI"',
        step6: `Add: ${redirectUri}`,
        step7: `Add: ${redirectUriWithFormat} (for JSON format)`,
        step8: 'Click "SAVE"',
      },
    };
  }
}
