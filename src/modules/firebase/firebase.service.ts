import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private app: admin.app.App = null!;
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.initializeApp();
  }

  private initializeApp() {
    try {
      if (!admin.apps.length) {
        let projectId: string;
        let clientEmail: string;
        let privateKey: string;

        // Try to read from GOOGLE_SERVICE_ACCOUNT_KEY JSON first
        const serviceAccountKey = this.configService.get('GOOGLE_SERVICE_ACCOUNT_KEY');
        
        if (serviceAccountKey) {
          try {
            const credentials = JSON.parse(serviceAccountKey);
            projectId = credentials.project_id;
            clientEmail = credentials.client_email;
            privateKey = credentials.private_key;
            this.logger.log('Using credentials from GOOGLE_SERVICE_ACCOUNT_KEY');
          } catch (e) {
            this.logger.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY as JSON');
            throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY format');
          }
        } else {
          // Fallback to individual environment variables
          projectId = this.configService.get('FIREBASE_PROJECT_ID') || this.configService.get('NEXT_PUBLIC_FIREBASE_PROJECT_ID') || '';
          clientEmail = this.configService.get('FIREBASE_CLIENT_EMAIL') || this.configService.get('GOOGLE_SERVICE_ACCOUNT_EMAIL') || '';
          privateKey = this.configService.get('FIREBASE_PRIVATE_KEY') || '';

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
          this.logger.log('Using credentials from individual environment variables');
        }

        if (!projectId || !clientEmail || !privateKey) {
          throw new Error('Missing required Firebase credentials. Set GOOGLE_SERVICE_ACCOUNT_KEY or (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)');
        }

        this.app = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });

        this.logger.log(`Firebase Admin SDK initialized successfully for project: ${projectId}`);
      } else {
        this.app = admin.app();
        this.logger.log('Firebase Admin SDK already initialized');
      }
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK:', error instanceof Error ? error.message : String(error));
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


