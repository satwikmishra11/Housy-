import type { ChannelSender, OutboxMessage } from './channels.types.js';
import { logger } from '../utils/logger.js';

export class OutboxChannelAdapter implements ChannelSender {
  constructor(public readonly channel: OutboxMessage['channel']) {}

  async send(
    message: OutboxMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    logger.info(
      {
        channel: this.channel,
        recipient: message.recipient,
        template: message.templateName,
      },
      `[Outbox Adapter] Dispatched message via ${this.channel}`,
    );

    // Mock adapter returns successful outbox delivery identifier
    return {
      success: true,
      externalId: `mock-${this.channel}-${Date.now()}`,
    };
  }
}

export const whatsappAdapter = new OutboxChannelAdapter('whatsapp');
export const smsAdapter = new OutboxChannelAdapter('sms');
export const emailAdapter = new OutboxChannelAdapter('email');

