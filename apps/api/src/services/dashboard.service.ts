import {
  dashboardRepository,
  type DashboardRepository,
} from '../repositories/dashboard.repository.js';
import { DEFAULT_MONTHLY_SPEND_INR } from './ad-spend.service.js';
import {
  type DashboardFilterQuery,
  type SalesDashboardData,
  type SalesKpiSummary,
  type SourceMetricItem,
  type FunnelStageItem,
  type ResponseTimeBySourceItem,
  type LeadSource,
  getLeadSourceLabel,
  formatDurationSeconds,
  formatRatePercent,
  formatPercentValue,
  formatInrCurrency,
} from '@housy/shared';

const ALL_LEAD_SOURCES: LeadSource[] = [
  'property_portal',
  'social_ad',
  'website',
  'hoarding_call',
];

/**
 * Returns today's date string in Asia/Kolkata (YYYY-MM-DD).
 */
export function getTodayIstDateString(nowUtc: Date = new Date()): string {
  const istTime = new Date(nowUtc.getTime() + (5 * 60 + 30) * 60 * 1000);
  const y = istTime.getUTCFullYear();
  const m = String(istTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(istTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Subtracts N days from a YYYY-MM-DD date string.
 */
export function subtractDaysFromDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year!, month! - 1, day! - days, 12, 0, 0));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dayOut = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dayOut}`;
}

/**
 * Converts an IST date string (YYYY-MM-DD) to UTC start-of-day and end-of-day bounds.
 */
export function istDateStringToUtcRange(dateStr: string): { startUtc: Date; endUtc: Date } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const startMs = Date.UTC(year!, month! - 1, day!, 0, 0, 0, 0) - istOffsetMs;
  const endMs = Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999) - istOffsetMs;
  return {
    startUtc: new Date(startMs),
    endUtc: new Date(endMs),
  };
}

export interface UserAuthContext {
  id: string;
  role: 'sales_head' | 'executive';
}

export class DashboardService {
  constructor(private readonly repo: DashboardRepository = dashboardRepository) {}

  /**
   * Resolves date bounds in IST and UTC.
   */
  resolveDateBounds(
    period: '7d' | '30d' | '90d' | 'custom',
    customFrom?: string,
    customTo?: string,
    nowUtc: Date = new Date(),
  ): { fromStr: string; toStr: string; fromUtc: Date; toUtc: Date } {
    const todayStr = getTodayIstDateString(nowUtc);
    let fromStr = todayStr;
    let toStr = todayStr;

    if (period === '7d') {
      fromStr = subtractDaysFromDateString(todayStr, 6);
      toStr = todayStr;
    } else if (period === '30d') {
      fromStr = subtractDaysFromDateString(todayStr, 29);
      toStr = todayStr;
    } else if (period === '90d') {
      fromStr = subtractDaysFromDateString(todayStr, 89);
      toStr = todayStr;
    } else if (period === 'custom') {
      fromStr = customFrom || subtractDaysFromDateString(todayStr, 29);
      toStr = customTo || todayStr;
      if (fromStr > toStr) {
        const temp = fromStr;
        fromStr = toStr;
        toStr = temp;
      }
    }

    const { startUtc } = istDateStringToUtcRange(fromStr);
    const { endUtc } = istDateStringToUtcRange(toStr);

    return { fromStr, toStr, fromUtc: startUtc, toUtc: endUtc };
  }

  /**
   * Calculates prorated spend by source across the date range.
   */
  async calculateSpendForPeriod(
    fromStr: string,
    toStr: string,
  ): Promise<Record<LeadSource, number>> {
    const [fromY, fromM, fromD] = fromStr.split('-').map(Number);
    const [toY, toM, toD] = toStr.split('-').map(Number);

    // Identify unique months
    const uniqueMonthSet = new Set<string>();
    const curr = new Date(Date.UTC(fromY!, fromM! - 1, fromD!, 12, 0, 0));
    const end = new Date(Date.UTC(toY!, toM! - 1, toD!, 12, 0, 0));

    while (curr <= end) {
      const y = curr.getUTCFullYear();
      const m = String(curr.getUTCMonth() + 1).padStart(2, '0');
      uniqueMonthSet.add(`${y}-${m}-01`);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    const monthList = Array.from(uniqueMonthSet);
    const recordedSpendMap = await this.repo.getAdSpendForMonths(monthList);

    const spendBySource: Record<LeadSource, number> = {
      property_portal: 0,
      social_ad: 0,
      website: 0,
      hoarding_call: 0,
    };

    // Reset date cursor for daily proration
    const dayCursor = new Date(Date.UTC(fromY!, fromM! - 1, fromD!, 12, 0, 0));
    while (dayCursor <= end) {
      const y = dayCursor.getUTCFullYear();
      const m = dayCursor.getUTCMonth(); // 0-based
      const monthStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

      for (const source of ALL_LEAD_SOURCES) {
        const key = `${monthStr}:${source}`;
        const monthlySpend =
          recordedSpendMap.get(key) ?? DEFAULT_MONTHLY_SPEND_INR[source];
        const dailySpend = monthlySpend / daysInMonth;
        spendBySource[source] += dailySpend;
      }

      dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
    }

    return spendBySource;
  }

  /**
   * Main analytics aggregator computing all Sales Dashboard metrics.
   */
  async getDashboardMetrics(
    filter: DashboardFilterQuery,
    user: UserAuthContext,
  ): Promise<SalesDashboardData> {
    const { fromStr, toStr, fromUtc, toUtc } = this.resolveDateBounds(
      filter.period,
      filter.from,
      filter.to,
    );

    // Scoping: executive only sees their own assigned leads; sales_head sees all
    const scopedExecutiveId = user.role === 'executive' ? user.id : undefined;

    const [summaryRow, sourceRows, spendBySource] = await Promise.all([
      this.repo.getSummaryMetrics({
        fromUtc,
        toUtc,
        projectId: filter.projectId,
        executiveId: scopedExecutiveId,
      }),
      this.repo.getBySourceMetrics({
        fromUtc,
        toUtc,
        projectId: filter.projectId,
        executiveId: scopedExecutiveId,
      }),
      this.calculateSpendForPeriod(fromStr, toStr),
    ]);

    // Build map of DB rows by source
    const sourceRowMap = new Map<LeadSource, (typeof sourceRows)[0]>();
    for (const r of sourceRows) {
      sourceRowMap.set(r.source, r);
    }

    // Overall small sample check (< 5 total leads or < 5 completed visits)
    const isOverallSmallSample =
      summaryRow.total_leads < 5 || summaryRow.visits_completed < 5;

    // Show-up rate: completed / (completed + no_show)
    const overallShowUpDenom = summaryRow.visits_completed + summaryRow.visits_no_show;
    const overallShowUpRate =
      overallShowUpDenom > 0 ? summaryRow.visits_completed / overallShowUpDenom : null;

    // Lead-to-visit rate: completed / total_leads (target 8%, baseline 6%)
    const overallLeadToVisitRate =
      summaryRow.total_leads > 0 ? summaryRow.visits_completed / summaryRow.total_leads : null;

    // Leads not reached within 48h % (target < 5%)
    const unreached48hPercent =
      summaryRow.total_leads > 0
        ? Number(((summaryRow.unreached_48h_count / summaryRow.total_leads) * 100).toFixed(1))
        : null;

    const summary: SalesKpiSummary = {
      medianFirstResponseSeconds: summaryRow.median_response_seconds,
      medianFirstResponseFormatted: formatDurationSeconds(summaryRow.median_response_seconds),
      medianResponseTargetSeconds: 300,
      unreached48hCount: summaryRow.unreached_48h_count,
      unreached48hPercent,
      unreached48hFormatted: formatPercentValue(unreached48hPercent),
      unreachedTargetPercent: 5.0,
      totalLeads: summaryRow.total_leads,
      engagedLeads: summaryRow.engaged_leads,
      visitsBooked: summaryRow.visits_booked,
      visitsCompleted: summaryRow.visits_completed,
      visitsNoShow: summaryRow.visits_no_show,
      showUpRate: overallShowUpRate,
      showUpRateFormatted: formatRatePercent(overallShowUpRate),
      leadToVisitRate: overallLeadToVisitRate,
      leadToVisitRateFormatted: formatRatePercent(overallLeadToVisitRate),
      leadToVisitTargetRate: 0.08,
      leadToVisitBaselineRate: 0.06,
      isSmallSample: isOverallSmallSample,
    };

    // By-Source Table Items
    const bySource: SourceMetricItem[] = ALL_LEAD_SOURCES.map((source) => {
      const row = sourceRowMap.get(source);
      const leadsCount = row?.total_leads ?? 0;
      const visitsBooked = row?.visits_booked ?? 0;
      const visitsCompleted = row?.visits_completed ?? 0;
      const visitsNoShow = row?.visits_no_show ?? 0;
      const medianSecs = row?.median_response_seconds ?? null;

      const showUpDenom = visitsCompleted + visitsNoShow;
      const showUpRate = showUpDenom > 0 ? visitsCompleted / showUpDenom : null;

      const spendInr = Math.round(spendBySource[source] ?? 0);
      const costPerVisitInr =
        visitsCompleted > 0 ? Math.round(spendInr / visitsCompleted) : null;

      const isSmallSample = leadsCount < 5 || visitsCompleted < 5;

      return {
        source,
        sourceLabel: getLeadSourceLabel(source),
        leadsCount,
        medianResponseSeconds: medianSecs,
        medianResponseFormatted: formatDurationSeconds(medianSecs),
        visitsBooked,
        visitsCompleted,
        visitsNoShow,
        showUpRate,
        showUpRateFormatted: formatRatePercent(showUpRate),
        spendInr,
        costPerVisitInr,
        costPerVisitFormatted: formatInrCurrency(costPerVisitInr),
        isSmallSample,
      };
    });

    // Funnel Progression
    const totalLeads = summary.totalLeads;
    const engagedLeads = summary.engagedLeads;
    const visitsBooked = summary.visitsBooked;
    const visitsCompleted = summary.visitsCompleted;

    const funnel: FunnelStageItem[] = [
      {
        stage: 'leads',
        stageLabel: 'Total Ingested Leads',
        count: totalLeads,
        conversionFromPrevious: totalLeads > 0 ? 100 : null,
        conversionFromPreviousFormatted: totalLeads > 0 ? '100%' : '-',
        conversionFromTotal: totalLeads > 0 ? 100 : null,
        conversionFromTotalFormatted: totalLeads > 0 ? '100%' : '-',
      },
      {
        stage: 'engaged',
        stageLabel: 'Engaged Leads',
        count: engagedLeads,
        conversionFromPrevious:
          totalLeads > 0 ? Number(((engagedLeads / totalLeads) * 100).toFixed(1)) : null,
        conversionFromPreviousFormatted:
          totalLeads > 0
            ? `${((engagedLeads / totalLeads) * 100).toFixed(1)}%`
            : '-',
        conversionFromTotal:
          totalLeads > 0 ? Number(((engagedLeads / totalLeads) * 100).toFixed(1)) : null,
        conversionFromTotalFormatted:
          totalLeads > 0
            ? `${((engagedLeads / totalLeads) * 100).toFixed(1)}%`
            : '-',
      },
      {
        stage: 'booked',
        stageLabel: 'Site Visits Booked',
        count: visitsBooked,
        conversionFromPrevious:
          engagedLeads > 0 ? Number(((visitsBooked / engagedLeads) * 100).toFixed(1)) : null,
        conversionFromPreviousFormatted:
          engagedLeads > 0
            ? `${((visitsBooked / engagedLeads) * 100).toFixed(1)}%`
            : '-',
        conversionFromTotal:
          totalLeads > 0 ? Number(((visitsBooked / totalLeads) * 100).toFixed(1)) : null,
        conversionFromTotalFormatted:
          totalLeads > 0
            ? `${((visitsBooked / totalLeads) * 100).toFixed(1)}%`
            : '-',
      },
      {
        stage: 'visited',
        stageLabel: 'Visits Completed',
        count: visitsCompleted,
        conversionFromPrevious:
          visitsBooked > 0 ? Number(((visitsCompleted / visitsBooked) * 100).toFixed(1)) : null,
        conversionFromPreviousFormatted:
          visitsBooked > 0
            ? `${((visitsCompleted / visitsBooked) * 100).toFixed(1)}%`
            : '-',
        conversionFromTotal:
          totalLeads > 0 ? Number(((visitsCompleted / totalLeads) * 100).toFixed(1)) : null,
        conversionFromTotalFormatted:
          totalLeads > 0
            ? `${((visitsCompleted / totalLeads) * 100).toFixed(1)}%`
            : '-',
      },
    ];

    // Response Time by Source Chart Items
    const responseTimeBySource: ResponseTimeBySourceItem[] = bySource.map((item) => ({
      source: item.source,
      sourceLabel: item.sourceLabel,
      medianResponseMinutes:
        item.medianResponseSeconds !== null
          ? Number((item.medianResponseSeconds / 60).toFixed(2))
          : null,
      medianResponseSeconds: item.medianResponseSeconds,
      targetMinutes: 5,
    }));

    return {
      filter: {
        period: filter.period,
        from: fromStr,
        to: toStr,
        projectId: filter.projectId,
      },
      userRole: user.role,
      scopedExecutiveId,
      summary,
      bySource,
      funnel,
      responseTimeBySource,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generates standard RFC 4180 CSV export for the period.
   */
  generateCsv(data: SalesDashboardData): string {
    const lines: string[] = [];

    // Header & metadata
    lines.push('HOUSY SALES ANALYTICS REPORT');
    lines.push(`Period,${data.filter.period} (${data.filter.from} to ${data.filter.to})`);
    lines.push(`Generated At,${data.calculatedAt}`);
    lines.push(`Role,${data.userRole}${data.scopedExecutiveId ? ` (Scoped to Executive ${data.scopedExecutiveId})` : ' (All Leads)'}`);
    lines.push('');

    // Summary Section
    lines.push('EXECUTIVE SUMMARY METRICS');
    lines.push('Metric,Value,Target / Benchmark');
    lines.push(`Median First Response Time,${data.summary.medianFirstResponseFormatted},< 5m (300s)`);
    lines.push(`Leads Not Reached Within 48 Hours,${data.summary.unreached48hFormatted},< 5.0%`);
    lines.push(`Total Ingested Leads,${data.summary.totalLeads},-`);
    lines.push(`Engaged Leads,${data.summary.engagedLeads},-`);
    lines.push(`Site Visits Booked,${data.summary.visitsBooked},-`);
    lines.push(`Site Visits Completed,${data.summary.visitsCompleted},-`);
    lines.push(`Site Visits No-Show,${data.summary.visitsNoShow},-`);
    lines.push(`Show-up Rate (Completed / (Completed + No Show)),${data.summary.showUpRateFormatted},-`);
    lines.push(`Lead-to-Visit Rate (Completed / Total Leads),${data.summary.leadToVisitRateFormatted},8.0% (Baseline: 6.0%)`);
    lines.push('');

    // Source Breakdown Table
    lines.push('PERFORMANCE BY MARKETING SOURCE');
    lines.push('Source,Total Leads,Median Response,Visits Booked,Visits Completed,Show-up Rate,Ad Spend (INR),Cost Per Visit (INR),Small Sample Note');
    for (const item of data.bySource) {
      const smallSample = item.isSmallSample ? 'Yes (< 5 sample)' : 'No';
      lines.push(
        `"${item.sourceLabel}",${item.leadsCount},${item.medianResponseFormatted},${item.visitsBooked},${item.visitsCompleted},${item.showUpRateFormatted},${item.spendInr},${item.costPerVisitFormatted},"${smallSample}"`,
      );
    }
    lines.push('');

    // Funnel Progression
    lines.push('CONVERSION FUNNEL PROGRESSION');
    lines.push('Stage,Count,Conversion From Previous Stage,Conversion From Total Leads');
    for (const stage of data.funnel) {
      lines.push(
        `"${stage.stageLabel}",${stage.count},${stage.conversionFromPreviousFormatted},${stage.conversionFromTotalFormatted}`,
      );
    }

    return lines.join('\n');
  }
}

export const dashboardService = new DashboardService();

