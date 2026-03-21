import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FirebaseService } from '../../modules/firebase/firebase.service';

/**
 * BQ1: Global interceptor that tracks API request latency
 * Automatically logs every request's duration to Firestore
 */
@Injectable()
export class LatencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LatencyInterceptor.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logLatency(method, url, startTime, 200);
        },
        error: (error) => {
          const statusCode = error?.status || 500;
          this.logLatency(method, url, startTime, statusCode);
        },
      }),
    );
  }

  private async logLatency(
    method: string,
    endpoint: string,
    startTime: number,
    statusCode: number,
  ): Promise<void> {
    try {
      const durationMs = Date.now() - startTime;
      const db = this.firebaseService.getFirestore();

      // Skip logging for the dashboard endpoint to avoid recursion
      if (endpoint.includes('/analytics/dashboard')) {
        return;
      }

      await db.collection('bugReports').add({
        type: 'LATENCY',
        message: `${method} ${endpoint} - ${durationMs}ms`,
        endpoint,
        method,
        durationMs,
        statusCode,
        timestamp: new Date(),
      });

      // Only log slow requests to console
      if (durationMs > 1000) {
        this.logger.warn(
          `Slow request detected: ${method} ${endpoint} took ${durationMs}ms`,
        );
      }
    } catch (error) {
      // Silently fail to avoid disrupting the request flow
      this.logger.error('Failed to log latency:', error);
    }
  }
}
