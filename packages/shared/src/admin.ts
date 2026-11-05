import { z } from 'zod';
import { LeadSourceSchema } from './leads.js';
import { BookingStatusSchema, SlotStatusSchema } from './visits.js';

// ---------------------------------------------------------------------------
// Fact Sheet Schemas
// ---------------------------------------------------------------------------

export const FactStatusSchema = z.enum(['active', 'archived']);
export type FactStatus = z.infer<typeof FactStatusSchema>;

export const FactCategorySchema = z.string().min(2).max(50);

export const FactEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  projectName: z.string().nullable().optional(),
  key: z.string().min(2).max(100),
  title: z.string().min(2).max(200),
  value: z.string().min(2).max(2000),
  category: z.string().min(2).max(50),
  status: FactStatusSchema,
  updatedBy: z.string().uuid().nullable().optional(),
  updatedByName: z.string().nullable().optional(),
  updatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type FactEntry = z.infer<typeof FactEntrySchema>;
export type Fact = FactEntry;

export const FactEntryVersionSchema = z.object({
  id: z.string().uuid(),
  factEntryId: z.string().uuid(),
  versionNumber: z.number().int().min(1),
  title: z.string(),
  value: z.string(),
  category: z.string(),
  status: z.string(),
  changedBy: z.string().uuid().nullable().optional(),
  changedByName: z.string().nullable().optional(),
  changedAt: z.string().datetime(),
});
export type FactEntryVersion = z.infer<typeof FactEntryVersionSchema>;

export const CreateFactPayloadSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  key: z
    .string()
    .min(2, 'Key must be at least 2 characters')
    .max(100, 'Key must be at most 100 characters')
    .regex(/^[a-z0-9_-]+$/i, 'Key must contain only letters, numbers, underscores or hyphens'),
  title: z
    .string()
    .min(2, 'Title must be at least 2 characters')
    .max(200, 'Title cannot exceed 200 characters'),
  value: z
    .string()
    .min(2, 'Value must be at least 2 characters')
    .max(2000, 'Value cannot exceed 2000 characters'),
  category: z
    .string()
    .min(2, 'Category must be at least 2 characters')
    .max(50, 'Category cannot exceed 50 characters'),
});
export type CreateFactPayload = z.infer<typeof CreateFactPayloadSchema>;

export const UpdateFactPayloadSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  value: z.string().min(2).max(2000).optional(),
  category: z.string().min(2).max(50).optional(),
  status: FactStatusSchema.optional(),
});
export type UpdateFactPayload = z.infer<typeof UpdateFactPayloadSchema>;

export const FactAssistantPreviewItemSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  projectName: z.string(),
  category: z.string(),
  key: z.string(),
  title: z.string(),
  value: z.string(),
  injectedPromptText: z.string(),
});
export type FactAssistantPreviewItem = z.infer<typeof FactAssistantPreviewItemSchema>;

// ---------------------------------------------------------------------------
// Unanswered Questions Schemas
// ---------------------------------------------------------------------------

export const UnansweredQuestionStatusSchema = z.enum(['unresolved', 'resolved', 'dismissed']);
export type UnansweredQuestionStatus = z.infer<typeof UnansweredQuestionStatusSchema>;

export const UnansweredQuestionSchema = z.object({
  id: z.string().uuid(),
  question: z.string().min(1),
  buyerLanguage: z.string(),
  projectId: z.string().uuid().nullable(),
  projectName: z.string().nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  status: UnansweredQuestionStatusSchema,
  resolvedBy: z.string().uuid().nullable().optional(),
  resolvedByName: z.string().nullable().optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type UnansweredQuestion = z.infer<typeof UnansweredQuestionSchema>;

export const ResolveQuestionPayloadSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
});
export type ResolveQuestionPayload = z.infer<typeof ResolveQuestionPayloadSchema>;

// ---------------------------------------------------------------------------
// Availability Rules & Blackout Dates Schemas
// ---------------------------------------------------------------------------

export const AdminAvailabilityRuleSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  projectName: z.string().optional(),
  executiveId: z.string().uuid(),
  executiveName: z.string().optional(),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  slotMinutes: z.number().int().min(15).max(180),
  createdAt: z.string().datetime().optional(),
});
export type AdminAvailabilityRule = z.infer<typeof AdminAvailabilityRuleSchema>;

export const CreateAvailabilityRulePayloadSchema = z.object({
  projectId: z.string().uuid({ message: 'Valid project ID is required' }),
  executiveId: z.string().uuid({ message: 'Valid executive ID is required' }),
  weekday: z.number().int().min(0).max(6, { message: 'Weekday must be 0 (Sunday) to 6 (Saturday)' }),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Start time must be HH:MM or HH:MM:SS'),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'End time must be HH:MM or HH:MM:SS'),
  slotMinutes: z.number().int().min(15).max(180).default(60),
});
export type CreateAvailabilityRulePayload = z.infer<typeof CreateAvailabilityRulePayloadSchema>;

export const AdminBlackoutDateSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  projectName: z.string().nullable().optional(),
  executiveId: z.string().uuid().nullable(),
  executiveName: z.string().nullable().optional(),
  blackoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
});
export type AdminBlackoutDate = z.infer<typeof AdminBlackoutDateSchema>;

export const CreateBlackoutDatePayloadSchema = z.object({
  blackoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  projectId: z.string().uuid().nullable().optional(),
  executiveId: z.string().uuid().nullable().optional(),
  reason: z.string().max(255).nullable().optional(),
});
export type CreateBlackoutDatePayload = z.infer<typeof CreateBlackoutDatePayloadSchema>;

// ---------------------------------------------------------------------------
// Admin Slot Preview & Block Schemas
// ---------------------------------------------------------------------------

export const AdminSlotItemSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  projectName: z.string().optional(),
  executiveId: z.string().uuid(),
  executiveName: z.string().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: SlotStatusSchema,
  booking: z
    .object({
      id: z.string().uuid(),
      leadId: z.string().uuid(),
      leadName: z.string(),
      leadPhone: z.string().nullable().optional(),
      leadPublicId: z.string().nullable().optional(),
      status: BookingStatusSchema,
    })
    .nullable()
    .optional(),
});
export type AdminSlotItem = z.infer<typeof AdminSlotItemSchema>;

export const BlockSlotPayloadSchema = z.object({
  reason: z.string().max(255).optional(),
});
export type BlockSlotPayload = z.infer<typeof BlockSlotPayloadSchema>;

// ---------------------------------------------------------------------------
// Ad Spend Schemas
// ---------------------------------------------------------------------------

export const AdSpendAllocationItemSchema = z.object({
  source: LeadSourceSchema,
  amountInr: z.number().min(0, 'Spend cannot be negative'),
});
export type AdSpendAllocationItem = z.infer<typeof AdSpendAllocationItemSchema>;

export const MonthSpendRecordSchema = z.object({
  id: z.string().uuid().optional(),
  month: z.string(), // "YYYY-MM" or "YYYY-MM-DD"
  source: LeadSourceSchema,
  amountInr: z.number(),
  createdAt: z.string().datetime().optional(),
});
export type MonthSpendRecord = z.infer<typeof MonthSpendRecordSchema>;

export const UpdateMonthlySpendPayloadSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Month must be in YYYY-MM or YYYY-MM-DD format'),
  allocations: z.array(AdSpendAllocationItemSchema).min(1, 'At least one source allocation required'),
});
export type UpdateMonthlySpendPayload = z.infer<typeof UpdateMonthlySpendPayloadSchema>;

