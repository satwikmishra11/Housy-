import { z } from 'zod';

export const ChannelTypeSchema = z.enum(['whatsapp', 'sms', 'email']);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

export const MessageStatusSchema = z.enum(['pending', 'sent', 'failed', 'delivered']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const OutboxMessageSchema = z.object({
  id: z.string().uuid().optional(),
  leadId: z.string().uuid(),
  recipient: z.string().min(1),
  channel: ChannelTypeSchema,
  templateName: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
  body: z.string().optional(),
  status: MessageStatusSchema.default('pending'),
  attempts: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime().optional(),
  sentAt: z.string().datetime().nullable().optional(),
});

export type OutboxMessage = z.infer<typeof OutboxMessageSchema>;

export interface ChannelSender {
  channel: ChannelType;
  send(message: OutboxMessage): Promise<{ success: boolean; externalId?: string; error?: string; body?: string }>;
}
