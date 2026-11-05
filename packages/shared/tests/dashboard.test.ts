import { describe, it, expect } from 'vitest';
import {
  formatDurationSeconds,
  formatRatePercent,
  formatPercentValue,
  formatInrCurrency,
  getLeadSourceLabel,
  DashboardFilterQuerySchema,
  SalesKpiSummarySchema,
  SourceMetricItemSchema,
  FunnelStageItemSchema,
  SalesDashboardDataSchema,
} from '../src/index.js';

describe('Dashboard Shared Schemas & Formatting Utilities', () => {
  describe('formatDurationSeconds', () => {
    it('returns "-" for null, undefined, NaN, or negative values', () => {
      expect(formatDurationSeconds(null)).toBe('-');
      expect(formatDurationSeconds(undefined)).toBe('-');
      expect(formatDurationSeconds(NaN)).toBe('-');
      expect(formatDurationSeconds(-10)).toBe('-');
    });

    it('formats values under 60 seconds as Xs', () => {
      expect(formatDurationSeconds(0)).toBe('0s');
      expect(formatDurationSeconds(45)).toBe('45s');
      expect(formatDurationSeconds(59.4)).toBe('59s');
    });

    it('formats values over 60 seconds as Xm Ys or exact minutes', () => {
      expect(formatDurationSeconds(60)).toBe('1m');
      expect(formatDurationSeconds(120)).toBe('2m');
      expect(formatDurationSeconds(125)).toBe('2m 5s');
      expect(formatDurationSeconds(300)).toBe('5m');
      expect(formatDurationSeconds(345)).toBe('5m 45s');
    });
  });

  describe('formatRatePercent & formatPercentValue', () => {
    it('returns "-" for null, undefined, or NaN', () => {
      expect(formatRatePercent(null)).toBe('-');
      expect(formatRatePercent(undefined)).toBe('-');
      expect(formatRatePercent(NaN)).toBe('-');
      expect(formatPercentValue(null)).toBe('-');
      expect(formatPercentValue(undefined)).toBe('-');
    });

    it('formats ratio correctly as percentage string', () => {
      expect(formatRatePercent(0.08)).toBe('8.0%');
      expect(formatRatePercent(0.06)).toBe('6.0%');
      expect(formatRatePercent(0.75)).toBe('75.0%');
      expect(formatRatePercent(0.0825, 2)).toBe('8.25%');
    });

    it('formats percentage value directly', () => {
      expect(formatPercentValue(4.2)).toBe('4.2%');
      expect(formatPercentValue(0)).toBe('0.0%');
    });
  });

  describe('formatInrCurrency', () => {
    it('returns "-" for null, undefined, or NaN', () => {
      expect(formatInrCurrency(null)).toBe('-');
      expect(formatInrCurrency(undefined)).toBe('-');
      expect(formatInrCurrency(NaN)).toBe('-');
    });

    it('formats currency with Indian comma separation', () => {
      expect(formatInrCurrency(0)).toBe('₹0');
      expect(formatInrCurrency(1500)).toBe('₹1,500');
      expect(formatInrCurrency(50000)).toBe('₹50,000');
      expect(formatInrCurrency(1200000)).toBe('₹12,00,000');
    });
  });

  describe('getLeadSourceLabel', () => {
    it('returns clear display labels for all sources', () => {
      expect(getLeadSourceLabel('property_portal')).toBe('Property Portal');
      expect(getLeadSourceLabel('social_ad')).toBe('Social Media Ad');
      expect(getLeadSourceLabel('website')).toBe('Website Enquiry');
      expect(getLeadSourceLabel('hoarding_call')).toBe('Hoarding Phone Call');
    });
  });

  describe('DashboardFilterQuerySchema', () => {
    it('defaults period to 30d when empty', () => {
      const parsed = DashboardFilterQuerySchema.parse({});
      expect(parsed.period).toBe('30d');
      expect(parsed.from).toBeUndefined();
      expect(parsed.to).toBeUndefined();
    });

    it('validates custom date range', () => {
      const valid = DashboardFilterQuerySchema.parse({
        period: 'custom',
        from: '2026-11-01',
        to: '2026-11-07',
      });
      expect(valid.period).toBe('custom');
      expect(valid.from).toBe('2026-11-01');
      expect(valid.to).toBe('2026-11-07');
    });

    it('rejects invalid date format', () => {
      expect(() =>
        DashboardFilterQuerySchema.parse({
          from: '01/11/2026',
        }),
      ).toThrow();
    });
  });

  describe('SalesDashboardDataSchema', () => {
    it('validates a complete dashboard data object', () => {
      const sample = {
        filter: {
          period: '30d' as const,
          from: '2026-10-07',
          to: '2026-11-06',
        },
        userRole: 'sales_head' as const,
        summary: {
          medianFirstResponseSeconds: 180,
          medianFirstResponseFormatted: '3m',
          medianResponseTargetSeconds: 300,
          unreached48hCount: 2,
          unreached48hPercent: 3.5,
          unreached48hFormatted: '3.5%',
          unreachedTargetPercent: 5.0,
          totalLeads: 57,
          engagedLeads: 45,
          visitsBooked: 12,
          visitsCompleted: 8,
          visitsNoShow: 2,
          showUpRate: 0.8,
          showUpRateFormatted: '80.0%',
          leadToVisitRate: 0.14,
          leadToVisitRateFormatted: '14.0%',
          leadToVisitTargetRate: 0.08,
          leadToVisitBaselineRate: 0.06,
          isSmallSample: false,
        },
        bySource: [
          {
            source: 'property_portal' as const,
            sourceLabel: 'Property Portal',
            leadsCount: 25,
            medianResponseSeconds: 150,
            medianResponseFormatted: '2m 30s',
            visitsBooked: 6,
            visitsCompleted: 4,
            visitsNoShow: 1,
            showUpRate: 0.8,
            showUpRateFormatted: '80.0%',
            spendInr: 1200000,
            costPerVisitInr: 300000,
            costPerVisitFormatted: '₹3,00,000',
            isSmallSample: false,
          },
        ],
        funnel: [
          {
            stage: 'leads' as const,
            stageLabel: 'Total Leads',
            count: 57,
            conversionFromPrevious: 100,
            conversionFromPreviousFormatted: '100%',
            conversionFromTotal: 100,
            conversionFromTotalFormatted: '100%',
          },
          {
            stage: 'engaged' as const,
            stageLabel: 'Engaged Leads',
            count: 45,
            conversionFromPrevious: 78.9,
            conversionFromPreviousFormatted: '78.9%',
            conversionFromTotal: 78.9,
            conversionFromTotalFormatted: '78.9%',
          },
        ],
        responseTimeBySource: [
          {
            source: 'property_portal' as const,
            sourceLabel: 'Property Portal',
            medianResponseMinutes: 2.5,
            medianResponseSeconds: 150,
            targetMinutes: 5,
          },
        ],
        calculatedAt: new Date().toISOString(),
      };

      const parsed = SalesDashboardDataSchema.parse(sample);
      expect(parsed.summary.totalLeads).toBe(57);
      expect(parsed.funnel).toHaveLength(2);

      const kpiParsed = SalesKpiSummarySchema.parse(sample.summary);
      expect(kpiParsed.totalLeads).toBe(57);

      const sourceParsed = SourceMetricItemSchema.parse(sample.bySource[0]);
      expect(sourceParsed.source).toBe('property_portal');

      const funnelParsed = FunnelStageItemSchema.parse(sample.funnel[0]);
      expect(funnelParsed.stage).toBe('leads');
    });
  });
});
