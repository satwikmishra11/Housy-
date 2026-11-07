import { type PoolClient, type QueryResultRow } from 'pg';
import { query } from '../db/index.js';
import { type StaffNotification, type NotificationType } from '@housy/shared';

export interface DbNotificationRow extends QueryResultRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  read_at: Date | null;
}

export class NotificationRepository {
  /**
   * Inserts an in-app notification.
   */
  async insertNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    link?: string | null,
    metadata: Record<string, unknown> = {},
    client?: PoolClient,
  ): Promise<string> {
    const dbCaller = client ? client.query.bind(client) : query;
    const res = await dbCaller<{ id: string }>(
      `INSERT INTO staff_notifications (user_id, type, title, message, link, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id`,
      [userId, type, title, message, link ?? null, JSON.stringify(metadata)],
    );
    return res.rows[0]!.id;
  }

  /**
   * Fetches latest notifications for a specific user.
   */
  async findNotificationsByUser(
    userId: string,
    limit: number = 30,
  ): Promise<StaffNotification[]> {
    const res = await query<DbNotificationRow>(
      `SELECT id, user_id, type, title, message, link, is_read, metadata,
              created_at, read_at
       FROM staff_notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );

    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      type: r.type as NotificationType,
      title: r.title,
      message: r.message,
      link: r.link,
      isRead: r.is_read,
      metadata: r.metadata,
      createdAt: r.created_at.toISOString(),
      readAt: r.read_at ? r.read_at.toISOString() : null,
    }));
  }

  /**
   * Counts unread notifications for a user.
   */
  async countUnreadNotifications(userId: string): Promise<number> {
    const res = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM staff_notifications
       WHERE user_id = $1 AND is_read = false`,
      [userId],
    );
    return parseInt(res.rows[0]?.count ?? '0', 10);
  }

  /**
   * Marks a single notification as read.
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const res = await query(
      `UPDATE staff_notifications
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [notificationId, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Marks all unread notifications for a user as read.
   */
  async markAllAsRead(userId: string): Promise<number> {
    const res = await query(
      `UPDATE staff_notifications
       SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND is_read = false`,
      [userId],
    );
    return res.rowCount ?? 0;
  }
}

export const notificationRepository = new NotificationRepository();
