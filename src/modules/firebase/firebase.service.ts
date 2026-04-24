import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {

  private app: admin.app.App = null!;
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private configService: ConfigService) {
    // Initialize immediately in constructor to prevent race conditions
    this.initializeApp();
  }

  onModuleInit() {
    // Already initialized in constructor
    this.logger.debug('FirebaseService module initialized');
  }

  private parseBoolean(value: unknown, defaultValue = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return defaultValue;
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
  }

  private initializeApp() {
    try {

      if (!admin.apps.length) {
        const useFirestoreEmulator = this.parseBoolean(
          this.configService.get('FIREBASE_USE_EMULATOR'),
          false,
        );
        const emulatorHost =
          this.configService.get<string>('FIRESTORE_EMULATOR_HOST') ||
          `${this.configService.get<string>('FIRESTORE_EMULATOR_HOSTNAME') || '127.0.0.1'}:${this.configService.get<string>('FIRESTORE_EMULATOR_PORT') || '8080'}`;

        if (useFirestoreEmulator) {
          process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
        }

        const projectId = this.configService.get('FIREBASE_PROJECT_ID');
        const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
        const privateKeyRaw = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

        if (!projectId) {
          throw new Error(
            'Missing required Firebase credential: FIREBASE_PROJECT_ID'
          );
        }

        if (useFirestoreEmulator) {
          this.app = admin.initializeApp({ projectId });
          this.logger.log(
            `Firebase Admin SDK initialized using Firestore emulator (${emulatorHost})`,
          );
          return;
        }

        if (!clientEmail || !privateKeyRaw) {
          throw new Error(
            'Missing required Firebase credentials for production mode: FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY'
          );
        }
        let privateKey = privateKeyRaw;

        // Handle escaped newlines from .env
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {

          try {
            privateKey = JSON.parse(privateKey);

          } catch (e) {
            privateKey = privateKey.slice(1, -1).replace(/\\n/g, '\n');
          }

        } else {
          privateKey = privateKey.replace(/\\n/g, '\n');
        }

        this.app = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });

        this.logger.log('Firebase Admin SDK initialized successfully');

      } else {

        this.app = admin.app();
        this.logger.log('Firebase Admin SDK already initialized');

      }

    } catch (error) {

      this.logger.error(
        'Failed to initialize Firebase Admin SDK:',
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    }
  }

  getFirestore(): admin.firestore.Firestore {
    return admin.firestore();
  }

  getAuth(): admin.auth.Auth {
    return admin.auth();
  }

  getStorage(): admin.storage.Storage {
    return admin.storage();
  }

  getApp(): admin.app.App {
    return this.app;
  }

  collection(name: string): admin.firestore.CollectionReference {
    return this.getFirestore().collection(name);
  }

  getTimestamp(): admin.firestore.FieldValue {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  getDateTimeString(): string {
    return new Date().toISOString();
  }

  parseDate(value: any): Date | undefined {

    if (!value) return undefined;

    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? undefined : d;
    }

    if (value && typeof value.toDate === 'function') {
      try {
        return value.toDate();
      } catch (e) {
        return undefined;
      }
    }

    try {
      const d = new Date(value);
      return isNaN(d.getTime()) ? undefined : d;
    } catch (e) {
      return undefined;
    }
  }
}

