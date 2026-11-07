import { z } from 'zod';
import { LeadSourceSchema, type LeadSource } from './leads.js';

// ==========================================
// SOURCE LABELS & FORMATTING UTILITIES
// ==========================================

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  property_portal: 'Property Portal',
  social_ad: 'Social Media Ad',
  website: 'Website Enquiry',
  hoarding_call: 'Hoarding Phone Call',
};

/**
 * Returns a human-friendly label for a lead source.
 */
export function getLeadSourceLabel(source: LeadSource): string {
  return LEAD_SOURCE_LABELS[source] || source;
}

/**
 * Formats a duration in seconds into a clean "Xm Ys" or "Xs" string.
 * Returns "-" for null or invalid values.
 */
export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds) || seconds < 0) {
    return '-';
  }
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/**
 * Formats a ratio (0.0 to 1.0) as a percentage string (e.g. "8.0%").
 * Returns "-" if null, undefined, or NaN.
 */
export function formatRatePercent(rate: number | null | undefined, decimals = 1): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) {
    return '-';
  }
  return `${(rate * 100).toFixed(decimals)}%`;
}

/**
 * Formats an already percentage-scaled number (0 to 100) into string (e.g. "4.5%").
 * Returns "-" if null, undefined, or NaN.
 */
export function formatPercentValue(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return '-';
  }
  return `${val.toFixed(decimals)}%`;
}

/**
 * Formats an INR amount as standard Indian Rupee notation (e.g. "₹12,500").
 * Returns "-" if null, undefined, or NaN.
 */
export function formatInrCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '-';
  }
  const rounded = Math.round(amount);
  return `₹${rounded.toLocaleString('en-IN')}`;
}

// ==========================================
// SCHEMAS & TYPES
// ==========================================

export const DashboardPeriodPresetSchema = z.enum(['7d', '30d', '90d', 'custom']);
export type DashboardPeriodPreset = z.infer<typeof DashboardPeriodPresetSchema>;

export const DashboardFilterQuerySchema = z.object({
  period: DashboardPeriodPresetSchema.default('30d'),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional(),
  projectId: z.string().uuid().optional(),
});
export type DashboardFilterQuery = z.infer<typeof DashboardFilterQuerySchema>;

export const SalesKpiSummarySchema = z.object({
  medianFirstResponseSeconds: z.number().nullable(),
  medianFirstResponseFormatted: z.string(),
  medianResponseTargetSeconds: z.number().default(300), // 5 min target
  unreached48hCount: z.number().int().min(0),
  unreached48hPercent: z.number().nullable(),
  unreached48hFormatted: z.string(),
  unreachedTargetPercent: z.number().default(5.0), // < 5% target
  totalLeads: z.number().int().min(0),
  chatsStarted: z.number().int().min(0).default(0), // Anonymous chats started separately from leads
  notContactableCount: z.number().int().min(0).default(0), // Non-consented leads excluded from 48h SLA denominator
  contactableLeadsCount: z.number().int().min(0).default(0),
  engagedLeads: z.number().int().min(0),
  visitsBooked: z.number().int().min(0),
  visitsCompleted: z.number().int().min(0),
  visitsNoShow: z.number().int().min(0),
  showUpRate: z.number().nullable(), // completed / (completed + no_show)
  showUpRateFormatted: z.string(),
  leadToVisitRate: z.number().nullable(), // completed / totalLeads
  leadToVisitRateFormatted: z.string(),
  leadToVisitTargetRate: z.number().default(0.08), // 8% target
  leadToVisitBaselineRate: z.number().default(0.06), // 6% baseline
  isSmallSample: z.boolean(),
});
export type SalesKpiSummary = z.infer<typeof SalesKpiSummarySchema>;

export const SourceMetricItemSchema = z.object({
  source: LeadSourceSchema,
  sourceLabel: z.string(),
  leadsCount: z.number().int().min(0),
  chatsStarted: z.number().int().min(0).default(0),
  medianResponseSeconds: z.number().nullable(),
  medianResponseFormatted: z.string(),
  visitsBooked: z.number().int().min(0),
  visitsCompleted: z.number().int().min(0),
  visitsNoShow: z.number().int().min(0),
  bookedCount: z.number().int().min(0).default(0),
  completedCount: z.number().int().min(0).default(0),
  showUpRate: z.number().nullable(),
  showUpRateFormatted: z.string(),
  spendInr: z.number().min(0),
  costPerVisitInr: z.number().nullable(),
  costPerVisitFormatted: z.string(),
  costPerCompletedVisit: z.number().nullable().optional(),
  costPerBookedVisit: z.number().nullable().optional(),
  spendSource: z.string().default('Ad Spend Allocation (₹30L/mo)'),
  isSmallSample: z.boolean(),
});
export type SourceMetricItem = z.infer<typeof SourceMetricItemSchema>;

export const BeforeAfterMetricsSchema = z.object({
  medianResponseSeconds: z.number().nullable(),
  medianResponseFormatted: z.string(),
  unreached48hPercent: z.number().nullable(),
  unreached48hFormatted: z.string(),
  leadToVisitRate: z.number().nullable(),
  leadToVisitFormatted: z.string(),
  totalLeads: z.number().int().min(0),
});
export type BeforeAfterMetrics = z.infer<typeof BeforeAfterMetricsSchema>;

export const BeforeAfterComparisonSchema = z.object({
  goLiveDate: z.string(),
  isDemoSimulated: z.literal(true).default(true),
  before: BeforeAfterMetricsSchema,
  after: BeforeAfterMetricsSchema,
});
export type BeforeAfterComparison = z.infer<typeof BeforeAfterComparisonSchema>;

export const FunnelStageKeySchema = z.enum(['leads', 'engaged', 'booked', 'visited']);
export type FunnelStageKey = z.infer<typeof FunnelStageKeySchema>;

export const FunnelStageItemSchema = z.object({
  stage: FunnelStageKeySchema,
  stageLabel: z.string(),
  count: z.number().int().min(0),
  conversionFromPrevious: z.number().nullable(),
  conversionFromPreviousFormatted: z.string(),
  conversionFromTotal: z.number().nullable(),
  conversionFromTotalFormatted: z.string(),
});
export type FunnelStageItem = z.infer<typeof FunnelStageItemSchema>;

export const ResponseTimeBySourceItemSchema = z.object({
  source: LeadSourceSchema,
  sourceLabel: z.string(),
  medianResponseMinutes: z.number().nullable(),
  medianResponseSeconds: z.number().nullable(),
  targetMinutes: z.number().default(5),
});
export type ResponseTimeBySourceItem = z.infer<typeof ResponseTimeBySourceItemSchema>;

export const SalesDashboardDataSchema = z.object({
  filter: z.object({
    period: DashboardPeriodPresetSchema,
    from: z.string(),
    to: z.string(),
    projectId: z.string().uuid().optional(),
  }),
  userRole: z.enum(['sales_head', 'executive']),
  scopedExecutiveId: z.string().uuid().optional(),
  summary: SalesKpiSummarySchema,
  bySource: z.array(SourceMetricItemSchema),
  funnel: z.array(FunnelStageItemSchema),
  responseTimeBySource: z.array(ResponseTimeBySourceItemSchema),
  comparison: BeforeAfterComparisonSchema.optional(),
  calculatedAt: z.string().datetime(),
});
export type SalesDashboardData = z.infer<typeof SalesDashboardDataSchema>;

