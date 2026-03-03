import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CalicoCalendarService } from './calico-calendar.service';
import { CreateTutoringEventDto } from './dto/create-tutoring-event.dto';
import { UpdateTutoringEventDto } from './dto/update-tutoring-event.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';

@ApiTags('Calico Calendar')
@Controller('calico-calendar')
export class CalicoCalendarController {
  private readonly logger = new Logger(CalicoCalendarController.name);

  constructor(private readonly calicoCalendarService: CalicoCalendarService) {}

  @ApiOperation({ summary: 'Check if Calico Calendar service is configured' })
  @ApiResponse({ status: 200, description: 'Service configuration status' })
  @Get('status')
  getStatus() {
    const configured = this.calicoCalendarService.isConfigured();
    return {
      configured,
      message: configured
        ? 'Calico Calendar service is ready'
        : 'Calico Calendar service is not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY and CALICO_CALENDAR_ID in .env',
    };
  }

  @ApiOperation({ summary: 'Create a tutoring session event in Calico central calendar' })
  @ApiResponse({ status: 201, description: 'Event created successfully' })
  @ApiBody({ type: CreateTutoringEventDto })
  @Post('tutoring-session')
  async createTutoringSessionEvent(@Body() createDto: CreateTutoringEventDto) {
    try {
      this.logger.log(`Creating tutoring session event: ${createDto.summary}`);

      // Pass date strings directly — the service accepts Date | string
      const result = await this.calicoCalendarService.createTutoringSessionEvent({
        ...createDto,
        attendees: createDto.attendees ?? [],
      });

      return { message: 'Evento de sesión de tutoría creado exitosamente', ...result };
    } catch (error) {
      this.logger.error('Error creating tutoring session event:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { error: error.message ?? 'Error creando evento de sesión de tutoría' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Get a tutoring session event by ID' })
  @ApiResponse({ status: 200, description: 'Event retrieved successfully' })
  @ApiParam({ name: 'eventId', description: 'Google Calendar event ID' })
  @Get('tutoring-session/:eventId')
  async getTutoringSessionEvent(@Param('eventId') eventId: string) {
    try {
      return await this.calicoCalendarService.getTutoringSessionEvent(eventId);
    } catch (error) {
      this.logger.error('Error getting tutoring session event:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { error: error.message ?? 'Error obteniendo evento' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Update a tutoring session event' })
  @ApiResponse({ status: 200, description: 'Event updated successfully' })
  @ApiParam({ name: 'eventId', description: 'Google Calendar event ID' })
  @ApiBody({ type: UpdateTutoringEventDto })
  @Put('tutoring-session/:eventId')
  async updateTutoringSessionEvent(
    @Param('eventId') eventId: string,
    @Body() updateDto: UpdateTutoringEventDto,
  ) {
    try {
      this.logger.log(`Updating tutoring session event: ${eventId}`);

      // Pass DTO directly — service accepts Date | string for both date fields
      const result = await this.calicoCalendarService.updateTutoringSessionEvent(eventId, updateDto);

      return { message: 'Evento actualizado exitosamente', ...result };
    } catch (error) {
      this.logger.error('Error updating tutoring session event:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { error: error.message ?? 'Error actualizando evento' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Cancel a tutoring session event (marks as cancelled)' })
  @ApiResponse({ status: 200, description: 'Event cancelled successfully' })
  @ApiParam({ name: 'eventId', description: 'Google Calendar event ID' })
  @ApiQuery({ name: 'reason', required: false, description: 'Cancellation reason' })
  @Post('tutoring-session/:eventId/cancel')
  async cancelTutoringSessionEvent(@Param('eventId') eventId: string, @Query('reason') reason?: string) {
    try {
      this.logger.log(`Cancelling tutoring session event: ${eventId}`);

      const result = await this.calicoCalendarService.cancelTutoringSessionEvent(
        eventId,
        reason ?? 'Sesión cancelada',
      );

      return { message: 'Evento cancelado exitosamente', ...result };
    } catch (error) {
      this.logger.error('Error cancelling tutoring session event:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { error: error.message ?? 'Error cancelando evento' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Delete a tutoring session event completely' })
  @ApiResponse({ status: 200, description: 'Event deleted successfully' })
  @ApiParam({ name: 'eventId', description: 'Google Calendar event ID' })
  @Delete('tutoring-session/:eventId')
  async deleteTutoringSessionEvent(@Param('eventId') eventId: string) {
    try {
      this.logger.log(`Deleting tutoring session event: ${eventId}`);

      const result = await this.calicoCalendarService.deleteTutoringSessionEvent(eventId);

      return { message: 'Evento eliminado exitosamente', ...result };
    } catch (error) {
      this.logger.error('Error deleting tutoring session event:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { error: error.message ?? 'Error eliminando evento' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
