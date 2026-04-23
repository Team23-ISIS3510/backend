import { Controller, Get, Post, Put, Delete, Query, Body, Param, HttpException, HttpStatus, Logger, Req } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { SlotService } from '../availability/slot.service';
import { GetAvailabilityDto } from '../availability/dto/get-availability.dto';
import { CheckEventDto, SyncAvailabilityDto, SyncSpecificEventsDto } from '../availability/dto/sync-availability.dto';
import { CreateAvailabilityDto } from '../availability/dto/create-availability.dto';
import { UpdateAvailabilityDto } from '../availability/dto/update-availability.dto';
import { AvailabilityResponseDto } from '../availability/dto/availability-response.dto';
import {
  GetMultipleTutorsAvailabilityDto,
  GenerateJointSlotsDto,
  GenerateJointSlotsWeekDto,
  GetJointAvailabilityStatsDto,
} from '../availability/dto/joint-availability.dto';
import {
  GenerateSlotsDto,
  GenerateSlotsFromAvailabilitiesDto,
  ValidateSlotDto,
  CheckSlotAvailabilityDto,
  GetConsecutiveSlotsDto,
} from '../availability/dto/slot.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Availability')
@Controller('availability')
export class AvailabilityController {
  private readonly logger = new Logger(AvailabilityController.name);

  constructor(
    private readonly availabilityService: AvailabilityService,
    private readonly slotService: SlotService,
  ) {}

  @ApiOperation({ summary: 'Get availabilities from a tutor' })
  @ApiResponse({ status: 200, description: 'List of availabilities.' })
  @ApiQuery({ name: 'tutorId', required: false })
  @Get()
  async getAvailabilities(@Query() query: GetAvailabilityDto) {
    try {
      const availabilities = await this.availabilityService.getAvailabilities(query);
      return {
        success: true,
        availabilities,
        totalCount: availabilities.length,
        source: 'firebase',
      };
    } catch (error) {
      this.logger.error('Error fetching availabilities:', error);
      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error fetching availabilities',
          availabilities: [],
          totalCount: 0,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Create a new availability' })
  @ApiResponse({ status: 201, description: 'Availability created successfully.' })
  @ApiBody({ type: CreateAvailabilityDto })
  @Post('create')
  async createAvailability(@Body() createDto: CreateAvailabilityDto) {
    try {
      if (!createDto.tutorId || !createDto.title || !createDto.date || !createDto.startTime || !createDto.endTime) {
        throw new HttpException(
          {
            success: false,
            error: 'Missing required fields: tutorId, title, date, startTime, endTime',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Create availability requested for tutor: ${createDto.tutorId}`);

      const created = await this.availabilityService.createAvailability(createDto);

      return {
        success: true,
        message: 'Disponibilidad creada exitosamente',
        availability: created,
      };
    } catch (error) {
      this.logger.error('Error creating availability:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error creando disponibilidad',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Check if an availability exists' })
  @ApiResponse({ status: 200, description: 'Availability existence result.' })
  @ApiQuery({ name: 'eventId', required: true })
  @Get('check-event')
  async checkEvent(@Query() query: CheckEventDto) {
    try {
      const { eventId } = query;

      if (!eventId) {
        throw new HttpException('eventId parameter is required', HttpStatus.BAD_REQUEST);
      }

      const exists = await this.availabilityService.checkEventExists(eventId);

      return {
        exists,
        eventId,
      };
    } catch (error) {
      this.logger.error('Error checking event existence:', error);
      throw new HttpException(
        {
          error: error.message || 'Error checking event existence',
          exists: false,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Sync availabilities from Google Calendar' })
  @ApiResponse({ status: 200, description: 'Sync result with created, updated, and error counts.' })
  @ApiBody({ schema: { example: { tutorId: 'tutorId', calendarId: 'calendarId' } } })
  @Post('sync')
  async syncAvailabilities(@Body() syncDto: SyncAvailabilityDto, @Req() req: Request) {
    try {
      // Validate tutorId
      if (!syncDto.tutorId || syncDto.tutorId.trim() === '') {
        throw new HttpException(
          {
            success: false,
            error: 'No se encontró información del tutor. Por favor, proporciona un tutorId válido.',
            syncResults: {
              created: 0,
              updated: 0,
              errors: [{ error: 'tutorId es requerido' }],
              totalProcessed: 0,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }


      // Get access token only from cookies
      const accessToken = req.cookies?.calendar_access_token;

      if (!accessToken || accessToken.trim() === '') {
        throw new HttpException(
          { success: false, error: 'No Google Calendar connection found' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.logger.log(`Sync requested for tutor: ${syncDto.tutorId}`);

      // Perform sync with retry
      const syncResults = await this.availabilityService.syncWithRetry(
        syncDto.tutorId,
        accessToken,
        syncDto.calendarId,
      );

      return {
        success: true,
        message: 'Sincronización completada exitosamente',
        syncResults,
      };
    } catch (error) {
      this.logger.error('Error syncing availabilities:', error);

      // Handle specific error types
      let errorMessage = error.message || 'Error durante la sincronización';
      let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

      if (error instanceof HttpException) {
        throw error;
      }

      if (error.message.includes('conexión') || error.message.includes('Calendar')) {
        errorMessage = `Error de conexión con Google Calendar: ${error.message}`;
        statusCode = HttpStatus.UNAUTHORIZED;
      } else if (error.message.includes('email') || error.message.includes('formato')) {
        errorMessage = `Error de validación: ${error.message}`;
        statusCode = HttpStatus.BAD_REQUEST;
      }

      throw new HttpException(
        {
          success: false,
          error: errorMessage,
          syncResults: {
            created: 0,
            updated: 0,
            errors: [{ error: errorMessage }],
            totalProcessed: 0,
          },
        },
        statusCode,
      );
    }
  }

  @ApiOperation({ summary: 'Sync specific events' })
  @ApiResponse({ status: 200, description: 'Sync specific events result.' })
  @ApiBody({ schema: { example: { tutorId: 'tutorId', events: [] } } })
  @Post('sync-specific')
  async syncSpecificEvents(@Body() syncDto: SyncSpecificEventsDto, @Req() req: Request) {
    try {
      if (!syncDto.tutorId || syncDto.tutorId.trim() === '') {
        throw new HttpException(
          {
            success: false,
            error: 'tutorId es requerido',
            syncResults: {
              created: 0,
              updated: 0,
              errors: [{ error: 'tutorId es requerido' }],
              totalProcessed: 0,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!syncDto.events || syncDto.events.length === 0) {
        throw new HttpException(
          {
            success: false,
            error: 'events array es requerido y no puede estar vacío',
            syncResults: {
              created: 0,
              updated: 0,
              errors: [{ error: 'events array es requerido' }],
              totalProcessed: 0,
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Get access token only from cookies
      const accessToken = req.cookies?.calendar_access_token;

      if (!accessToken || accessToken.trim() === '') {
        throw new HttpException(
          { success: false, error: 'No Google Calendar connection found' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.logger.log(`Sync specific events requested for tutor: ${syncDto.tutorId}, events: ${syncDto.events.length}`);

      const syncResults = await this.availabilityService.syncSpecificEvents(
        syncDto.tutorId,
        accessToken,
        syncDto.events,
      );

      return {
        success: true,
        message: 'Sincronización de eventos específicos completada',
        syncResults,
      };
    } catch (error) {
      this.logger.error('Error syncing specific events:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error sincronizando eventos específicos',
          syncResults: {
            created: 0,
            updated: 0,
            errors: [{ error: error.message }],
            totalProcessed: 0,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Intelligent sync - only sync new events from disponibilidad calendar' })
  @ApiResponse({ status: 200, description: 'Intelligent sync result.' })
  @ApiBody({ schema: { example: { tutorId: 'tutorId', calendarName: 'Disponibilidad' } } })
  @Post('sync-intelligent')
  async intelligentSync(
    @Body() body: { tutorId: string; calendarName?: string; daysAhead?: number },
    @Req() req: Request,
  ) {
    try {
      if (!body.tutorId || body.tutorId.trim() === '') {
        throw new HttpException(
          {
            success: false,
            error: 'tutorId es requerido',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Get access token only from cookies
      const accessToken = req.cookies?.calendar_access_token;

      if (!accessToken || accessToken.trim() === '') {
        throw new HttpException(
          { success: false, error: 'No Google Calendar connection found' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.logger.log(`Intelligent sync requested for tutor: ${body.tutorId}`);

      const result = await this.availabilityService.intelligentSync(
        body.tutorId,
        accessToken,
        body.calendarName,
        body.daysAhead || 30,
      );

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      this.logger.error('Error in intelligent sync:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error en sincronización inteligente',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Create availability event in Google Calendar and Firebase' })
  @ApiResponse({ status: 201, description: 'Event created successfully.' })
  @ApiBody({ schema: { example: { tutorId: 'tutorId', title: 'New availability', date: '2099-01-01', startTime: '10:00', endTime: '11:00' } } })
  @Post('create')
  async createAvailabilityEvent(
    @Body() createDto: CreateAvailabilityDto,
    @Req() req: Request,
  ) {
    try {
      // Get access token only from cookies
      const accessToken = req.cookies?.calendar_access_token;

      if (!accessToken || accessToken.trim() === '') {
        throw new HttpException(
          { success: false, error: 'No Google Calendar connection found' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.logger.log(`Create availability event requested for tutor: ${createDto.tutorId}`);

      const result = await this.availabilityService.createAvailabilityEvent(
        createDto.tutorId,
        accessToken,
        createDto,
      );

      return {
        success: true,
        message: 'Evento de disponibilidad creado exitosamente',
        event: result.event,
        availabilityId: result.availabilityId,
      };
    } catch (error) {
      this.logger.error('Error creating availability event:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error creando evento de disponibilidad',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Update an existing availability' })
  @ApiResponse({ status: 200, description: 'Availability updated successfully.' })
  @ApiBody({ type: UpdateAvailabilityDto })
  @Put(':availabilityId')
  async updateAvailability(
    @Param('availabilityId') availabilityId: string,
    @Body() updateDto: UpdateAvailabilityDto,
  ) {
    try {
      if (!availabilityId) {
        throw new HttpException(
          {
            success: false,
            error: 'availabilityId es requerido',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Update availability requested: ${availabilityId}`);

      const updated = await this.availabilityService.updateAvailability(availabilityId, updateDto);

      return {
        success: true,
        message: 'Disponibilidad actualizada exitosamente',
        availability: updated,
      };
    } catch (error) {
      this.logger.error('Error updating availability:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error actualizando disponibilidad',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Delete availability event from Google Calendar and Firebase' })
  @ApiResponse({ status: 200, description: 'Event deleted successfully.' })
  @ApiQuery({ name: 'eventId', required: true })
  @ApiQuery({ name: 'calendarId', required: false })
  @Delete('delete')
  async deleteAvailabilityEvent(
    @Query('eventId') eventId: string,
    @Query('calendarId') calendarId: string | undefined,
    @Req() req: Request,
  ) {
    try {
      if (!eventId) {
        throw new HttpException(
          {
            success: false,
            error: 'eventId es requerido',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Get access token only from cookies
      const accessToken = req.cookies?.calendar_access_token;

      if (!accessToken || accessToken.trim() === '') {
        throw new HttpException(
          { success: false, error: 'No Google Calendar connection found' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.logger.log(`Delete availability event requested: ${eventId}`);

      await this.availabilityService.deleteAvailabilityEvent(accessToken, eventId, calendarId);

      return {
        success: true,
        message: 'Evento de disponibilidad eliminado exitosamente',
      };
    } catch (error) {
      this.logger.error('Error deleting availability event:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error eliminando evento de disponibilidad',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Delete availability by availabilityId (Firebase only)' })
  @ApiResponse({ status: 200, description: 'Availability deleted successfully.' })
  @Delete(':availabilityId')
  async deleteAvailabilityById(@Param('availabilityId') availabilityId: string) {
    try {
      if (!availabilityId) {
        throw new HttpException(
          {
            success: false,
            error: 'availabilityId es requerido',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Delete availability requested: ${availabilityId}`);

      await this.availabilityService.deleteAvailability(availabilityId);

      return {
        success: true,
        message: 'Disponibilidad eliminada exitosamente',
      };
    } catch (error) {
      this.logger.error('Error deleting availability by id:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error eliminando disponibilidad',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Delete all availabilities for a tutor' })
  @ApiResponse({ status: 200, description: 'Availabilities deleted successfully.' })
  @Delete('tutor/:tutorId')
  async deleteAvailabilitiesByTutor(@Param('tutorId') tutorId: string) {
    try {
      if (!tutorId) {
        throw new HttpException(
          {
            success: false,
            error: 'tutorId es requerido',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Delete all availabilities requested for tutor: ${tutorId}`);

      const deletedCount = await this.availabilityService.deleteAvailabilitiesByTutor(tutorId);

      return {
        success: true,
        message: 'Disponibilidades eliminadas exitosamente',
        deletedCount,
      };
    } catch (error) {
      this.logger.error('Error deleting availabilities by tutor:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error eliminando disponibilidades del tutor',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get availability for multiple tutors' })
  @ApiResponse({ status: 200, description: 'Multiple tutors availability retrieved successfully.' })
  @ApiBody({ schema: { example: { tutorIds: ['tutor1Id', 'tutor2Id'], startDate: '2099-01-01', endDate: '2099-01-07', limit: 100 } } })
  @Post('joint/multiple')
  async getMultipleTutorsAvailability(@Body() dto: GetMultipleTutorsAvailabilityDto) {
    try {
      if (!dto.tutorIds || dto.tutorIds.length === 0) {
        throw new HttpException(
          {
            success: false,
            error: 'tutorEmails array is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Getting joint availability for ${dto.tutorIds.length} tutors`);

      const results = await this.availabilityService.getMultipleTutorsAvailability(
        dto.tutorIds,
        dto.startDate,
        dto.endDate,
        dto.limit,
      );

      return {
        success: true,
        tutorsAvailability: results,
        totalTutors: results.length,
        connectedTutors: results.filter((r) => r.connected).length,
        totalSlots: results.reduce((acc, r) => acc + r.totalSlots, 0),
      };
    } catch (error) {
      this.logger.error('Error getting multiple tutors availability:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error obteniendo disponibilidad de múltiples tutores',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Generate joint availability slots for a specific day' })
  @ApiResponse({ status: 200, description: 'Joint slots generated successfully.' })
  @ApiBody({ schema: { example: { tutorIds: ['tutor1Id', 'tutor2Id'], date: '2099-01-01' } } })
  @Post('joint/day')
  async generateJointSlotsForDay(@Body() dto: GenerateJointSlotsDto) {
    try {
      if (!dto.tutorIds || dto.tutorIds.length === 0) {
        throw new HttpException(
          {
            success: false,
            error: 'tutorEmails array is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!dto.date) {
        throw new HttpException(
          {
            success: false,
            error: 'date is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Generating joint slots for ${dto.date} with ${dto.tutorIds.length} tutors`);

      // First get availability for all tutors
      const tutorsAvailability = await this.availabilityService.getMultipleTutorsAvailability(
        dto.tutorIds,
      );

      // Generate joint slots for the day
      const jointSlots = this.availabilityService.generateJointSlotsForDay(
        tutorsAvailability,
        dto.date,
      );

      return {
        success: true,
        date: dto.date,
        jointSlots,
        totalSlots: jointSlots.length,
        tutorsCount: dto.tutorIds.length,
      };
    } catch (error) {
      this.logger.error('Error generating joint slots for day:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error generando slots conjuntos para el día',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Generate joint availability slots for a week' })
  @ApiResponse({ status: 200, description: 'Joint slots for week generated successfully.' })
  @ApiBody({ schema: { example: { tutorIds: ['tutor1Id', 'tutor2Id'], startDate: '2099-01-01' } } })
  @Post('joint/week')
  async generateJointSlotsForWeek(@Body() dto: GenerateJointSlotsWeekDto) {
    try {
      if (!dto.tutorIds || dto.tutorIds.length === 0) {
        throw new HttpException(
          {
            success: false,
            error: 'tutorIds array is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!dto.startDate) {
        throw new HttpException(
          {
            success: false,
            error: 'startDate is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Generating joint slots for week starting ${dto.startDate} with ${dto.tutorIds.length} tutors`);

      // First get availability for all tutors
      const tutorsAvailability = await this.availabilityService.getMultipleTutorsAvailability(
        dto.tutorIds,
      );

      // Generate joint slots for the week
      const weekSlots = this.availabilityService.generateJointSlotsForWeek(
        tutorsAvailability,
        dto.startDate,
      );

      // Calculate totals
      const totalSlots = Object.values(weekSlots).reduce((acc, daySlots) => acc + daySlots.length, 0);

      return {
        success: true,
        startDate: dto.startDate,
        weekSlots,
        totalSlots,
        tutorsCount: dto.tutorIds.length,
        daysWithSlots: Object.keys(weekSlots).filter((day) => weekSlots[day].length > 0).length,
      };
    } catch (error) {
      this.logger.error('Error generating joint slots for week:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error generando slots conjuntos para la semana',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get joint availability statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully.' })
  @ApiBody({ schema: { example: { tutorIds: ['tutor1Id', 'tutor2Id'] } } })
  @Post('joint/stats')
  async getJointAvailabilityStats(@Body() dto: GetJointAvailabilityStatsDto) {
    try {
      if (!dto.tutorIds || dto.tutorIds.length === 0) {
        throw new HttpException(
          {
            success: false,
            error: 'tutorIds array is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Getting joint availability stats for ${dto.tutorIds.length} tutors`);

      // Get availability for all tutors
      const tutorsAvailability = await this.availabilityService.getMultipleTutorsAvailability(
        dto.tutorIds,
      );

      // Get statistics
      const stats = this.availabilityService.getJointAvailabilityStats(tutorsAvailability);

      // Group by tutor
      const groupedByTutor = this.availabilityService.groupSlotsByTutor(tutorsAvailability);

      return {
        success: true,
        stats,
        tutorsAvailability: groupedByTutor,
      };
    } catch (error) {
      this.logger.error('Error getting joint availability stats:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error obteniendo estadísticas de disponibilidad conjunta',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Generate hourly slots from tutor availabilities' })
  @ApiResponse({ status: 200, description: 'Slots generated successfully.' })
  @ApiBody({ schema: { example: { tutorId: 'tutorId', limit: 100 } } })
  @Post('slots/generate')
  async generateSlots(@Body() dto: GenerateSlotsDto) {
    try {
      if (!dto.tutorId) {
        throw new HttpException(
          {
            success: false,
            error: 'tutorId is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Generating slots for tutor: ${dto.tutorId}`);

      // Get availabilities
      const query: GetAvailabilityDto = {
        tutorId: dto.tutorId,
        limit: dto.limit || 100,
      };

      if (dto.startDate) query.startDate = dto.startDate;
      if (dto.endDate) query.endDate = dto.endDate;

      const availabilities = await this.availabilityService.getAvailabilities(query);

      // Generate slots
      const slots = this.slotService.generateHourlySlotsFromAvailabilities(availabilities);

      // Apply bookings
      const slotsWithBookings = await this.slotService.applySavedBookingsToSlots(slots);

      return {
        success: true,
        slots: slotsWithBookings,
        totalSlots: slotsWithBookings.length,
        availableSlots: this.slotService.getAvailableSlots(slotsWithBookings).length,
        bookedSlots: slotsWithBookings.filter((s) => s.isBooked).length,
      };
    } catch (error) {
      this.logger.error('Error generating slots:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error generando slots',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Generate slots from specific availability IDs' })
  @ApiResponse({ status: 200, description: 'Slots generated successfully.' })
  @ApiBody({ schema: { example: { availabilityIds: ['availabilityId1', 'availabilityId2'] } } })
  @Post('slots/from-availabilities')
  async generateSlotsFromAvailabilities(@Body() dto: GenerateSlotsFromAvailabilitiesDto) {
    try {
      if (!dto.availabilityIds || dto.availabilityIds.length === 0) {
        throw new HttpException(
          {
            success: false,
            error: 'availabilityIds array is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Generating slots from ${dto.availabilityIds.length} availabilities`);

      // Get availabilities by IDs in a batched, optimized way
      const availabilities = await this.availabilityService.getAvailabilitiesByIds(
        dto.availabilityIds,
      );

      if (availabilities.length === 0) {
        throw new HttpException(
          {
            success: false,
            error: 'No valid availabilities found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Generate slots
      const slots = this.slotService.generateHourlySlotsFromAvailabilities(availabilities);

      // Apply bookings
      const slotsWithBookings = await this.slotService.applySavedBookingsToSlots(slots);

      return {
        success: true,
        slots: slotsWithBookings,
        totalSlots: slotsWithBookings.length,
        availableSlots: this.slotService.getAvailableSlots(slotsWithBookings).length,
      };
    } catch (error) {
      this.logger.error('Error generating slots from availabilities:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error generando slots desde disponibilidades',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get available slots (filtered)' })
  @ApiResponse({ status: 200, description: 'Available slots retrieved successfully.' })
  @ApiQuery({ name: 'tutorId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @Get('slots/available')
  async getAvailableSlots(@Query() query: GetAvailabilityDto) {
    try {
      // Get availabilities
      const availabilities = await this.availabilityService.getAvailabilities(query);

      // Generate slots
      const slots = this.slotService.generateHourlySlotsFromAvailabilities(availabilities);

      // Apply bookings
      const slotsWithBookings = await this.slotService.applySavedBookingsToSlots(slots);

      // Filter available slots
      const availableSlots = this.slotService.getAvailableSlots(slotsWithBookings);

      // Group by date
      const groupedByDate = this.slotService.groupSlotsByDate(availableSlots);

      return {
        success: true,
        slots: availableSlots,
        groupedByDate,
        totalSlots: availableSlots.length,
        totalDays: Object.keys(groupedByDate).length,
      };
    } catch (error) {
      this.logger.error('Error getting available slots:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error obteniendo slots disponibles',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Validate a slot for booking' })
  @ApiResponse({ status: 200, description: 'Slot validation result.' })
  @ApiBody({ schema: { example: { parentAvailabilityId: 'availabilityId', slotIndex: 0 } } })
  @Post('slots/validate')
  async validateSlot(@Body() dto: ValidateSlotDto) {
    try {
      // Get availability directly by ID (more efficient)
      const availability = await this.availabilityService.getAvailabilityById(dto.parentAvailabilityId);

      if (!availability) {
        throw new HttpException(
          {
            success: false,
            error: 'Availability not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Generate slots and find the specific one
      const slots = this.slotService.generateHourlySlots(availability);
      const slot = slots.find((s) => s.slotIndex === dto.slotIndex);

      if (!slot) {
        throw new HttpException(
          {
            success: false,
            error: 'Slot not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Apply bookings
      const slotsWithBookings = await this.slotService.applySavedBookingsToSlots([slot]);
      const slotWithBooking = slotsWithBookings[0];

      // Validate
      const validation = this.slotService.validateSlotForBooking(slotWithBooking);

      return {
        success: true,
        isValid: validation.isValid,
        errors: validation.errors,
        slot: slotWithBooking,
      };
    } catch (error) {
      this.logger.error('Error validating slot:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error validando slot',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Check slot availability in real time' })
  @ApiResponse({ status: 200, description: 'Real-time availability check result.' })
  @ApiBody({ schema: { example: { slotId: 'slotId', parentAvailabilityId: 'availabilityId', slotIndex: 0, tutorId: 'tutorId' } } })
  @Post('slots/check-availability')
  async checkSlotAvailability(@Body() dto: CheckSlotAvailabilityDto) {
    try {
      // Get availability directly by ID (more efficient)
      const availability = await this.availabilityService.getAvailabilityById(dto.parentAvailabilityId);

      if (!availability) {
        throw new HttpException(
          {
            success: false,
            error: 'Availability not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Generate slots and find the specific one
      const slots = this.slotService.generateHourlySlots(availability);
      const slot = slots.find((s) => s.slotIndex === dto.slotIndex);

      if (!slot) {
        throw new HttpException(
          {
            success: false,
            error: 'Slot not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Check real-time availability
      const result = await this.slotService.checkSlotAvailabilityRealTime(slot);

      return {
        success: true,
        ...result,
        slot,
      };
    } catch (error) {
      this.logger.error('Error checking slot availability:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error verificando disponibilidad del slot',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get consecutive available slots' })
  @ApiResponse({ status: 200, description: 'Consecutive slots retrieved successfully.' })
  @ApiBody({ schema: { example: { tutorId: 'tutorId', count: 10, startDate: '2099-01-01', endDate: '2099-01-07' } } })
  @Post('slots/consecutive')
  async getConsecutiveSlots(@Body() dto: GetConsecutiveSlotsDto) {
    try {
      if (!dto.tutorId || !dto.count) {
        throw new HttpException(
          {
            success: false,
            error: 'tutorId and count are required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Get availabilities
      const query: GetAvailabilityDto = {
        tutorId: dto.tutorId,
        limit: 1000,
      };

      if (dto.startDate) query.startDate = dto.startDate;
      if (dto.endDate) query.endDate = dto.endDate;

      const availabilities = await this.availabilityService.getAvailabilities(query);

      // Generate slots
      const slots = this.slotService.generateHourlySlotsFromAvailabilities(availabilities);

      // Apply bookings
      const slotsWithBookings = await this.slotService.applySavedBookingsToSlots(slots);

      // Get consecutive slots
      const consecutiveGroups = this.slotService.getConsecutiveAvailableSlots(
        slotsWithBookings,
        dto.count,
      );

      return {
        success: true,
        consecutiveGroups,
        totalGroups: consecutiveGroups.length,
        slotsPerGroup: dto.count,
      };
    } catch (error) {
      this.logger.error('Error getting consecutive slots:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          error: error.message || 'Error obteniendo slots consecutivos',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
