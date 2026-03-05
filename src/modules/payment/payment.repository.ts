import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { Payment } from './entities/payment.entity';

@Injectable()
export class PaymentRepository {
  private readonly logger = new Logger(PaymentRepository.name);
  private readonly COLLECTION = 'payments';

  constructor(private readonly firebaseService: FirebaseService) {}

  async findById(id: string): Promise<Payment | null> {
    try {
      const docRef = this.firebaseService.getFirestore().collection(this.COLLECTION).doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return null;
      }

      const data = docSnap.data();
      if (!data) {
        return null;
      }

      return {
        id: docSnap.id,
        ...data,
        createdAt: this.firebaseService.parseDate(data.createdAt),
        updatedAt: this.firebaseService.parseDate(data.updatedAt),
      } as Payment;
    } catch (error) {
      this.logger.error('Error finding payment by ID:', error);
      throw error;
    }
  }

  async save(id: string | undefined, paymentData: Partial<Payment>): Promise<string> {
    try {
      const firestoreData: Record<string, unknown> = {
        ...paymentData,
        updatedAt: this.firebaseService.getTimestamp(),
      };

      if (id) {
        const docRef = this.firebaseService.getFirestore().collection(this.COLLECTION).doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
          firestoreData.createdAt = this.firebaseService.getTimestamp();
        }

        await docRef.set(firestoreData, { merge: true });
        return id;
      }

      const colRef = this.firebaseService.getFirestore().collection(this.COLLECTION);
      firestoreData.createdAt = this.firebaseService.getTimestamp();
      const docRef = await colRef.add(firestoreData);
      return docRef.id;
    } catch (error) {
      this.logger.error('Error saving payment:', error);
      throw error;
    }
  }

  async findByTutor(tutorId: string, limit: number = 50): Promise<Payment[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .where('tutorId', '==', tutorId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const payments: Payment[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        payments.push({
          id: doc.id,
          ...data,
          createdAt: this.firebaseService.parseDate(data.createdAt),
          updatedAt: this.firebaseService.parseDate(data.updatedAt),
        } as Payment);
      });

      return payments;
    } catch (error) {
      this.logger.error('Error finding payments by tutor:', error);
      throw error;
    }
  }

  async findByStudent(studentId: string, limit: number = 50): Promise<Payment[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .where('studentId', '==', studentId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const payments: Payment[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        payments.push({
          id: doc.id,
          ...data,
          createdAt: this.firebaseService.parseDate(data.createdAt),
          updatedAt: this.firebaseService.parseDate(data.updatedAt),
        } as Payment);
      });

      return payments;
    } catch (error) {
      this.logger.error('Error finding payments by student:', error);
      throw error;
    }
  }

  async findAll(limit: number = 100): Promise<Payment[]> {
    try {
      const snapshot = await this.firebaseService
        .getFirestore()
        .collection(this.COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const payments: Payment[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        payments.push({
          id: doc.id,
          ...data,
          createdAt: this.firebaseService.parseDate(data.createdAt),
          updatedAt: this.firebaseService.parseDate(data.updatedAt),
        } as Payment);
      });

      return payments;
    } catch (error) {
      this.logger.error('Error finding all payments:', error);
      throw error;
    }
  }
}
