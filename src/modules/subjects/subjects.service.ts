import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { TutoringSession } from './entities/tutoring-session.entity';
import * as admin from 'firebase-admin';

@Injectable()
export class SubjectsService {
  private readonly logger = new Logger(SubjectsService.name);

  constructor(private firebaseService: FirebaseService) {}

  private getDb(): admin.firestore.Firestore {
    return this.firebaseService.getFirestore();
  }

  /**
   * Obtiene todas las sesiones de tutoría
   * @returns Array de todas las sesiones
   */
  async getAllSessions(): Promise<TutoringSession[]> {
    try {
      this.logger.log('Obteniendo todas las sesiones de tutoría');

      const snapshot = await this.getDb()
        .collection('tutoring_sessions')
        .orderBy('createdAt', 'desc')
        .get();

      const sessions: TutoringSession[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TutoringSession[];

      this.logger.log(`Se encontraron ${sessions.length} sesiones totales`);
      return sessions;
    } catch (error) {
      this.logger.error('Error al obtener todas las sesiones:', error);
      throw new Error(`No se pudieron obtener las sesiones: ${error.message}`);
    }
  }

  /**
   * Obtiene una sesión específica por ID
   * @param id ID de la sesión
   * @returns Sesión encontrada
   */
  async getSessionById(id: string): Promise<TutoringSession> {
    try {
      this.logger.log(`Obteniendo sesión con ID: ${id}`);

      const doc = await this.getDb().collection('tutoring_sessions').doc(id).get();

      if (!doc.exists) {
        throw new NotFoundException(`Sesión con ID ${id} no encontrada`);
      }

      return {
        id: doc.id,
        ...doc.data(),
      } as TutoringSession;
    } catch (error) {
      this.logger.error(`Error obteniendo sesión ${id}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene sesiones filtrando por estado
   * @param status Estado de la sesión (pending, approved, completed, cancelled)
   * @returns Array de sesiones con ese estado
   */
  async getSessionsByStatus(status: string): Promise<TutoringSession[]> {
    try {
      this.logger.log(`Obteniendo sesiones con estado: ${status}`);

      const snapshot = await this.getDb()
        .collection('tutoring_sessions')
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .get();

      const sessions: TutoringSession[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TutoringSession[];

      this.logger.log(`Se encontraron ${sessions.length} sesiones con estado ${status}`);
      return sessions;
    } catch (error) {
      this.logger.error(`Error obteniendo sesiones con estado ${status}:`, error);
      throw new Error(`No se pudieron obtener las sesiones: ${error.message}`);
    }
  }

  /**
   * Obtiene sesiones de un estudiante específico
   * @param studentId ID del estudiante
   * @returns Array de sesiones del estudiante
   */
  async getSessionsByStudent(studentId: string): Promise<TutoringSession[]> {
    try {
      this.logger.log(`Obteniendo sesiones del estudiante: ${studentId}`);

      const snapshot = await this.getDb()
        .collection('tutoring_sessions')
        .where('studentId', '==', studentId)
        .orderBy('createdAt', 'desc')
        .get();

      const sessions: TutoringSession[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TutoringSession[];

      this.logger.log(`Se encontraron ${sessions.length} sesiones del estudiante ${studentId}`);
      return sessions;
    } catch (error) {
      this.logger.error(`Error obteniendo sesiones del estudiante ${studentId}:`, error);
      throw new Error(`No se pudieron obtener las sesiones: ${error.message}`);
    }
  }

  /**
   * Obtiene sesiones de un tutor específico
   * @param tutorId ID del tutor
   * @returns Array de sesiones del tutor
   */
  async getSessionsByTutor(tutorId: string): Promise<TutoringSession[]> {
    try {
      this.logger.log(`Obteniendo sesiones del tutor: ${tutorId}`);

      const snapshot = await this.getDb()
        .collection('tutoring_sessions')
        .where('tutorId', '==', tutorId)
        .orderBy('createdAt', 'desc')
        .get();

      const sessions: TutoringSession[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TutoringSession[];

      this.logger.log(`Se encontraron ${sessions.length} sesiones del tutor ${tutorId}`);
      return sessions;
    } catch (error) {
      this.logger.error(`Error obteniendo sesiones del tutor ${tutorId}:`, error);
      throw new Error(`No se pudieron obtener las sesiones: ${error.message}`);
    }
  }

  /**
   * Obtiene sesiones filtrando por curso
   * @param courseId ID del curso
   * @returns Array de sesiones del curso
   */
  async getSessionsByCourse(courseId: string): Promise<TutoringSession[]> {
    try {
      this.logger.log(`Obteniendo sesiones del curso: ${courseId}`);

      const snapshot = await this.getDb()
        .collection('tutoring_sessions')
        .where('courseId', '==', courseId)
        .orderBy('createdAt', 'desc')
        .get();

      const sessions: TutoringSession[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as TutoringSession[];

      this.logger.log(`Se encontraron ${sessions.length} sesiones del curso ${courseId}`);
      return sessions;
    } catch (error) {
      this.logger.error(`Error obteniendo sesiones del curso ${courseId}:`, error);
      throw new Error(`No se pudieron obtener las sesiones: ${error.message}`);
    }
  }

  /**
   * Obtiene el historial de todas las materias dictadas en los últimos 5 meses
   * Devuelve una lista donde cada sesión aparece como su materia (con duplicados)
   * @returns Array con materias repetidas según cantidad de sesiones
   */
  async getSubjectsHistory(): Promise<any[]> {
    try {
      // Calcular la fecha de hace 5 meses
      const fiveMonthsAgo = new Date();
      fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);

      this.logger.log(`Obteniendo historial de materias desde: ${fiveMonthsAgo.toISOString()}`);

      const snapshot = await this.getDb()
        .collection('tutoring_sessions')
        .where('createdAt', '>=', fiveMonthsAgo)
        .orderBy('createdAt', 'desc')
        .get();

      // Mapear cada sesión a su materia (sin agrupar, con duplicados)
      const subjects = snapshot.docs.map((doc) => {
        const data = doc.data() as TutoringSession;
        return {
          courseId: data.courseId,
          course: data.course,
        };
      });

      this.logger.log(`Se encontraron ${subjects.length} sesiones en los últimos 5 meses`);
      return subjects;
    } catch (error) {
      this.logger.error('Error al obtener historial de materias:', error);
      throw new Error(`No se pudo obtener el historial de materias: ${error.message}`);
    }
  }

  /**
   * Obtiene el historial de materias de un tutor específico
   * Devuelve una lista donde cada sesión aparece como su materia (con duplicados)
   * @param tutorId ID del tutor
   * @returns Array con materias repetidas según cantidad de sesiones del tutor
   */
  async getSubjectsHistoryByTutor(tutorId: string): Promise<any[]> {
    try {
      const fiveMonthsAgo = new Date();
      fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);

      this.logger.log(`Obteniendo historial de materias del tutor ${tutorId} desde: ${fiveMonthsAgo.toISOString()}`);

      const snapshot = await this.getDb()
        .collection('tutoring_sessions')
        .where('tutorId', '==', tutorId)
        .where('createdAt', '>=', fiveMonthsAgo)
        .orderBy('createdAt', 'desc')
        .get();

      // Mapear cada sesión a su materia (sin agrupar, con duplicados)
      const subjects = snapshot.docs.map((doc) => {
        const data = doc.data() as TutoringSession;
        return {
          courseId: data.courseId,
          course: data.course,
        };
      });

      this.logger.log(`Se encontraron ${subjects.length} sesiones del tutor ${tutorId}`);
      return subjects;
    } catch (error) {
      this.logger.error(`Error al obtener historial de materias del tutor ${tutorId}:`, error);
      throw new Error(`No se pudo obtener el historial de materias: ${error.message}`);
    }
  }

  /**
   * Obtiene el historial de materias por rango de fechas personalizado
   * Devuelve una lista donde cada sesión aparece como su materia (con duplicados)
   * @param startDate Fecha de inicio
   * @param endDate Fecha de fin
   * @returns Promise con lista de materias repetidas según cantidad de sesiones
   */
  async getSubjectsHistoryByDateRange(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      this.logger.log(`Obteniendo materias entre ${startDate.toISOString()} y ${endDate.toISOString()}`);

      const snapshot = await this.getDb()
        .collection('tutoring_sessions')
        .where('createdAt', '>=', startDate)
        .where('createdAt', '<=', endDate)
        .orderBy('createdAt', 'desc')
        .get();

      // Mapear cada sesión a su materia (sin agrupar, con duplicados)
      const subjects = snapshot.docs.map((doc) => {
        const data = doc.data() as TutoringSession;
        return {
          courseId: data.courseId,
          course: data.course,
        };
      });

      this.logger.log(`Se encontraron ${subjects.length} sesiones en el rango especificado`);
      return subjects;
    } catch (error) {
      this.logger.error('Error al obtener historial de materias por rango:', error);
      throw new Error(`No se pudo obtener el historial de materias: ${error.message}`);
    }
  }
}
