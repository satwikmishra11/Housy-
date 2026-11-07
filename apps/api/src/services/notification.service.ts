import { query } from '../db/index.js';
import { notificationRepository, type NotificationRepository } from '../repositories/notification.repository.js';
import { type StaffNotification, type NotificationType } from '@housy/shared';
import { logger } from '../utils/logger.js';

export class NotificationService {
  constructor(private readonly notificationRepo: NotificationRepository = notificationRepository) {}

  /**
   * Dispatches an in-app notification and mirrors it to outbound_messages with channel='internal'.
   */
  async notify(params: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string | null;
    metadata?: Record<string, unknown>;
    leadId?: string;
  }): Promise<string> {
    const notificationId = await this.notificationRepo.insertNotification(
      params.userId,
      params.type,
      params.title,
      params.message,
      params.link,
      params.metadata ?? {},
    );

    // Mirror to outbox with channel='internal' if leadId is associated
    if (params.leadId) {
      try {
        await query(
          `INSERT INTO outbound_messages (lead_id, channel, template_key, body, status, sent_at)
           VALUES ($1, 'internal', $2, $3, 'sent', NOW())`,
          [
            params.leadId,
            `internal_${params.type}`,
            `[INTERNAL NOTIFICATION to User ${params.userId}] ${params.title}: ${params.message}`,
          ],
        );
      } catch (err) {
        logger.error({ err, notificationId }, 'Failed to mirror notification to internal outbox');
      }
    }

    return notificationId;
  }

  /**
   * Notify executive of a new assigned lead handoff.
   */
  async notifyNewHandoff(params: {
    executiveId: string;
    leadId: string;
    leadName: string;
    reason: string;
    handoffId: string;
  }): Promise<string> {
    return this.notify({
      userId: params.executiveId,
      type: 'handoff',
      title: 'New Lead Handoff Assigned',
      message: `${params.leadName} has been assigned to you: ${params.reason}`,
      link: `/leads?id=${params.leadId}`,
      metadata: { handoffId: params.handoffId, leadId: params.leadId },
      leadId: params.leadId,
    });
  }

  /**
   * Notify sales head of a handoff that has been unaccepted for >15 minutes.
   */
  async notifySlaEscalation(params: {
    salesHeadId: string;
    leadId: string;
    leadName: string;
    handoffId: string;
    executiveId: string;
  }): Promise<string> {
    return this.notify({
      userId: params.salesHeadId,
      type: 'escalation',
      title: 'Handoff SLA Escalation (15m)',
      message: `Handoff for ${params.leadName} has been unaccepted for over 15 minutes. High priority takeover recommended.`,
      link: `/leads?id=${params.leadId}`,
      metadata: { handoffId: params.handoffId, leadId: params.leadId, executiveId: params.executiveId },
      leadId: params.leadId,
    });
  }

  /**
   * Notify executive of a visit awaiting outcome.
   */
  async notifyVisitAwaitingOutcome(params: {
    executiveId: string;
    leadId: string;
    leadName: string;
    bookingId: string;
    startsAt: string;
  }): Promise<string> {
    return this.notify({
      userId: params.executiveId,
      type: 'visit_awaiting_outcome',
      title: 'Visit Awaiting Outcome',
      message: `Site visit with ${params.leadName} scheduled for ${params.startsAt} requires outcome recording (visited or no-show).`,
      link: `/visits`,
      metadata: { bookingId: params.bookingId, leadId: params.leadId },
      leadId: params.leadId,
    });
  }

  /**
   * Fetches notifications and unread count for staff member.
   */
  async getNotifications(userId: string): Promise<{
    notifications: StaffNotification[];
    unreadCount: number;
  }> {
    const notifications = await this.notificationRepo.findNotificationsByUser(userId);
    const unreadCount = await this.notificationRepo.countUnreadNotifications(userId);
    return { notifications, unreadCount };
  }

  /**
   * Marks a specific notification as read.
   */
  async markRead(notificationId: string, userId: string): Promise<boolean> {
    return this.notificationRepo.markAsRead(notificationId, userId);
  }

  /**
   * Marks all notifications as read for staff member.
   */
  async markAllRead(userId: string): Promise<number> {
    return this.notificationRepo.markAllAsRead(userId);
  }
}

export const notificationService = new NotificationService();
