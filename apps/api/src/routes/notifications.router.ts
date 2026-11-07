import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { notificationService } from '../services/notification.service.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

/**
 * GET /api/notifications
 * Lists staff member's notifications and unread badge count.
 */
notificationsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { notifications, unreadCount } = await notificationService.getNotifications(userId);
    res.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Marks a specific notification as read.
 */
notificationsRouter.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params['id'] as string;
    await notificationService.markRead(notificationId, userId);
    res.json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notifications/read-all
 * Marks all notifications for current user as read.
 */
notificationsRouter.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const count = await notificationService.markAllRead(userId);
    res.json({
      success: true,
      markedCount: count,
    });
  } catch (err) {
    next(err);
  }
});
