export class AvailabilityResponseDto {
    id: string;
    googleEventId?: string;
    tutorId?: string;
    title: string;
    description?: string;
    startDateTime: string;
    endDateTime: string;
    location?: string;
    course?: string;
    color?: string;
    recurring: boolean;
    day?: string;
    startTime?: string;
    endTime?: string;
    date?: string;
  
    static fromEntity(entity: any): AvailabilityResponseDto {
      const start =
        entity.startDateTime instanceof Date
          ? entity.startDateTime
          : new Date(entity.startDateTime);
      const end =
        entity.endDateTime instanceof Date ? entity.endDateTime : new Date(entity.endDateTime);
      const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
      const dto = new AvailabilityResponseDto();
      dto.id = entity.id;
      dto.googleEventId = entity.googleEventId;
      dto.tutorId = entity.tutorId;
      dto.title = entity.title;
      dto.description = entity.description;
      dto.startDateTime = start.toISOString();
      dto.endDateTime = end.toISOString();
      dto.location = entity.location;
      dto.course = entity.course;
      dto.color = entity.color;
      dto.recurring = entity.recurring;
      dto.day = days[start.getUTCDay()];
      // Use UTC time for consistency
      dto.startTime = `${String(start.getUTCHours()).padStart(2, '0')}:${String(start.getUTCMinutes()).padStart(2, '0')}`;
      dto.endTime = `${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')}`;
      dto.date = start.toISOString().split('T')[0];
  
      return dto;
    }
  
    static fromEntities(entities: any[]): AvailabilityResponseDto[] {
      return entities.map((e) => this.fromEntity(e));
    }
  }
  