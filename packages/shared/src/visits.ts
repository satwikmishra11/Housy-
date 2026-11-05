import { z } from 'zod';

export const SlotStatusSchema = z.enum(['open', 'booked', 'blocked']);
export type SlotStatus = z.infer<typeof SlotStatusSchema>;

export const BookingStatusSchema = z.enum(['confirmed', 'cancelled', 'completed', 'no_show']);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const ReminderKindSchema = z.enum(['24h', '2h']);
export type ReminderKind = z.infer<typeof ReminderKindSchema>;

export const ReminderStatusSchema = z.enum(['pending', 'sent', 'skipped', 'cancelled', 'failed']);
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;

export const SlotAlternativeSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  displayTime: z.string().optional(),
});
export type SlotAlternative = z.infer<typeof SlotAlternativeSchema>;

export const SlotItemSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  displayTime: z.string(),
  availableCount: z.number().int().min(1),
});
export type SlotItem = z.infer<typeof SlotItemSchema>;

export const DaySlotsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  dayName: z.string(),
  slots: z.array(SlotItemSchema),
});
export type DaySlots = z.infer<typeof DaySlotsSchema>;

export const ProjectSlotsResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    days: z.array(DaySlotsSchema),
    nextAvailableDate: z.string().optional(),
  }),
});
export type ProjectSlotsResponse = z.infer<typeof ProjectSlotsResponseSchema>;

export const BookVisitPayloadSchema = z.object({
  leadId: z.string().uuid(),
  startsAt: z.string().datetime({ message: 'startsAt must be a valid ISO 8601 UTC timestamp' }),
  idempotencyKey: z.string().min(8).max(128),
});
export type BookVisitPayload = z.infer<typeof BookVisitPayloadSchema>;

export const RescheduleVisitPayloadSchema = z.object({
  newStartsAt: z.string().datetime({ message: 'newStartsAt must be a valid ISO 8601 UTC timestamp' }),
});
export type RescheduleVisitPayload = z.infer<typeof RescheduleVisitPayloadSchema>;

export const CancelVisitPayloadSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type CancelVisitPayload = z.infer<typeof CancelVisitPayloadSchema>;

export const VisitOutcomePayloadSchema = z.object({
  outcome: z.enum(['visited', 'no_show']),
  notes: z.string().max(1000).optional(),
});
export type VisitOutcomePayload = z.infer<typeof VisitOutcomePayloadSchema>;

export const VisitDetailSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  leadName: z.string(),
  leadPhone: z.string().nullable(),
  leadPublicId: z.string().nullable().optional(),
  projectId: z.string().uuid(),
  projectName: z.string(),
  projectAddress: z.string(),
  lat: z.number(),
  lng: z.number(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: BookingStatusSchema,
  executiveId: z.string().uuid(),
  executiveName: stringOrNullToDefault(z.string().nullable()),
  executivePhone: z.string().nullable().optional(),
  token: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type VisitDetail = z.infer<typeof VisitDetailSchema>;

function stringOrNullToDefault(schema: z.ZodNullable<z.ZodString>) {
  return schema.transform((val) => val ?? 'Assigned Representative');
}

export const ExecutiveVisitItemSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  leadId: z.string().uuid(),
  leadName: z.string(),
  leadPhone: z.string().nullable(),
  leadPublicId: z.string().nullable().optional(),
  projectId: z.string().uuid(),
  projectName: z.string(),
  projectAddress: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: BookingStatusSchema,
  executiveId: z.string().uuid(),
  executiveName: z.string(),
  isAwaitingOutcome: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ExecutiveVisitItem = z.infer<typeof ExecutiveVisitItemSchema>;

export const ExecutiveVisitsResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    upcoming: z.array(ExecutiveVisitItemSchema),
    awaitingOutcome: z.array(ExecutiveVisitItemSchema),
  }),
});
export type ExecutiveVisitsResponse = z.infer<typeof ExecutiveVisitsResponseSchema>;
