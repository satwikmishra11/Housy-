import type { ChannelSender, OutboxMessage } from './channels.types.js';
import { logger } from '../utils/logger.js';
import { query } from '../db/index.js';
import { ValidationError } from '../errors/AppError.js';
import { renderTemplate, TEMPLATES } from './templates.js';

export class OutboxChannelAdapter implements ChannelSender {
  constructor(public readonly channel: OutboxMessage['channel']) {}

  async send(
    message: OutboxMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string; body?: string }> {
    let finalBody = message.body || '';
    let templateKey = message.templateName || 'custom';

    // WhatsApp Rule: WhatsApp sends are strictly template-only (free-form text rejected)
    if (this.channel === 'whatsapp') {
      if (!message.templateName || !TEMPLATES[message.templateName]) {
        throw new ValidationError(
          'WhatsApp messages must use an approved template. Free-form text is rejected per WhatsApp Business API policies.',
        );
      }

      const rendered = renderTemplate(message.templateName, message.payload || {});
      finalBody = rendered.body;
      templateKey = rendered.templateKey;
    } else if (message.templateName && TEMPLATES[message.templateName]) {
      const rendered = renderTemplate(message.templateName, message.payload || {});
      finalBody = rendered.body;
      templateKey = rendered.templateKey;
    }

    if (!finalBody) {
      throw new ValidationError('Outbound message body cannot be empty');
    }

    // Persist to outbound_messages table (Outbox pattern)
    const dbRes = await query<{ id: string }>(
      `INSERT INTO outbound_messages (lead_id, channel, template_key, body, status, sent_at)
       VALUES ($1, $2, $3, $4, 'sent', NOW())
       RETURNING id`,
      [message.leadId, this.channel, templateKey, finalBody],
    );

    const externalId = dbRes.rows[0]?.id || `mock-${this.channel}-${Date.now()}`;

    logger.info(
      {
        channel: this.channel,
        recipient: message.recipient,
        template: templateKey,
        externalId,
      },
      `[Outbox Adapter] Dispatched message via ${this.channel}`,
    );

    return {
      success: true,
      externalId,
      body: finalBody,
    };
  }
}

export const whatsappAdapter = new OutboxChannelAdapter('whatsapp');
export const smsAdapter = new OutboxChannelAdapter('sms');
export const emailAdapter = new OutboxChannelAdapter('email');
