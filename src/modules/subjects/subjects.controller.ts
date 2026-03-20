import { Controller, Get, Query, Param, HttpException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { TutoringSession } from './entities/tutoring-session.entity';
import { ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserService } from '../user/user.service';

@ApiTags('Tutoring Sessions')
@Controller('subjects')
export class SubjectsController {
  private readonly logger = new Logger(SubjectsController.name);

  constructor(
    private readonly subjectsService: SubjectsService,
    private readonly userService: UserService,
  ) {}

  /**
   * ===== RUTAS ESPECÍFICAS (DEBEN IR PRIMERO) =====
   */

  /**
   * Obtiene el historial de sesiones de los últimos 5 meses
   * GET /subjects/history
   */
  @ApiOperation({
    summary: 'Obtener historial de sesiones (últimos 5 meses)',
    description: 'Retorna todas las sesiones de los últimos 5 meses, agrupadas por curso',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de sesiones obtenido exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'No se encontraron sesiones en los últimos 5 meses',
  })
  @Get('history')
  async getSubjectsHistory(): Promise<{ success: boolean; count: number; data: any[] }> {
    try {
      const subjects = await this.subjectsService.getSubjectsHistory();
      if (subjects.length === 0) {
        throw new HttpException(
          'No se encontraron sesiones en los últimos 5 meses',
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        success: true,
        count: subjects.length,
        data: subjects,
      };
    } catch (error) {
      this.logger.error('Error al obtener historial de materias:', error);
      throw error instanceof HttpException
        ? error
        : new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Obtiene el historial de sesiones de un tutor por ruta específica
   * GET /subjects/history/tutor/:tutorId
   */
  @ApiOperation({
    summary: 'Obtener historial de sesiones por tutor',
    description: 'Retorna el historial de sesiones de un tutor específico de los últimos 5 meses',
  })
  @ApiParam({
    name: 'tutorId',
    description: 'ID único del tutor',
    example: 'sFKRihEeWNMKFctnnCM0n9CjXqo1',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de sesiones del tutor obtenido exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'No se encontraron sesiones para este tutor',
  })
  @Get('history/tutor/:tutorId')
  async getSubjectsHistoryByTutor(@Param('tutorId') tutorId: string): Promise<{ success: boolean; count: number; data: any[] }> {
    try {
      let resolvedTutorId = tutorId;

      // If tutorId looks like an email, resolve it to Firebase UID
      if (tutorId.includes('@')) {
        this.logger.log(`Email provided, resolving to UID: ${tutorId}`);
        try {
          const user = await this.userService.getUserByEmail(tutorId.trim());
          if (!user) {
            throw new NotFoundException(`Tutor with email ${tutorId} not found`);
          }
          resolvedTutorId = user.id; // Use Firebase UID
          this.logger.log(`Resolved email ${tutorId} to UID ${resolvedTutorId}`);
        } catch (err) {
          throw new NotFoundException(`Tutor with email ${tutorId} not found`);
        }
      }

      const subjects = await this.subjectsService.getSubjectsHistoryByTutor(resolvedTutorId);
      if (subjects.length === 0) {
        throw new HttpException(
          `No se encontraron sesiones para el tutor ${tutorId}`,
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        success: true,
        count: subjects.length,
        data: subjects,
      };
    } catch (error) {
      this.logger.error(`Error al obtener historial del tutor ${tutorId}:`, error);
      throw error instanceof HttpException
        ? error
        : new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Obtiene el historial de sesiones por rango de fechas
   * GET /subjects/history/range?startDate=2024-01-01&endDate=2024-12-31
   */
  @ApiOperation({
    summary: 'Obtener historial por rango de fechas',
    description: 'Retorna el historial de sesiones dentro de un rango de fechas específico',
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
    description: 'Historial obtenido exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Las fechas son inválidas o están en formato incorrecto',
  })
  @Get('history/range')
  async getSubjectsHistoryByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<{ success: boolean; count: number; data: any[] }> {
    try {
      if (!startDate || !endDate) {
        throw new HttpException(
          'Las fechas de inicio y fin son requeridas',
          HttpStatus.BAD_REQUEST,
        );
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new HttpException(
          'Formato de fecha inválido. Use ISO 8601 (YYYY-MM-DD)',
          HttpStatus.BAD_REQUEST,
        );
      }

      const subjects = await this.subjectsService.getSubjectsHistoryByDateRange(start, end);
      if (subjects.length === 0) {
        throw new HttpException(
          'No se encontraron sesiones en el rango especificado',
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        success: true,
        count: subjects.length,
        data: subjects,
      };
    } catch (error) {
      this.logger.error('Error al obtener historial por rango de fechas:', error);
      throw error instanceof HttpException
        ? error
        : new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Obtiene sesiones filtrando por estado
   * GET /subjects/status/:status
   */
  @ApiOperation({
    summary: 'Obtener sesiones por estado',
    description: 'Retorna sesiones filtradas por estado (pending, approved, completed, cancelled)',
  })
  @ApiParam({
    name: 'status',
    description: 'Estado de la sesión',
    example: 'pending',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesiones obtenidas exitosamente',
  })
  @Get('status/:status')
  async getSessionsByStatus(@Param('status') status: string): Promise<{ success: boolean; count: number; data: TutoringSession[] }> {
    try {
      const sessions = await this.subjectsService.getSessionsByStatus(status);
      return {
        success: true,
        count: sessions.length,
        data: sessions,
      };
    } catch (error) {
      this.logger.error(`Error obteniendo sesiones con status ${status}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Obtiene sesiones de un estudiante específico
   * GET /subjects/student/:studentId
   */
  @ApiOperation({
    summary: 'Obtener sesiones por estudiante',
    description: 'Retorna todas las sesiones de un estudiante específico',
  })
  @ApiParam({
    name: 'studentId',
    description: 'ID del estudiante',
    example: '6vwdLABWPSO0C65MV1fgcYAKRx32',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesiones del estudiante obtenidas exitosamente',
  })
  @Get('student/:studentId')
  async getSessionsByStudent(@Param('studentId') studentId: string): Promise<{ success: boolean; count: number; data: TutoringSession[] }> {
    try {
      const sessions = await this.subjectsService.getSessionsByStudent(studentId);
      return {
        success: true,
        count: sessions.length,
        data: sessions,
      };
    } catch (error) {
      this.logger.error(`Error obteniendo sesiones del estudiante ${studentId}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Obtiene sesiones de un tutor específico
   * GET /subjects/tutor/:tutorId
   */
  @ApiOperation({
    summary: 'Obtener sesiones por tutor',
    description: 'Retorna todas las sesiones asignadas a un tutor específico',
  })
  @ApiParam({
    name: 'tutorId',
    description: 'ID del tutor',
    example: 'sFKRihEeWNMKFctnnCM0n9CjXqo1',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesiones del tutor obtenidas exitosamente',
  })
  @Get('tutor/:tutorId')
  async getSessionsByTutor(@Param('tutorId') tutorId: string): Promise<{ success: boolean; count: number; data: TutoringSession[] }> {
    try {
      const sessions = await this.subjectsService.getSessionsByTutor(tutorId);
      return {
        success: true,
        count: sessions.length,
        data: sessions,
      };
    } catch (error) {
      this.logger.error(`Error obteniendo sesiones del tutor ${tutorId}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Obtiene sesiones filtrando por curso
   * GET /subjects/course/:courseId
   */
  @ApiOperation({
    summary: 'Obtener sesiones por curso',
    description: 'Retorna todas las sesiones de un curso específico',
  })
  @ApiParam({
    name: 'courseId',
    description: 'ID del curso',
    example: '9x5YSfidtoNctzQO0Zjg',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesiones del curso obtenidas exitosamente',
  })
  @Get('course/:courseId')
  async getSessionsByCourse(@Param('courseId') courseId: string): Promise<{ success: boolean; count: number; data: TutoringSession[] }> {
    try {
      const sessions = await this.subjectsService.getSessionsByCourse(courseId);
      return {
        success: true,
        count: sessions.length,
        data: sessions,
      };
    } catch (error) {
      this.logger.error(`Error obteniendo sesiones del curso ${courseId}:`, error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * ===== RUTAS GENÉRICAS (DEBEN IR AL FINAL) =====
   */

  /**
   * Obtiene todas las sesiones de tutoría
   * GET /subjects
   */
  @ApiOperation({
    summary: 'Obtener todas las sesiones de tutoría',
    description: 'Retorna todas las sesiones de tutoría registradas',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesiones obtenidas exitosamente',
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  @Get()
  async getAllSessions(): Promise<{ success: boolean; count: number; data: TutoringSession[] }> {
    try {
      const sessions = await this.subjectsService.getAllSessions();
      return {
        success: true,
        count: sessions.length,
        data: sessions,
      };
    } catch (error) {
      this.logger.error('Error obteniendo todas las sesiones:', error);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Obtiene una sesión específica por ID
   * GET /subjects/:id
   */
  @ApiOperation({
    summary: 'Obtener sesión por ID',
    description: 'Retorna los detalles de una sesión específica',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la sesión de tutoría',
    example: '9x5YSfidtoNctzQO0Zjg',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión obtenida exitosamente',
  })
  @ApiResponse({
    status: 404,
    description: 'Sesión no encontrada',
  })
  @Get(':id')
  async getSessionById(@Param('id') id: string): Promise<{ success: boolean; data: TutoringSession }> {
    try {
      const session = await this.subjectsService.getSessionById(id);
      return {
        success: true,
        data: session,
      };
    } catch (error) {
      this.logger.error(`Error obteniendo sesión ${id}:`, error);
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }
}
