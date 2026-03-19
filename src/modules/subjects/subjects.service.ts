import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

@Injectable()
export class SubjectsService {
  private readonly logger = new Logger(SubjectsService.name);

  constructor(private firebaseService: FirebaseService) {}

  private getDb(): admin.firestore.Firestore {
    return this.firebaseService.getFirestore();
  }

  /**
   * Obtiene el historial de todas las materias dictadas en los últimos 5 meses
   * @returns Promesa con el array de materias
   */
  async getSubjectsHistory(): Promise<any[]> {
    try {
      // Calcular la fecha de hace 5 meses
      const fiveMonthsAgo = new Date();
      fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);

      this.logger.log(`Obteniendo materias desde: ${fiveMonthsAgo.toISOString()}`);

      // Realizar consulta a Firestore
      const snapshot = await this.getDb()
        .collection('tutoring_sessions')
        .where('createdAt', '>=', fiveMonthsAgo)
        .orderBy('createdAt', 'desc')
        .get();

      // Mapear los documentos a objetos con el ID incluido
      const subjects = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      this.logger.log(`Se encontraron ${subjects.length} materias en los últimos 5 meses`);
      return subjects;
    } catch (error) {
      this.logger.error('Error al obtener historial de materias:', error);
      throw new Error(`No se pudo obtener el historial de materias: ${error.message}`);
    }
  }

  /**
   * Obtiene el historial de materias de un tutor específico en los últimos 5 meses
   * @param tutorId ID del tutor
   * @returns Promesa con el array de materias del tutor
   */
  async getSubjectsHistoryByTutor(tutorId: string): Promise<any[]> {
    try {
      const fiveMonthsAgo = new Date();
      fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);

      this.logger.log(`Obteniendo materias del tutor ${tutorId} desde: ${fiveMonthsAgo.toISOString()}`);

      const snapshot = await this.getDb()
        .collection('tutoring_sessions')
        .where('tutorId', '==', tutorId)
        .where('createdAt', '>=', fiveMonthsAgo)
        .orderBy('createdAt', 'desc')
        .get();

      const subjects = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      this.logger.log(`Se encontraron ${subjects.length} materias del tutor ${tutorId}`);
      return subjects;
    } catch (error) {
      this.logger.error(`Error al obtener historial de materias del tutor ${tutorId}:`, error);
      throw new Error(`No se pudo obtener el historial de materias: ${error.message}`);
    }
  }

  /**
   * Obtiene el historial de materias por rango de fechas personalizado
   * @param startDate Fecha de inicio
   * @param endDate Fecha de fin
   * @returns Promesa con el array de materias en el rango
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

      const subjects = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      this.logger.log(`Se encontraron ${subjects.length} materias en el rango especificado`);
      return subjects;
    } catch (error) {
      this.logger.error('Error al obtener historial de materias por rango:', error);
      throw new Error(`No se pudo obtener el historial de materias: ${error.message}`);
    }
  }
}
