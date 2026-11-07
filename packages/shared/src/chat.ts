import { z } from 'zod';
import { LeadSourceSchema } from './leads.js';

export const ChatLanguageSchema = z.enum(['en', 'hi', 'gu']);
export type ChatLanguage = z.infer<typeof ChatLanguageSchema>;

export const ChatUiActionSchema = z.enum(['show_slots', 'collect_contact']);
export type ChatUiAction = z.infer<typeof ChatUiActionSchema>;

export const ChatMessageRoleSchema = z.enum(['buyer', 'assistant', 'executive', 'system']);
export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>;

export const ChatStartPayloadSchema = z.object({
  language: ChatLanguageSchema.optional().default('en'),
  projectId: z.string().uuid().optional(),
  source: LeadSourceSchema.optional(),
});
export type ChatStartPayload = z.infer<typeof ChatStartPayloadSchema>;

export const ChatMessagePayloadSchema = z.object({
  conversationId: z.string().uuid({ message: 'Must be a valid conversation UUID' }),
  message: z.string().min(1, 'Message cannot be empty').max(1000, 'Message cannot exceed 1000 characters'),
  language: ChatLanguageSchema.optional(),
});
export type ChatMessagePayload = z.infer<typeof ChatMessagePayloadSchema>;

export const ChatBookPayloadSchema = z.object({
  conversationId: z.string().uuid({ message: 'Must be a valid conversation UUID' }),
  projectId: z.string().uuid({ message: 'Must be a valid project UUID' }),
  startsAt: z.string().datetime({ message: 'startsAt must be a valid ISO 8601 UTC datetime string' }),
  idempotencyKey: z.string().min(4, 'idempotencyKey is required'),
  name: z.string().min(2).max(100).optional(),
  phone: z.string().min(10).max(20).optional(),
  email: z.string().email().optional(),
  consent: z.boolean().optional(),
});
export type ChatBookPayload = z.infer<typeof ChatBookPayloadSchema>;

export const ChatHistoryQuerySchema = z.object({
  conversationId: z.string().uuid({ message: 'Must be a valid conversation UUID' }),
});
export type ChatHistoryQuery = z.infer<typeof ChatHistoryQuerySchema>;

export const ChatReplySchema = z.object({
  text: stringValue(),
  language: ChatLanguageSchema,
  confidence: z.number().min(0).max(1),
  citedFactIds: z.array(z.string().uuid()),
  quickReplies: z.array(z.string()).optional(),
  uiAction: ChatUiActionSchema.optional(),
  conversationId: z.string().uuid(),
  isHandoff: z.boolean().optional(),
  flagReasons: z.array(z.string()).optional(),
});
export type ChatReply = z.infer<typeof ChatReplySchema>;

function stringValue() {
  return z.string();
}

export const ChatHistoryItemSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: ChatMessageRoleSchema,
  content: z.string(),
  citedFactIds: z.array(z.string().uuid()),
  meta: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});
export type ChatHistoryItem = z.infer<typeof ChatHistoryItemSchema>;

export const ChatStartResponseSchema = z.object({
  success: z.literal(true),
  conversationId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional().nullable(),
  sessionToken: z.string(),
  language: ChatLanguageSchema,
  greeting: z.string(),
  quickReplies: z.array(z.string()).optional(),
});
export type ChatStartResponse = z.infer<typeof ChatStartResponseSchema>;
