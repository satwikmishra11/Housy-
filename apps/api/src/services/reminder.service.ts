import { canContact } from '@housy/shared';
import { query } from '../db/index.js';
import { whatsappAdapter } from '../channels/outbox.adapter.js';
import { logger } from '../utils/logger.js';

export interface DueReminderRow {
  reminder_id: string;
  booking_id: string;
  kind: '24h' | '2h';
  attempts: number;
  booking_status: string;
  slot_starts_at: Date;
  lead_id: string;
  lead_name: string;
  lead_phone: string | null;
  consent_status: string;
  opted_out_at: Date | null;
  project_name: string;
  rera_number: string;
  project_address: string;
  executive_name: string;
}

export class ReminderService {
  /**
   * Processes due reminders with SELECT ... FOR UPDATE SKIP LOCKED.
   * Ensures idempotency, single-flight processing, and safety:
   * 1. Checks that the visit booking is still 'confirmed'.
   * 2. Checks DPDP canContact(lead, 'whatsapp') is true.
   * 3. Sends via WhatsApp channel adapter using approved templates.
   * 4. Enforces retry limits (max 3 attempts).
   * 5. Sets reminder status to 'sent', 'skipped', 'cancelled', or 'failed'.
   */
  async processDueReminders(limit: number = 50): Promise<{
    processedCount: number;
    sentCount: number;
    skippedCount: number;
    cancelledCount: number;
    failedCount: number;
  }> {
    const dueRes = await query<DueReminderRow>(
      `SELECT r.id AS reminder_id, r.booking_id, r.kind, r.attempts,
              vb.status AS booking_status,
              vs.starts_at AS slot_starts_at,
              l.id AS lead_id, l.name AS lead_name, l.phone_e164 AS lead_phone,
              l.consent_status, l.opted_out_at,
              p.name AS project_name, p.rera_number, p.address AS project_address,
              u.name AS executive_name
       FROM reminders r
       JOIN visit_bookings vb ON r.booking_id = vb.id
       JOIN visit_slots vs ON vb.slot_id = vs.id
       JOIN leads l ON vb.lead_id = l.id
       JOIN projects p ON vs.project_id = p.id
       JOIN users u ON vs.executive_id = u.id
       WHERE r.scheduled_at <= NOW()
         AND r.status = 'pending'
       ORDER BY r.scheduled_at ASC
       LIMIT $1
       FOR UPDATE OF r SKIP LOCKED`,
      [limit],
    );

    let sentCount = 0;
    let skippedCount = 0;
    let cancelledCount = 0;
    let failedCount = 0;

    for (const r of dueRes.rows) {
      const nextAttempt = r.attempts + 1;

      // 1. Check if the booking is still confirmed
      if (r.booking_status !== 'confirmed') {
        await query(
          `UPDATE reminders
           SET status = 'cancelled', attempts = $1, last_attempt_at = NOW()
           WHERE id = $2`,
          [nextAttempt, r.reminder_id],
        );
        cancelledCount++;
        continue;
      }

      // 2. DPDP Compliance check: canContact
      const allowed = canContact(
        {
          consent_status: r.consent_status,
          opted_out_at: r.opted_out_at,
        },
        'whatsapp',
      );

      if (!allowed || !r.lead_phone) {
        await query(
          `UPDATE reminders
           SET status = 'skipped', attempts = $1, last_attempt_at = NOW()
           WHERE id = $2`,
          [nextAttempt, r.reminder_id],
        );
        skippedCount++;
        continue;
      }

      // 3. Format appointment time in Asia/Kolkata
      const istTimeStr = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(r.slot_starts_at));

      const templateName = r.kind === '24h' ? 'reminder_24h' : 'reminder_2h';
      const payload: Record<string, string | number> = {
        projectName: r.project_name,
        startsAt: istTimeStr,
        executiveName: r.executive_name,
        reraNumber: r.rera_number,
      };

      if (r.kind === '24h') {
        payload.manageUrl = `/visit/manage?bookingId=${r.booking_id}`;
      } else {
        payload.mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(r.project_address)}`;
      }

      try {
        await whatsappAdapter.send({
          leadId: r.lead_id,
          recipient: r.lead_phone,
          channel: 'whatsapp',
          templateName,
          payload,
        });

        await query(
          `UPDATE reminders
           SET status = 'sent', attempts = $1, last_attempt_at = NOW()
           WHERE id = $2`,
          [nextAttempt, r.reminder_id],
        );
        sentCount++;
      } catch (err) {
        logger.error(
          {
            reminderId: r.reminder_id,
            bookingId: r.booking_id,
            attempt: nextAttempt,
            err,
          },
          'Failed to dispatch site visit reminder',
        );

        if (nextAttempt >= 3) {
          // Exhausted max retry limit
          await query(
            `UPDATE reminders
             SET status = 'failed', attempts = $1, last_attempt_at = NOW()
             WHERE id = $2`,
            [nextAttempt, r.reminder_id],
          );
          failedCount++;
        } else {
          // Keep pending for next retry cycle
          await query(
            `UPDATE reminders
             SET attempts = $1, last_attempt_at = NOW()
             WHERE id = $2`,
            [nextAttempt, r.reminder_id],
          );
        }
      }
    }

    return {
      processedCount: dueRes.rows.length,
      sentCount,
      skippedCount,
      cancelledCount,
      failedCount,
    };
  }
}

export const reminderService = new ReminderService();
