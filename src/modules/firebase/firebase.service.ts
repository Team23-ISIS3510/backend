import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private app: admin.app.App;
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.initializeApp();
  }

  private initializeApp() {
    try {
      if (!admin.apps.length) {
        // Initialize with service account from environment variables.
        // Support multiple env formats so local .env with GOOGLE_SERVICE_ACCOUNT_KEY works.
        let projectId = this.configService.get('FIREBASE_PROJECT_ID');
        let clientEmail = this.configService.get('FIREBASE_CLIENT_EMAIL');
        let privateKey = this.configService.get('FIREBASE_PRIVATE_KEY');

        // If a full service account JSON is provided (as in .env: GOOGLE_SERVICE_ACCOUNT_KEY), parse it
        const saKeyJson = this.configService.get('GOOGLE_SERVICE_ACCOUNT_KEY');
        if (!projectId || !clientEmail || !privateKey) {
          if (saKeyJson) {
            try {
              const sa = typeof saKeyJson === 'string' ? JSON.parse(saKeyJson) : saKeyJson;
              projectId = projectId || sa.project_id || sa.projectId;
              clientEmail = clientEmail || sa.client_email;
              privateKey = privateKey || sa.private_key;
            } catch (err) {
              this.logger.warn('Failed parsing GOOGLE_SERVICE_ACCOUNT_KEY JSON:', err.message || err);
            }
          }
        }

        if (privateKey) {
          // normalize newline escapes
          privateKey = privateKey.replace(/\\n/g, '\n');
        }

        // Check for GOOGLE_SERVICE_ACCOUNT_KEY JSON
        const googleServiceAccountKey = this.configService.get('GOOGLE_SERVICE_ACCOUNT_KEY');
        if (googleServiceAccountKey) {
          try {
            const parsed = JSON.parse(googleServiceAccountKey);
            // Prioritize the values from the JSON key as they are a consistent set
            if (parsed.project_id) projectId = parsed.project_id;
            if (parsed.client_email) clientEmail = parsed.client_email;
            if (parsed.private_key) privateKey = parsed.private_key;
            this.logger.log('Loaded Firebase credentials from GOOGLE_SERVICE_ACCOUNT_KEY');
          } catch (e) {
            this.logger.warn('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY', e);
          }
        }

        if (privateKey) {
          // Handle escaped newlines from .env
          // If the key is wrapped in quotes, try to parse it as a JSON string to handle escapes correctly
          if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            try {
               // This handles "line1\nline2" correctly
               privateKey = JSON.parse(privateKey);
            } catch (e) {
               // Fallback if it's not valid JSON string
               privateKey = privateKey.slice(1, -1).replace(/\\n/g, '\n');
            }
          } else {
             privateKey = privateKey.replace(/\\n/g, '\n');
          }
        }

        if (projectId && clientEmail && privateKey) {
          this.app = admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey,
            }),
          });
        } else {
          this.logger.warn(
            'Firebase Admin SDK credentials (clientEmail/privateKey) not found. Trying default credentials with Project ID.',
          );
          // Try using default credentials but explicitly providing the projectId if available
          const config: admin.AppOptions = {};
          if (projectId) {
            config.projectId = projectId;
          }
          this.app = admin.initializeApp(config);
        }

        this.logger.log('✅ Firebase Admin SDK initialized successfully');
      } else {
        this.app = admin.app();
        this.logger.log('✅ Firebase Admin SDK already initialized');
      }
    } catch (error) {
      this.logger.error('❌ Failed to initialize Firebase Admin SDK:', error);
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

  // Helper method to get a Firestore collection
  collection(name: string): admin.firestore.CollectionReference {
    return this.getFirestore().collection(name);
  }

  // Helper method for server timestamp
  getTimestamp(): admin.firestore.FieldValue {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  // Return ISO date-time string for createdAt/updatedAt
  getDateTimeString(): string {
    return new Date().toISOString();
  }

  // Parse stored date-time values (string or Firestore Timestamp) into JS Date
  parseDate(value: any): Date | undefined {
    if (!value) return undefined;
    // If it's a string ISO
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? undefined : d;
    }
    // If it's a Firestore Timestamp-like object with toDate()
    if (value && typeof value.toDate === 'function') {
      try {
        return value.toDate();
      } catch (e) {
        return undefined;
      }
    }
    // Last resort: try to construct a Date
    try {
      const d = new Date(value);
      return isNaN(d.getTime()) ? undefined : d;
    } catch (e) {
      return undefined;
    }
  }
}
