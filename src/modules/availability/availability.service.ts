import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AvailabilityRepository } from './availability.repository';
import { GetAvailabilityDto } from '../availability/dto/get-availability.dto';
import { AvailabilityResponseDto } from '../availability/dto/availability-response.dto';
import { Availability } from '../availability/entities/availability.entity';
import { CalendarService } from '../../modules/calendar/calendar.service';
import { SlotService } from '../../modules/availability/slot.service';
import { Slot } from '../../modules/availability/slot.service';
import { AvailabilityOccupancyUpdateService } from './availability-occupancy-update.service';

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    private readonly availabilityRepository: AvailabilityRepository,
    private readonly calendarService: CalendarService,
    private readonly slotService: SlotService,
    private readonly occupancyUpdateService: AvailabilityOccupancyUpdateService,
  ) {}

  async getAvailabilityById(id: string): Promise<AvailabilityResponseDto | null> {
    try {
      const availability = await this.availabilityRepository.findById(id);
      if (!availability) {
        return null;
      }
      return AvailabilityResponseDto.fromEntity(availability);
    } catch (error) {
      this.logger.error(`Error getting availability by ID ${id}:`, error);
      return null;
    }
  }

  async getAvailabilities(query: GetAvailabilityDto): Promise<AvailabilityResponseDto[]> {
    const { tutorId, course, startDate, endDate, limit } = query;

    let availabilities: Availability[] = [];

    try {
      if (tutorId && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const effectiveLimit = limit ?? 200;
        availabilities = await this.availabilityRepository.findByTutorAndDateRange(
          tutorId,
          start,
          end,
          effectiveLimit,
        );
      } else if (tutorId) {
        // Get availabilities for specific tutor
        availabilities = await this.availabilityRepository.findByTutor(tutorId, limit);
      } else if (course) {
        // Get availabilities by course
        availabilities = await this.availabilityRepository.findByCourse(course, limit);
      } else if (startDate && endDate) {
        // Get availabilities in date range
        const start = new Date(startDate);
        const end = new Date(endDate);
        availabilities = await this.availabilityRepository.findInDateRange(start, end, limit);
      } else {
        // Get availabilities for next week by default
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        availabilities = await this.availabilityRepository.findInDateRange(now, nextWeek, limit);
      }

      this.logger.log(`Found ${availabilities.length} availabilities`);
      return AvailabilityResponseDto.fromEntities(availabilities);
    } catch (error) {
      this.logger.error('Error fetching availabilities:', error);
      throw error;
    }
  }

  async getAvailabilitiesByIds(ids: string[]): Promise<AvailabilityResponseDto[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    try {
      const entities = await this.availabilityRepository.findByIds(ids);
      return AvailabilityResponseDto.fromEntities(entities);
    } catch (error) {
      this.logger.error('Error getting availabilities by IDs:', error);
      throw error;
    }
  }

  async getAvailabilityEntityById(googleEventId: string): Promise<Availability | null> {
    try {
      return await this.availabilityRepository.findById(googleEventId);
    } catch (error) {
      this.logger.error(`Error getting availability entity by ID ${googleEventId}:`, error);
      throw error;
    }
  }

  async checkEventExists(googleEventId: string): Promise<boolean> {
    try {
      return await this.availabilityRepository.exists(googleEventId);
    } catch (error) {
      this.logger.error(`Error checking if event ${googleEventId} exists:`, error);
      throw error;
    }
  }

  async saveAvailability(
    googleEventId: string,
    availabilityData: Partial<Availability>,
  ): Promise<string> {
    try {
      const id = await this.availabilityRepository.save(googleEventId, availabilityData);
      this.logger.log(`Availability saved to Firebase: ${googleEventId}`);
      return id;
    } catch (error) {
      this.logger.error('Error saving availability:', error);
      throw error;
    }
  }

  async createAvailability(createDto: any): Promise<AvailabilityResponseDto> {
    try {
      const { tutorId, title, date, startTime, endTime, location, description, course } = createDto;

      // Validations
      if (!tutorId || !title || !date || !startTime || !endTime) {
        throw new Error('Missing required fields: tutorId, title, date, startTime, endTime');
      }

      if (startTime >= endTime) {
        throw new Error('Start time must be before end time');
      }

      // Parse times
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);

      if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
        throw new Error('Invalid time format. Use HH:MM');
      }

      // Create DateTime objects
      const startDateTime = new Date(`${date}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00Z`);
      const endDateTime = new Date(`${date}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00Z`);

      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        throw new Error('Invalid date format. Use YYYY-MM-DD');
      }

      // Create availability object
      const availabilityData: Partial<Availability> = {
        tutorId,
        title,
        startDateTime,
        endDateTime,
        location,
        description,
        course,
        recurring: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save to Firebase (without googleEventId for now)
      const id = await this.availabilityRepository.save(undefined, availabilityData);
      this.logger.log(`Availability created: ${id}`);

      // Fetch and return the created availability
      const created = await this.availabilityRepository.findById(id);
      if (!created) {
        throw new Error('Failed to retrieve created availability');
      }

      return AvailabilityResponseDto.fromEntity(created);
    } catch (error) {
      this.logger.error('Error creating availability:', error);
      throw error;
    }
  }

  async deleteAvailability(googleEventId: string): Promise<void> {
    try {
      await this.availabilityRepository.delete(googleEventId);
      this.logger.log(`Availability deleted from Firebase: ${googleEventId}`);
    } catch (error) {
      this.logger.error('Error deleting availability:', error);
      throw error;
    }
  }

  async updateAvailability(
    availabilityId: string,
    updateData: any,
  ): Promise<AvailabilityResponseDto> {
    try {
      // Get current availability
      const current = await this.availabilityRepository.findById(availabilityId);
      if (!current) {
        throw new Error(`Availability with ID ${availabilityId} not found`);
      }

      // Prepare update payload
      const updatePayload: any = {
        ...current,
      };

      // Update title if provided
      if (updateData.title) {
        updatePayload.title = updateData.title;
      }

      // Update date and times if provided
      if (updateData.date || updateData.startTime || updateData.endTime) {
        const date = updateData.date || current.startDateTime.toISOString().split('T')[0];
        const startTime = updateData.startTime || current.startDateTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const endTime = updateData.endTime || current.endDateTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        // Validate times
        if (startTime >= endTime) {
          throw new Error('Start time must be before end time');
        }

        // Parse times
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        const startDateTime = new Date(`${date}T${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00Z`);
        const endDateTime = new Date(`${date}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00Z`);

        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
          throw new Error('Invalid date/time format');
        }

        updatePayload.startDateTime = startDateTime;
        updatePayload.endDateTime = endDateTime;
      }

      // Update optional fields
      if (updateData.location !== undefined) {
        updatePayload.location = updateData.location;
      }

      if (updateData.description !== undefined) {
        updatePayload.description = updateData.description;
      }

      if (updateData.course !== undefined) {
        updatePayload.course = updateData.course;
      }

      // Update in repository
      await this.availabilityRepository.save(availabilityId, updatePayload);
      this.logger.log(`Availability updated: ${availabilityId}`);

      // Return updated availability
      const updated = await this.availabilityRepository.findById(availabilityId);
      return AvailabilityResponseDto.fromEntity(updated);
    } catch (error) {
      this.logger.error('Error updating availability:', error);
      throw error;
    }
  }


  async syncAvailabilities(
    tutorId: string,
    accessToken: string,
    calendarId?: string,
  ): Promise<{
    created: number;
    updated: number;
    errors: Array<{ eventId?: string; error: string }>;
    totalProcessed: number;
  }> {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as Array<{ eventId?: string; error: string }>,
      totalProcessed: 0,
    };

    try {


      // Check connection
      if (!accessToken || accessToken.trim() === '') {
        throw new Error('No hay conexión activa con Google Calendar. Por favor, conecta tu calendario primero.');
      }

      this.logger.log(`Starting sync process for tutor: ${tutorId}`);

      // Get calendars
      let calendars: any[] = [];
      try {
        calendars = await this.calendarService.listCalendars(accessToken);
        this.logger.log(`Found ${calendars.length} calendars`);
      } catch (error) {
        this.logger.error('Error listing calendars:', error);
        throw new Error('Error de conexión con Google Calendar: No se pudieron obtener los calendarios.');
      }

      // If specific calendarId provided, use only that calendar
      const calendarsToSync = calendarId
        ? calendars.filter((cal) => cal.id === calendarId)
        : calendars;

      if (calendarsToSync.length === 0) {
        throw new Error('No se encontraron calendarios para sincronizar.');
      }

      // Get events from all calendars
      const now = new Date();
      const timeMin = now.toISOString();
      // Sync next 3 months
      const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

      for (const calendar of calendarsToSync) {
        try {
          this.logger.log(`Syncing calendar: ${calendar.summary || calendar.id}`);
          const events = await this.calendarService.listEvents(
            accessToken,
            calendar.id,
            timeMin,
            timeMax,
          );

          this.logger.log(
            `Found ${events.length} events in calendar ${calendar.summary || calendar.id}`,
          );

          // Preload existing availabilities for all events in this calendar to avoid one query per event
          const calendarEventIds = events
            .map((event) => event.id)
            .filter((id): id is string => Boolean(id));

          let existingCalendarEvents = new Set<string>();

          if (calendarEventIds.length > 0) {
            try {
              const existingAvailabilities =
                await this.availabilityRepository.findByIds(calendarEventIds);
              existingAvailabilities.forEach((availability) => {
                if (availability.googleEventId) {
                  existingCalendarEvents.add(availability.googleEventId);
                } else if (availability.id) {
                  existingCalendarEvents.add(availability.id);
                }
              });
            } catch (error) {
              this.logger.warn(
                `Error checking existing events for calendar ${calendar.id}:`,
                error instanceof Error ? error.message : error,
              );
            }
          }

          for (const event of events) {
            try {
              results.totalProcessed++;

              // Skip events without start/end times
              if (!event.start || !event.end) {
                continue;
              }

              // Parse event dates
              const startDateTime = event.start.dateTime
                ? new Date(event.start.dateTime)
                : event.start.date
                  ? new Date(event.start.date)
                  : null;
              const endDateTime = event.end.dateTime
                ? new Date(event.end.dateTime)
                : event.end.date
                  ? new Date(event.end.date)
                  : null;

              if (!startDateTime || !endDateTime) {
                continue;
              }

              const alreadyExists =
                Boolean(event.id) && existingCalendarEvents.has(event.id as string);

              const availabilityData: Partial<Availability> = {
                tutorId,
                title: event.summary || 'Sin título',
                startDateTime,
                endDateTime,
                googleEventId: event.id ?? undefined,
                recurring: !!event.recurrence && event.recurrence.length > 0,
                sourceCalendarId: calendar.id,
                sourceCalendarName: calendar.summary || calendar.id,
              };

              // Only add optional fields if they have values (avoid undefined)
              if (event.location) {
                availabilityData.location = event.location;
              }
              if (event.htmlLink) {
                availabilityData.eventLink = event.htmlLink;
              }
              if (event.recurrence && event.recurrence.length > 0) {
                availabilityData.recurrenceRule = event.recurrence.join(';');
              }
              if (event.summary) {
                availabilityData.course = event.summary;
              }

              if (alreadyExists) {
                // Update existing
                await this.availabilityRepository.save(event.id ?? undefined, availabilityData);
                results.updated++;
                this.logger.debug(`Updated availability: ${event.id}`);
              } else {
                // Create new
                await this.availabilityRepository.save(event.id ?? undefined, availabilityData);
                results.created++;
                this.logger.debug(`Created availability: ${event.id}`);
              }
            } catch (error) {
              this.logger.error(`Error processing event ${event.id}:`, error);
              results.errors.push({
                eventId: event.id ?? undefined,
                error: error.message || 'Error procesando evento',
              });
            }
          }
        } catch (error) {
          this.logger.error(`Error syncing calendar ${calendar.id}:`, error);
          results.errors.push({
            error: `Error sincronizando calendario ${calendar.summary || calendar.id}: ${error.message}`,
          });
        }
      }

      this.logger.log(
        `Sync completed: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`,
      );

      return results;
    } catch (error) {
      this.logger.error('Error syncing availabilities:', error);
      throw error;
    }
  }

  async syncWithRetry(
    tutorId: string,
    accessToken: string,
    calendarId?: string,
    maxRetries: number = 3,
  ): Promise<{
    created: number;
    updated: number;
    errors: Array<{ eventId?: string; error: string }>;
    totalProcessed: number;
  }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`Sync attempt ${attempt}/${maxRetries} for tutor: ${tutorId}`);
        return await this.syncAvailabilities(tutorId, accessToken, calendarId);
      } catch (error) {
        lastError = error;
        this.logger.warn(`Sync attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError || new Error('Sync failed after all retries');
  }

  /**
   * Intelligent sync - only syncs new events, skips existing ones
   */
  async intelligentSync(
    tutorId: string,
    accessToken: string,
    calendarName: string = 'Disponibilidad',
    daysAhead: number = 30,
  ): Promise<{
    synced: number;
    skipped: number;
    updated: number;
    errors: number;
    message: string;
    calendarFound: boolean;
  }> {
    try {
      this.logger.log(`Starting intelligent sync for tutor: ${tutorId}`);

      // Get calendars
      const calendars = await this.calendarService.listCalendars(accessToken);

      // Find specific calendar by name if provided (e.g., "Disponibilidad")
      let targetCalendar: any = null;
      if (calendarName) {
        targetCalendar = calendars.find(
          (cal) => cal.summary?.toLowerCase() === calendarName.toLowerCase() || calendarName.toLowerCase().includes(cal.summary?.toLowerCase() || '') || cal.summary?.toLowerCase()?.includes(calendarName.toLowerCase()),
        );
        if (!targetCalendar) {
          return {
            synced: 0,
            skipped: 0,
            updated: 0,
            errors: 0,
            message: `No se encontró un calendario llamado "${calendarName}". Por favor, crea uno.`,
            calendarFound: false,
          };
        }
      } else {
        // Use primary calendar if no name specified
        targetCalendar = calendars.find((cal) => cal.primary) || calendars[0];
      }

      if (!targetCalendar) {
        throw new Error('No se encontraron calendarios para sincronizar.');
      }

      // Get events from the target calendar
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

      const events = await this.calendarService.listEvents(
        accessToken,
        targetCalendar.id,
        timeMin,
        timeMax,
      );

      // Filter valid events
      const availabilityEvents = events.filter((event) => {
        return event.summary && (event.start?.dateTime || event.start?.date);
      });

      this.logger.log(`Found ${availabilityEvents.length} valid events in calendar ${targetCalendar.summary}`);

      if (availabilityEvents.length === 0) {
        return {
          synced: 0,
          skipped: 0,
          updated: 0,
          errors: 0,
          message: 'No hay eventos válidos para sincronizar',
          calendarFound: true,
        };
      }

      // Check which events already exist in Firebase
      const eventIds = availabilityEvents
        .map((event) => event.id)
        .filter((id): id is string => Boolean(id));

      const existingEvents = new Set<string>();

      if (eventIds.length > 0) {
        try {
          const existingAvailabilities = await this.availabilityRepository.findByIds(eventIds);
          existingAvailabilities.forEach((availability) => {
            if (availability.googleEventId) {
              existingEvents.add(availability.googleEventId);
            } else if (availability.id) {
              existingEvents.add(availability.id);
            }
          });
        } catch (error) {
          this.logger.warn('Error checking existing events in bulk:', error instanceof Error ? error.message : error);
        }
      }

      this.logger.log(`${existingEvents.size} events already exist in Firebase`);

      // Filter only new events
      const newEvents = availabilityEvents.filter((event) => !existingEvents.has(event.id as string));

      if (newEvents.length === 0) {
        return {
          synced: 0,
          skipped: existingEvents.size,
          updated: 0,
          errors: 0,
          message: 'Todos los eventos ya están sincronizados',
          calendarFound: true,
        };
      }

      // Sync only new events
      const syncResult = await this.syncSpecificEvents(tutorId, accessToken, newEvents, targetCalendar.id);

      return {
        synced: syncResult.created,
        skipped: existingEvents.size,
        updated: syncResult.updated,
        errors: syncResult.errors.length,
        message: `Sincronizados ${syncResult.created} eventos nuevos, ${existingEvents.size} ya existían`,
        calendarFound: true,
      };
    } catch (error) {
      this.logger.error('Error in intelligent sync:', error);
      throw error;
    }
  }

  /**
   * Sync specific events provided in the array
   */
  async syncSpecificEvents(
    tutorId: string,
    accessToken: string,
    events: any[],
    calendarId?: string,
  ): Promise<{
    created: number;
    updated: number;
    errors: Array<{ eventId?: string; error: string }>;
    totalProcessed: number;
  }> {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as Array<{ eventId?: string; error: string }>,
      totalProcessed: 0,
    };

    // If calendarId not provided, get it from the first event or use primary
    let targetCalendarId = calendarId;
    if (!targetCalendarId) {
      try {
        const calendars = await this.calendarService.listCalendars(accessToken);
        const primary = calendars.find((cal) => cal.primary) || calendars[0];
        targetCalendarId = primary?.id ?? undefined;
        if (!targetCalendarId) {
          throw new Error('No se pudo determinar el calendario a usar');
        }
      } catch (error) {
        throw new Error(`Error obteniendo calendario: ${error.message}`);
      }
    }

    for (const event of events) {
      try {
        results.totalProcessed++;

        // Skip events without start/end times
        if (!event.start || !event.end) {
          continue;
        }

        // Parse event dates
        const startDateTime = event.start.dateTime
          ? new Date(event.start.dateTime)
          : event.start.date
            ? new Date(event.start.date)
            : null;
        const endDateTime = event.end.dateTime
          ? new Date(event.end.dateTime)
          : event.end.date
            ? new Date(event.end.date)
            : null;

        if (!startDateTime || !endDateTime) {
          continue;
        }

        // Check if event already exists
        const existingAvailability = await this.availabilityRepository.findById(event.id);

        const availabilityData: Partial<Availability> = {
          tutorId,
          title: event.summary || 'Sin título',
          startDateTime,
          endDateTime,
          googleEventId: event.id ?? undefined,
          recurring: !!event.recurrence && event.recurrence.length > 0,
          sourceCalendarId: targetCalendarId,
        };

        // Only add optional fields if they have values (avoid undefined)
        if (event.location) {
          availabilityData.location = event.location;
        }
        if (event.htmlLink) {
          availabilityData.eventLink = event.htmlLink;
        }
        if (event.recurrence && event.recurrence.length > 0) {
          availabilityData.recurrenceRule = event.recurrence.join(';');
        }
        if (event.organizer?.displayName) {
          availabilityData.sourceCalendarName = event.organizer.displayName;
        }
        if (event.summary) {
          availabilityData.course = event.summary;
        }

        if (existingAvailability) {
          // Update existing
          await this.availabilityRepository.save(event.id ?? undefined, availabilityData);
          results.updated++;
          this.logger.debug(`Updated availability: ${event.id}`);
        } else {
          // Create new
          await this.availabilityRepository.save(event.id ?? undefined, availabilityData);
          results.created++;
          this.logger.debug(`Created availability: ${event.id}`);
        }
      } catch (error) {
        this.logger.error(`Error processing event ${event.id}:`, error);
        results.errors.push({
          eventId: event.id ?? undefined,
          error: error.message || 'Error procesando evento',
        });
      }
    }

    return results;
  }

  /**
   * Create availability event in Google Calendar and Firebase
   */
  async createAvailabilityEvent(
    tutorId: string,
    accessToken: string,
    eventData: {
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      location?: string;
      description?: string;
      calendarId?: string;
      course?: string;
    },
  ): Promise<{ event: any; availabilityId: string }> {
    try {
      // Validate event data
      const validation = this.validateEventData(eventData);
      if (!validation.isValid) {
        throw new Error(`Datos inválidos: ${validation.errors.join(', ')}`);
      }

      // Get calendar ID
      let calendarId = eventData.calendarId;
      if (!calendarId) {
        const calendars = await this.calendarService.listCalendars(accessToken);
        // Try to find "Disponibilidad" calendar first
        const disponibilidadCalendar = calendars.find(
          (cal) => cal.summary?.toLowerCase() === 'disponibilidad',
        );
        calendarId = disponibilidadCalendar?.id ?? calendars.find((cal) => cal.primary)?.id ?? calendars[0]?.id ?? undefined;
        if (!calendarId) {
          throw new Error('No se pudo determinar el calendario a usar');
        }
      }

      // Build event date/time
      const startDateTime = new Date(`${eventData.date}T${eventData.startTime}`);
      const endDateTime = new Date(`${eventData.date}T${eventData.endTime}`);

      // Create event in Google Calendar
      const googleEvent = {
        summary: eventData.title,
        description: eventData.description || '',
        location: eventData.location || '',
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };

      const createdEvent = await this.calendarService.createEvent(accessToken, calendarId, googleEvent);

      // Save to Firebase
      const availabilityData: Partial<Availability> = {
        tutorId,
        title: eventData.title,
        startDateTime,
        endDateTime,
        googleEventId: createdEvent.id ?? undefined,
        recurring: false,
        sourceCalendarId: calendarId,
        course: eventData.course || eventData.title,
      };

      // Only add optional fields if they have values (avoid undefined)
      if (eventData.location) {
        availabilityData.location = eventData.location;
      }
      if (createdEvent.htmlLink) {
        availabilityData.eventLink = createdEvent.htmlLink;
      }

      const availabilityId = await this.availabilityRepository.save(createdEvent.id ?? undefined, availabilityData);

      this.logger.log(`Created availability event: ${createdEvent.id}`);

      // === TRIGGER OCCUPANCY UPDATE ===
      // When a new availability is created, recalculate all occupancies for this tutor
      try {
        await this.occupancyUpdateService.onAvailabilityCreated(tutorId);
      } catch (error) {
        this.logger.warn(
          `Failed to update occupancy for availability ${availabilityId}. Continuing anyway.`,
          error,
        );
        // Don't throw - availability creation succeeded, occupancy update is secondary
      }

      return {
        event: createdEvent,
        availabilityId,
      };
    } catch (error) {
      this.logger.error('Error creating availability event:', error);
      throw error;
    }
  }

  /**
   * Delete availability event from Google Calendar and Firebase
   */
  async deleteAvailabilityEvent(
    accessToken: string,
    googleEventId: string,
    calendarId?: string,
  ): Promise<void> {
    try {
      // Get calendar ID if not provided
      let targetCalendarId = calendarId;
      if (!targetCalendarId) {
        const availability = await this.availabilityRepository.findById(googleEventId);
        if (availability?.sourceCalendarId) {
          targetCalendarId = availability.sourceCalendarId;
        } else {
          const calendars = await this.calendarService.listCalendars(accessToken);
          targetCalendarId = calendars.find((cal) => cal.primary)?.id ?? calendars[0]?.id ?? undefined;
        }
      }

      if (!targetCalendarId) {
        throw new Error('No se pudo determinar el calendario');
      }

      // Delete from Google Calendar
      await this.calendarService.deleteEvent(accessToken, targetCalendarId, googleEventId);

      // Delete from Firebase
      await this.availabilityRepository.delete(googleEventId);

      this.logger.log(`Deleted availability event: ${googleEventId}`);
    } catch (error) {
      this.logger.error('Error deleting availability event:', error);
      throw error;
    }
  }

  /**
   * Validate event data before creation
   */
  validateEventData(eventData: {
    date?: string;
    startTime?: string;
    endTime?: string;
  }): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!eventData.date) {
      errors.push('La fecha es requerida');
    }

    if (!eventData.startTime) {
      errors.push('La hora de inicio es requerida');
    }

    if (!eventData.endTime) {
      errors.push('La hora de fin es requerida');
    }

    if (eventData.startTime && eventData.endTime) {
      const startTime = new Date(`2000-01-01T${eventData.startTime}`);
      const endTime = new Date(`2000-01-01T${eventData.endTime}`);

      if (endTime <= startTime) {
        errors.push('La hora de fin debe ser posterior a la hora de inicio');
      }
    }

    if (eventData.date) {
      const selectedDate = new Date(eventData.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate < today) {
        errors.push('No se puede crear un evento en una fecha pasada');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get availability for multiple tutors
   */
  async getMultipleTutorsAvailability(tutorIds: string[], startDate?: string, endDate?: string, limit: number = 100) {
    try {
      this.logger.log(`Getting availability for ${tutorIds.length} tutors`);

      const availabilityPromises = tutorIds.map(async (id) => {
        try {
          const query: GetAvailabilityDto = {
            tutorId: id,
            limit,
          };

          if (startDate) query.startDate = startDate;
          if (endDate) query.endDate = endDate;

          const availabilities = await this.getAvailabilities(query);

          return {
            tutorId: id,
            slots: availabilities,
            connected: true,
            error: null,
            totalSlots: availabilities.length,
          };
        } catch (error: any) {
          this.logger.warn(`Error loading availability for ${id}:`, error);
          return {
            tutorId: id,
            slots: [],
            connected: false,
            error: error.message || 'Error loading availability',
            totalSlots: 0,
          };
        }
      });

      const results = await Promise.all(availabilityPromises);
      this.logger.log(`Loaded availability for ${results.length} tutors`);

      return results;
    } catch (error: any) {
      this.logger.error('Error getting multiple tutors availability:', error);
      throw error;
    }
  }

  /**
   * Generate joint slots for a specific day
   * Uses SlotService to generate hourly slots and then groups them by time
   */
  generateJointSlotsForDay(tutorsAvailability: any[], selectedDate: Date | string) {
    const date = typeof selectedDate === 'string' ? new Date(selectedDate) : selectedDate;
    const dayString = date.toISOString().split('T')[0];
    const timeSlotMap = new Map<string, any>();

    // Generate all hourly slots from all tutors' availabilities using SlotService
    const allHourlySlots: Slot[] = [];
    tutorsAvailability.forEach(({ tutorId, slots }) => {
      // slots are AvailabilityResponseDto[], convert to hourly slots using SlotService
      const hourlySlots = this.slotService.generateHourlySlotsFromAvailabilities(slots);
      allHourlySlots.push(...hourlySlots);
    });

    // Filter slots for the selected day and group by time
    allHourlySlots.forEach((slot) => {
      const slotDate = new Date(slot.startDateTime);
      if (isNaN(slotDate.getTime())) {
        return; // Skip invalid dates
      }
      const slotDayString = slotDate.toISOString().split('T')[0];

      if (slotDayString === dayString) {
        const startTime = this.slotService.extractTimeFromDateTime(slot.startDateTime);
        if (!startTime) return;

        // Extract hour from time (e.g., "14:30:00" -> "14:00")
        const hour = startTime.substring(0, 2);
        const timeSlot = `${hour}:00`;
        const key = `${dayString}_${timeSlot}`;

        if (!timeSlotMap.has(key)) {
          timeSlotMap.set(key, {
            date: dayString,
            time: timeSlot,
            tutors: [],
            originalSlots: [],
          });
        }

        const slotInfo = timeSlotMap.get(key);
        slotInfo.tutors.push({
          id: slot.tutorId,
          slotId: slot.id,
          course: slot.course,
          location: slot.location,
        });
        slotInfo.originalSlots.push(slot);
      }
    });

    // Convert to array and sort by time
    const jointSlots = Array.from(timeSlotMap.values()).sort((a, b) =>
      a.time.localeCompare(b.time),
    );

    return jointSlots;
  }

  /**
   * Generate joint slots for a week
   */
  generateJointSlotsForWeek(tutorsAvailability: any[], startDate: Date | string) {
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const weekSlots: Record<string, any[]> = {};

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);

      const daySlots = this.generateJointSlotsForDay(tutorsAvailability, currentDate);
      const dayString = currentDate.toISOString().split('T')[0];

      weekSlots[dayString] = daySlots;
    }

    return weekSlots;
  }

  /**
   * Get joint availability statistics
   */
  getJointAvailabilityStats(tutorsAvailability: any[]) {
    const totalTutors = tutorsAvailability.length;
    const connectedTutors = tutorsAvailability.filter((t) => t.connected).length;
    const totalSlots = tutorsAvailability.reduce((acc, t) => acc + t.slots.length, 0);
    const tutorsWithSlots = tutorsAvailability.filter((t) => t.slots.length > 0).length;

    return {
      totalTutors,
      connectedTutors,
      totalSlots,
      tutorsWithSlots,
      averageSlotsPerTutor: totalTutors > 0 ? Math.round(totalSlots / totalTutors) : 0,
    };
  }

  /**
   * Filter future slots (exclude past dates)
   */
  filterFutureSlots(slots: any[]) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().substring(0, 5);

    return slots.filter((slot) => {
      const slotDate = slot.date || (slot.startDateTime ? new Date(slot.startDateTime).toISOString().split('T')[0] : null);
      const slotTime = slot.time || slot.startTime || this.slotService.extractTimeFromDateTime(slot.startDateTime);

      if (!slotDate) return false;
      if (slotDate > today) return true;
      if (slotDate === today && slotTime && slotTime >= currentTime) return true;
      return false;
    });
  }

  /**
   * Group slots by tutor
   */
  groupSlotsByTutor(tutorsAvailability: any[]) {
    const grouped: Record<string, any> = {};

    tutorsAvailability.forEach(({ tutorId, slots, connected, error }) => {
      grouped[tutorId] = {
        slots: this.filterFutureSlots(slots),
        connected,
        error,
        totalSlots: slots.length,
      };
    });

    return grouped;
  }

}
