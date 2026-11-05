import { z } from 'zod';

// ==========================================
// PURE UTILITY FUNCTIONS
// ==========================================

/**
 * Normalizes an Indian phone number to E.164 format (+91XXXXXXXXXX).
 * Strips formatting (spaces, dashes, parentheses, dots).
 * Handles +91, 91, or leading 0.
 * Validates that the number has exactly 10 digits starting with 6, 7, 8, or 9.
 * Returns null if invalid or missing.
 */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  // Trim and strip non-digit, non-plus characters
  let cleaned = raw.trim().replace(/[^\d+]/g, '');

  // Strip international prefix / country codes
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // Remove any remaining plus or non-digit chars
  cleaned = cleaned.replace(/\D/g, '');

  // Indian mobile validation: 10 digits starting with 6-9
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  return null;
}

/**
 * Normalizes an email address: lowercases, trims whitespace, validates RFC format.
 * Returns null if invalid or missing.
 */
export function normalizeEmail(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

  return emailRegex.test(trimmed) ? trimmed : null;
}

/**
 * Generates trigrams matching PostgreSQL's pg_trgm word-level extraction.
 * Each alphanumeric word is padded with two leading spaces and one trailing space.
 */
function getTrigrams(str: string): Set<string> {
  const words = str.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const trigrams = new Set<string>();

  for (const word of words) {
    const padded = `  ${word} `;
    for (let i = 0; i <= padded.length - 3; i++) {
      trigrams.add(padded.slice(i, i + 3));
    }
  }

  return trigrams;
}

/**
 * Calculates string similarity between two names on a scale of 0.0 to 1.0.
 * Implements trigram Jaccard/Dice similarity matching PostgreSQL pg_trgm similarity().
 */
export function nameSimilarity(str1?: string | null, str2?: string | null): number {
  if (!str1 || !str2) return 0;

  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();
  if (s1 === s2) return 1.0;

  const t1 = getTrigrams(s1);
  const t2 = getTrigrams(s2);

  if (t1.size === 0 || t2.size === 0) return 0;

  let intersection = 0;
  for (const tri of t1) {
    if (t2.has(tri)) {
      intersection++;
    }
  }

  const union = new Set([...t1, ...t2]).size;
  return union === 0 ? 0 : intersection / union;
}

// ==========================================
// SCHEMAS & TYPES
// ==========================================

export const LeadSourceSchema = z.enum([
  'property_portal',
  'social_ad',
  'website',
  'hoarding_call',
]);
export type LeadSource = z.infer<typeof LeadSourceSchema>;

export const LeadStatusSchema = z.enum([
  'new',
  'engaged',
  'visit_booked',
  'visited',
  'no_show',
  'lost',
]);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const ConsentStatusSchema = z.enum(['granted', 'withdrawn', 'unknown']);
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;

export const LeadIngestPayloadSchema = z.object({
  name: z.string().min(1, 'Name is required').max(150),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  wants: z.string().optional().nullable().default('2 BHK'),
  budgetMin: z.number().int().nonnegative().optional().nullable(),
  budgetMax: z.number().int().nonnegative().optional().nullable(),
  timeline: z.string().optional().nullable(),
  language: z.enum(['en', 'hi', 'gu']).optional().default('en'),
  consent: z.boolean().optional().default(true),
  externalId: z.string().max(255).optional().nullable(),
  meta: z.record(z.unknown()).optional().default({}),
});
export type LeadIngestInput = z.input<typeof LeadIngestPayloadSchema>;
export type LeadIngestPayload = z.infer<typeof LeadIngestPayloadSchema>;

export const LeadIngestOutcomeSchema = z.object({
  outcome: z.enum(['created', 'merged', 'possible_duplicate', 'idempotent']),
  leadId: z.string().uuid(),
  publicId: z.string().optional(),
  duplicateOf: z.string().uuid().optional(),
  message: z.string().optional(),
});
export type LeadIngestOutcome = z.infer<typeof LeadIngestOutcomeSchema>;

export const LeadListItemSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string(),
  name: z.string(),
  phoneE164: z.string().nullable(),
  email: z.string().nullable(),
  source: LeadSourceSchema,
  projectId: z.string().uuid().nullable(),
  projectName: z.string().nullable(),
  wants: z.string(),
  budgetMin: z.number().nullable(),
  budgetMax: z.number().nullable(),
  timeline: z.string().nullable(),
  language: z.string(),
  status: LeadStatusSchema,
  assignedTo: z.string().uuid().nullable(),
  assignedToName: z.string().nullable(),
  possibleDuplicateOf: z.string().uuid().nullable(),
  possibleDuplicateName: z.string().nullable(),
  touchpointsCount: z.number(),
  consentStatus: ConsentStatusSchema,
  firstTouchAt: z.string(),
  firstResponseAt: z.string().nullable(),
  lastActivityAt: z.string(),
});
export type LeadListItem = z.infer<typeof LeadListItemSchema>;

export const LeadTouchpointSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  source: z.string(),
  channel: z.string(),
  occurredAt: z.string(),
  externalId: z.string().nullable(),
  raw: z.record(z.unknown()),
});
export type LeadTouchpoint = z.infer<typeof LeadTouchpointSchema>;

export const LeadDetailSchema = LeadListItemSchema.extend({
  touchpoints: z.array(LeadTouchpointSchema),
  conversations: z.array(
    z.object({
      id: z.string().uuid(),
      status: z.enum(['ai', 'human', 'closed']),
      language: z.string(),
      flagged: z.boolean(),
      flagReasons: z.array(z.string()),
      createdAt: z.string(),
      messagesCount: z.number(),
    }),
  ),
  bookings: z.array(
    z.object({
      id: z.string().uuid(),
      status: z.string(),
      date: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      projectName: z.string(),
      executiveName: z.string(),
    }),
  ),
  handoffs: z.array(
    z.object({
      id: z.string().uuid(),
      reason: z.string(),
      summary: z.record(z.unknown()),
      status: z.string(),
      executiveName: z.string(),
      createdAt: z.string(),
    }),
  ),
});
export type LeadDetail = z.infer<typeof LeadDetailSchema>;

export const LeadFilterQuerySchema = z.object({
  source: LeadSourceSchema.optional(),
  projectId: z.string().uuid().optional(),
  status: LeadStatusSchema.optional(),
  duplicatesOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((val) => val === true || val === 'true'),
  unassignedOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((val) => val === true || val === 'true'),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['last_activity_at', 'first_touch_at', 'name']).optional().default('last_activity_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});
export type LeadFilterQuery = z.infer<typeof LeadFilterQuerySchema>;

export const LeadMergePayloadSchema = z.object({
  primaryLeadId: z.string().uuid('Primary lead ID must be a valid UUID'),
  secondaryLeadId: z.string().uuid('Secondary lead ID must be a valid UUID'),
});
export type LeadMergePayload = z.infer<typeof LeadMergePayloadSchema>;

export const CsvPreviewRowSchema = z.object({
  rowIndex: z.number(),
  raw: z.record(z.string()),
  normalized: z.object({
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    source: LeadSourceSchema,
    projectName: z.string().optional(),
    wants: z.string(),
    consent: z.boolean(),
  }),
  classification: z.enum(['new', 'duplicate', 'possible_duplicate', 'invalid']),
  matchedLeadId: z.string().uuid().optional(),
  matchedLeadName: z.string().optional(),
  errors: z.array(z.string()),
});
export type CsvPreviewRow = z.infer<typeof CsvPreviewRowSchema>;

export const CsvCommitPayloadSchema = z.object({
  source: LeadSourceSchema,
  rows: z.array(
    z.object({
      name: z.string(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      projectId: z.string().uuid().optional().nullable(),
      wants: z.string().optional().default('2 BHK'),
      budgetMin: z.number().optional().nullable(),
      budgetMax: z.number().optional().nullable(),
      consent: z.boolean().optional().default(true),
      externalId: z.string().optional().nullable(),
    }),
  ),
});
export type CsvCommitPayload = z.infer<typeof CsvCommitPayloadSchema>;
