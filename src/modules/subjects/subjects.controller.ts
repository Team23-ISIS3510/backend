import { Controller, Get, Query, Param } from '@nestjs/common';
import { SubjectsService } from './subjects.service';

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  /**
   * Obtiene el historial de todas las materias dictadas en los últimos 5 meses
   * GET /subjects/history
   */
  @Get('history')
  async getSubjectsHistory() {
    return await this.subjectsService.getSubjectsHistory();
  }

  /**
   * Obtiene el historial de materias de un tutor específico en los últimos 5 meses
   * GET /subjects/history/tutor/:tutorId
   */
  @Get('history/tutor/:tutorId')
  async getSubjectsHistoryByTutor(@Param('tutorId') tutorId: string) {
    return await this.subjectsService.getSubjectsHistoryByTutor(tutorId);
  }

  /**
   * Obtiene el historial de materias por rango de fechas
   * GET /subjects/history/range?startDate=2024-01-01&endDate=2024-12-31
   */
  @Get('history/range')
  async getSubjectsHistoryByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new Error('Las fechas de inicio y fin son requeridas');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Formato de fecha inválido. Use ISO 8601 (YYYY-MM-DD)');
    }

    return await this.subjectsService.getSubjectsHistoryByDateRange(start, end);
  }
}
