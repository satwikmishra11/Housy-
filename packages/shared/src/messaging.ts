import { z } from 'zod';
import { LeadSourceSchema, type ConsentStatus } from './leads.js';
import { ChatLanguageSchema } from './chat.js';

// ==========================================
// 1. DPDP 2023 CONSENT & OPT-OUT LOGIC
// ==========================================

export interface CanContactLeadInput {
  consent_status?: ConsentStatus | string | null;
  consentStatus?: ConsentStatus | string | null;
  opted_out_at?: string | Date | null;
  optedOutAt?: string | Date | null;
}

/**
 * Pure DPDP 2023 compliance check.
 * Used by every outbound communication path (first response, reminders, promotional messages).
 * Returns false if:
 * - consent is not explicitly 'granted'
 * - lead has opted out (opted_out_at is present)
 */
export function canContact(
  lead?: CanContactLeadInput | null,
  _channel?: 'whatsapp' | 'sms' | 'email' | string,
): boolean {
  if (!lead) return false;

  const optedOut = lead.opted_out_at ?? lead.optedOutAt;
  if (optedOut !== null && optedOut !== undefined) {
    return false;
  }

  const status = lead.consent_status ?? lead.consentStatus;
  return status === 'granted';
}

// ==========================================
// 2. HANDOFF SCHEMAS
// ==========================================

export const HandoffSentimentSchema = z.enum(['positive', 'neutral', 'skeptical', 'urgent']);
export type HandoffSentiment = z.infer<typeof HandoffSentimentSchema>;

export const HandoffStatusSchema = z.enum(['new', 'accepted', 'done']);
export type HandoffStatus = z.infer<typeof HandoffStatusSchema>;

/**
 * Strict JSON schema for AI-generated buyer lead handoff summaries.
 */
export const HandoffSummarySchema = z.object({
  name: z.string().min(1),
  phone: z.string(),
  language: ChatLanguageSchema,
  project: z.string(),
  wants: z.string(),
  budgetRange: z.string(),
  timeline: z.string(),
  keyQuestionsAsked: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  visitTime: z.string().nullable().default(null),
  sentiment: HandoffSentimentSchema.default('neutral'),
});
export type HandoffSummary = z.infer<typeof HandoffSummarySchema>;

export const HandoffItemSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  leadPublicId: z.string(),
  leadName: z.string(),
  leadPhone: z.string().nullable(),
  conversationId: z.string().uuid(),
  executiveId: z.string().uuid(),
  executiveName: z.string(),
  executivePhone: z.string().nullable().optional(),
  reason: z.string(),
  summary: HandoffSummarySchema,
  status: HandoffStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type HandoffItem = z.infer<typeof HandoffItemSchema>;

export const HandoffListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(HandoffItemSchema),
  totalCount: z.number().int().nonnegative(),
});
export type HandoffListResponse = z.infer<typeof HandoffListResponseSchema>;

// ==========================================
// 3. FLAGGED CONVERSATION REVIEW SCHEMAS
// ==========================================

export const FlaggedConversationItemSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  leadPublicId: z.string(),
  leadName: z.string(),
  leadPhone: z.string().nullable(),
  source: LeadSourceSchema,
  language: ChatLanguageSchema,
  flagged: z.boolean(),
  flagReasons: z.array(z.string()),
  reviewedBy: z.string().uuid().nullable(),
  reviewedByName: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewNote: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number().int().nonnegative(),
});
export type FlaggedConversationItem = z.infer<typeof FlaggedConversationItemSchema>;

export const FlaggedReviewListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(FlaggedConversationItemSchema),
  unreviewedCount: z.number().int().nonnegative(),
});
export type FlaggedReviewListResponse = z.infer<typeof FlaggedReviewListResponseSchema>;

export const MarkFlaggedReviewedPayloadSchema = z.object({
  note: z.string().min(1, 'Review note is required').max(1000),
});
export type MarkFlaggedReviewedPayload = z.infer<typeof MarkFlaggedReviewedPayloadSchema>;

// ==========================================
// 4. WHATSAPP TEMPLATES & OUTBOX SCHEMAS
// ==========================================

export const WhatsAppTemplateKeySchema = z.enum([
  'visit_confirmation',
  'reminder_24h',
  'reminder_2h',
  'first_response_link',
]);
export type WhatsAppTemplateKey = z.infer<typeof WhatsAppTemplateKeySchema>;

export const OutboundMessageItemSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  leadPublicId: z.string(),
  leadName: z.string(),
  leadPhone: z.string().nullable(),
  channel: z.enum(['whatsapp', 'sms', 'email']),
  templateKey: z.string(),
  body: z.string(),
  status: z.enum(['pending', 'sent', 'failed']),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  sentAt: z.string().nullable().optional(),
});
export type OutboundMessageItem = z.infer<typeof OutboundMessageItemSchema>;

export const OutboxListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(OutboundMessageItemSchema),
  totalCount: z.number().int().nonnegative(),
});
export type OutboxListResponse = z.infer<typeof OutboxListResponseSchema>;

// ==========================================
// 5. DEMO SIMULATION SCHEMAS
// ==========================================

export const DemoSimulateLeadPayloadSchema = z.object({
  source: LeadSourceSchema,
  name: z.string().min(2).max(100).optional(),
  phone: z.string().optional(),
  wants: z.string().optional(),
  projectId: z.string().uuid().optional(),
});
export type DemoSimulateLeadPayload = z.infer<typeof DemoSimulateLeadPayloadSchema>;

export const DemoFastForwardRemindersPayloadSchema = z.object({
  bookingId: z.string().uuid().optional(),
});
export type DemoFastForwardRemindersPayload = z.infer<typeof DemoFastForwardRemindersPayloadSchema>;
