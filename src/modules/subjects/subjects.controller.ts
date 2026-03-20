import { Controller, Get, Query, Param } from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

@ApiTags('Subjects')
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  /**
   * Obtiene el historial de todas las materias dictadas en los últimos 5 meses
   * GET /subjects/history
   */
  @ApiOperation({
    summary: 'Obtener historial de todas las materias',
    description: 'Retorna el historial de todas las materias dictadas en los últimos 5 meses',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de materias obtenido exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'subject_123' },
          name: { type: 'string', example: 'Cálculo I' },
          code: { type: 'string', example: 'MATH101' },
          count: { type: 'number', example: 15 },
          lastTaught: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  @Get('history')
  async getSubjectsHistory() {
    return await this.subjectsService.getSubjectsHistory();
  }

  /**
   * Obtiene el historial de materias de un tutor específico en los últimos 5 meses
   * GET /subjects/history/tutor/:tutorId
   */
  @ApiOperation({
    summary: 'Obtener historial de materias por tutor',
    description: 'Retorna el historial de materias de un tutor específico dictadas en los últimos 5 meses',
  })
  @ApiParam({
    name: 'tutorId',
    description: 'ID único del tutor',
    example: 'tutor_123',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de materias del tutor obtenido exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'subject_123' },
          name: { type: 'string', example: 'Cálculo I' },
          code: { type: 'string', example: 'MATH101' },
          count: { type: 'number', example: 8 },
          lastTaught: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Tutor no encontrado',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  @Get('history/tutor/:tutorId')
  async getSubjectsHistoryByTutor(@Param('tutorId') tutorId: string) {
    return await this.subjectsService.getSubjectsHistoryByTutor(tutorId);
  }

  /**
   * Obtiene el historial de materias por rango de fechas
   * GET /subjects/history/range?startDate=2024-01-01&endDate=2024-12-31
   */
  @ApiOperation({
    summary: 'Obtener historial de materias por rango de fechas',
    description: 'Retorna el historial de materias dictadas dentro de un rango de fechas específico. Las fechas deben estar en formato ISO 8601 (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'startDate',
    description: 'Fecha de inicio en formato ISO 8601 (YYYY-MM-DD)',
    example: '2024-01-01',
    required: true,
  })
  @ApiQuery({
    name: 'endDate',
    description: 'Fecha de fin en formato ISO 8601 (YYYY-MM-DD)',
    example: '2024-12-31',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de materias en el rango de fechas obtenido exitosamente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'subject_123' },
          name: { type: 'string', example: 'Cálculo I' },
          code: { type: 'string', example: 'MATH101' },
          count: { type: 'number', example: 12 },
          period: { type: 'string', example: '2024-01-01 to 2024-12-31' },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Las fechas de inicio y fin son requeridas o tienen formato inválido',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
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
