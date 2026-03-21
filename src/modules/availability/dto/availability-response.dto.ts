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
      dto.day = days[start.getDay()];
      dto.startTime = start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      dto.endTime = end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      dto.date = start.toISOString().split('T')[0];
  
      return dto;
    }
  
    static fromEntities(entities: any[]): AvailabilityResponseDto[] {
      return entities.map((e) => this.fromEntity(e));
    }
  }
  