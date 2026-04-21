export interface Availability {
    id?: string;
    tutorId: string; 
    title?: string;
    description?: string;
    location?: string;
    startDateTime: Date;
    endDateTime: Date;
  
    // Google Calendar fields
    googleEventId?: string;
    eventLink?: string;
    recurring?: boolean;
    recurrenceRule?: string;
    sourceCalendarId?: string;
    sourceCalendarName?: string;
  
    // Optional metadata
    course?: string;
    color?: string;
    createdAt: Date;
    updatedAt?: Date;
  }
  
  export interface AvailabilitySlot {
    id?: string;
    parentAvailabilityId: string;
    slotStartTime: Date;
    slotEndTime: Date;
    sessionId?: string;
    createdAt: Date;
    updatedAt?: Date;
  }
  