import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NotificationController } from '../../../src/modules/notification/notification.controller';
import { NotificationService } from '../../../src/modules/notification/notification.service';

export const MOCK_USER_ID = 'student@example.com';
export const MOCK_TUTOR_ID = 'tutor@example.com';
export const MOCK_NOTIFICATION_ID = 'notif-1';

export function createMockNotification(overrides: Partial<any> = {}) {
  const now = new Date();
  const base = {
    id: MOCK_NOTIFICATION_ID,
    recipientId: MOCK_TUTOR_ID,
    senderId: MOCK_USER_ID,
    type: 'session_pending',
    title: 'New booking request',
    message: 'Student requested a session',
    courseId: undefined,
    readAt: undefined,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  return { ...base, ...overrides };
}

export function createMockNotificationService(): jest.Mocked<NotificationService> {
  const notification = createMockNotification();
  const notificationsArray = [notification];

  return {
    getNotificationById: jest.fn().mockResolvedValue(notification),
    getNotificationsByUser: jest.fn().mockResolvedValue(notificationsArray),
    getUnreadNotificationsByUser: jest
      .fn()
      .mockResolvedValue(notificationsArray),
    createNotification: jest.fn().mockImplementation(async (payload) => {
      // emulate generated id and timestamps
      return {
        ...payload,
        id: 'generated-notif-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }),
    markAsRead: jest.fn().mockImplementation(async (id: string) => {
      return { ...notification, id, readAt: new Date().toISOString() };
    }),
    deleteNotification: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NotificationService>;
}

export async function createNotificationTestApp(
  mockService?: jest.Mocked<NotificationService>,
): Promise<{
  app: INestApplication;
  notificationService: jest.Mocked<NotificationService>;
}> {
  const notificationService = mockService || createMockNotificationService();

  const moduleRef = await Test.createTestingModule({
    controllers: [NotificationController],
    providers: [
      { provide: NotificationService, useValue: notificationService },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');

  await app.init();

  return { app, notificationService };
}

// Small helpers for tests
export function createNotificationPayload(overrides: Partial<any> = {}) {
  return {
    recipientId: MOCK_TUTOR_ID,
    senderId: MOCK_USER_ID,
    type: 'session_pending',
    title: 'Please approve booking',
    message: 'Booking requires approval',
    ...overrides,
  };
}

export function hasIsoTimestamp(v: any) {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}
