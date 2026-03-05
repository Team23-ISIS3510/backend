import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import type { CreateNotificationDto } from './notification.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly notificationService: NotificationService) {}

  @ApiOperation({ summary: 'Get all notifications' })
  @ApiResponse({ status: 200, description: 'List of all notifications.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit results' })
  @Get()
  async getAllNotifications(@Query('limit') limit?: string) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 100;
      const notifications =
        await this.notificationService.getAllNotifications(limitNum);
      return {
        success: true,
        notifications,
        count: notifications.length,
      };
    } catch (error) {
      this.logger.error('Error getting all notifications:', error);
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get notification by id' })
  @ApiResponse({ status: 200, description: 'Notification retrieved.' })
  @ApiResponse({ status: 404, description: 'Notification not found.' })
  @ApiParam({ name: 'id', required: true, description: 'Notification id' })
  @Get(':id')
  async getNotificationById(@Param('id') id: string) {
    try {
      const notification =
        await this.notificationService.getNotificationById(id);
      return {
        success: true,
        notification,
      };
    } catch (error) {
      this.logger.error(`Error getting notification ${id}:`, error);
      const message = error instanceof Error ? error.message : 'Not found';
      throw new HttpException(message, HttpStatus.NOT_FOUND);
    }
  }

  @ApiOperation({ summary: 'Get notifications for a user' })
  @ApiResponse({ status: 200, description: 'List of notifications.' })
  @ApiParam({ name: 'userId', required: true, description: 'User id' })
  @ApiQuery({ name: 'limit', required: false })
  @Get('user/:userId')
  async getNotificationsByUser(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 50;
      const notifications =
        await this.notificationService.getNotificationsByUser(userId, limitNum);
      return {
        success: true,
        notifications,
        count: notifications.length,
      };
    } catch (error) {
      this.logger.error(
        `Error getting notifications for user ${userId}:`,
        error,
      );
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Get unread notifications for a user' })
  @ApiResponse({ status: 200, description: 'List of unread notifications.' })
  @ApiParam({ name: 'userId', required: true, description: 'User id' })
  @ApiQuery({ name: 'limit', required: false })
  @Get('user/:userId/unread')
  async getUnreadNotificationsByUser(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 50;
      const notifications =
        await this.notificationService.getUnreadNotificationsByUser(
          userId,
          limitNum,
        );
      return {
        success: true,
        notifications,
        count: notifications.length,
      };
    } catch (error) {
      this.logger.error(
        `Error getting unread notifications for user ${userId}:`,
        error,
      );
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Create a notification' })
  @ApiResponse({ status: 201, description: 'Notification created.' })
  @ApiBody({
    schema: {
      example: {
        recipientId: 'string',
        title: 'string',
        message: 'string',
      },
    },
  })
  @Post()
  async createNotification(@Body() notificationData: Partial<Notification>) {
    try {
      const notification =
        await this.notificationService.createNotification(notificationData);
      return {
        success: true,
        notification,
      };
    } catch (error) {
      this.logger.error('Error creating notification:', error);
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read.' })
  @ApiParam({ name: 'id', required: true, description: 'Notification id' })
  @Put(':id/read')
  async markAsRead(@Param('id') id: string) {
    try {
      const notification = await this.notificationService.markAsRead(id);
      return {
        success: true,
        notification,
      };
    } catch (error) {
      this.logger.error(`Error marking notification ${id} as read:`, error);
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @ApiOperation({ summary: 'Delete a notification' })
  @ApiResponse({ status: 200, description: 'Notification deleted.' })
  @ApiParam({ name: 'id', required: true, description: 'Notification id' })
  @Delete(':id')
  async deleteNotification(@Param('id') id: string) {
    try {
      await this.notificationService.deleteNotification(id);
      return {
        success: true,
        message: 'Notification deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Error deleting notification ${id}:`, error);
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
