import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  Clock,
  TrendingUp,
  Download,
  HelpCircle,
  AlertCircle,
  AlertTriangle,
  CalendarCheck,
  Settings,
} from 'lucide-react';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { StatTile } from '../components/StatTile.js';
import { Badge } from '../components/Badge.js';
import { Skeleton } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { Modal } from '../components/Modal.js';
import { useToast } from '../components/Toast.js';
import { useAuth } from '../context/AuthContext.js';
import {
  fetchDashboardMetrics,
  downloadDashboardCsv,
  fetchProjects,
  type ProjectItem,
} from '../lib/api.js';
import {
  type DashboardFilterQuery,
  type DashboardPeriodPreset,
  type LeadSource,
} from '@housy/shared';

const SOURCE_COLORS: Record<LeadSource, string> = {
  property_portal: '#0284c7', // sky-600
  social_ad: '#8b5cf6',       // violet-500
  website: '#10b981',         // emerald-500
  hoarding_call: '#f59e0b',   // amber-500
};

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  let user: { role?: 'sales_head' | 'executive'; name?: string } | null = null;
  try {
    const auth = useAuth();
    user = auth.user;
  } catch {
    user = null;
  }

  const [period, setPeriod] = useState<DashboardPeriodPreset>('30d');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isHowWeCalculateOpen, setIsHowWeCalculateOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch projects to populate project filter
  const { data: projectsData } = useQuery<ProjectItem[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    staleTime: 5 * 60 * 1000,
  });

  const availableProjects = projectsData || [];

  const filterQuery: DashboardFilterQuery = {
    period,
    from: period === 'custom' && customFrom ? customFrom : undefined,
    to: period === 'custom' && customTo ? customTo : undefined,
    projectId: selectedProjectId || undefined,
  };

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sales-dashboard', filterQuery],
    queryFn: () => fetchDashboardMetrics(filterQuery),
  });

  const handleCsvExport = async (): Promise<void> => {
    try {
      setIsExporting(true);
      await downloadDashboardCsv(filterQuery);
      showToast({
        type: 'success',
        title: 'CSV export downloaded successfully',
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Failed to download CSV export',
        message: err instanceof Error ? err.message : 'Unknown download error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const isSalesHead = user?.role === 'sales_head';

  return (
    <StaffLayout userRole={user?.role} userName={user?.name}>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Sales Analytics & Performance"
          description={
            isSalesHead
              ? 'Developer-wide executive SLA, lead conversion funnel, response times, and marketing attribution.'
              : 'Your personal lead conversion performance, response time SLA, and site visit show-up rates.'
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsHowWeCalculateOpen(true)}
                className="gap-1.5"
              >
                <HelpCircle className="w-4 h-4 text-muted" />
                <span>How We Calculate</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCsvExport}
                disabled={isExporting || isLoading}
                className="gap-1.5"
              >
                <Download className="w-4 h-4 text-muted" />
                <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
              </Button>

              {isSalesHead && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/ad-spend')}
                  className="gap-1.5"
                >
                  <Settings className="w-4 h-4" />
                  <span>Manage Ad Spend</span>
                </Button>
              )}
            </div>
          }
        />

        {/* Filter Bar */}
        <Card padding="md" className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Period Selector Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider mr-1">
                Timeframe:
              </span>
              {(['7d', '30d', '90d', 'custom'] as DashboardPeriodPreset[]).map((p) => {
                const labels: Record<DashboardPeriodPreset, string> = {
                  '7d': 'Last 7 Days',
                  '30d': 'Last 30 Days',
                  '90d': 'Last 90 Days',
                  custom: 'Custom Range',
                };
                return (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      period === p
                        ? 'bg-ink text-white font-semibold'
                        : 'bg-surface hover:bg-hover text-ink border border-hairline'
                    }`}
                  >
                    {labels[p]}
                  </button>
                );
              })}
            </div>

            {/* Project Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                Project:
              </span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="text-xs border border-hairline rounded-md px-3 py-1.5 bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                aria-label="Filter by project"
              >
                <option value="">All Projects</option>
                {availableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Date Pickers */}
          {period === 'custom' && (
            <div className="pt-3 border-t border-hairline flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <label htmlFor="customFrom" className="font-medium text-muted">
                  From:
                </label>
                <input
                  id="customFrom"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="border border-hairline rounded px-2.5 py-1 text-ink bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="customTo" className="font-medium text-muted">
                  To:
                </label>
                <input
                  id="customTo"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="border border-hairline rounded px-2.5 py-1 text-ink bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {data && (
                <span className="text-muted italic ml-auto">
                  Active Range: {data.filter.from} to {data.filter.to} (Asia/Kolkata)
                </span>
              )}
            </div>
          )}
        </Card>

        {/* State 1: Explicit Loading Skeleton */}
        {isLoading && (
          <div className="space-y-6" data-testid="dashboard-loading-skeleton">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} padding="md" className="space-y-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-4 w-full" />
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card padding="md" className="h-72 flex flex-col justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-48 w-full" />
              </Card>
              <Card padding="md" className="h-72 flex flex-col justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-48 w-full" />
              </Card>
            </div>

            <Card padding="md">
              <Skeleton className="h-6 w-48 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* State 2: Error State with Retry */}
        {isError && (
          <ErrorState
            title="Failed to Load Sales Analytics"
            message={
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred while fetching dashboard metrics.'
            }
            onRetry={() => refetch()}
          />
        )}

        {/* Success / Loaded Data */}
        {!isLoading && !isError && data && (
          <>
            {/* Small Sample Warning Banner */}
            {data.summary.isSmallSample && (
              <div
                className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3.5 flex items-start gap-2.5 text-xs"
                role="alert"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Sample Notice: </span>
                  Fewer than 5 total leads or completed visits were recorded in this filter window.
                  Statistical conversion rates, show-up percentages, and cost per visit may not be statistically significant.
                </div>
              </div>
            )}

            {/* Top KPI Summary Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Tile 1: Median First Response Time */}
              <StatTile
                label="Median First Response"
                value={data.summary.medianFirstResponseFormatted}
                icon={<Clock className="w-4 h-4" />}
                subtitle="Target: < 5 min"
                delta={
                  data.summary.medianFirstResponseSeconds !== null
                    ? {
                        value:
                          data.summary.medianFirstResponseSeconds <= 300
                            ? 'On Target (≤ 5m)'
                            : 'Above Target (> 5m)',
                        isPositive: data.summary.medianFirstResponseSeconds <= 300,
                        label: '',
                      }
                    : undefined
                }
              />

              {/* Tile 2: Leads Not Reached Within 48 Hours */}
              <StatTile
                label="Not Reached > 48h"
                value={data.summary.unreached48hFormatted}
                icon={<AlertCircle className="w-4 h-4" />}
                subtitle={`Target: < 5.0% (${data.summary.unreached48hCount} leads)`}
                delta={
                  data.summary.unreached48hPercent !== null
                    ? {
                        value:
                          data.summary.unreached48hPercent <= 5.0
                            ? 'On Target (< 5%)'
                            : 'Exceeds SLA (> 5%)',
                        isPositive: data.summary.unreached48hPercent <= 5.0,
                        label: '',
                      }
                    : undefined
                }
              />

              {/* Tile 3: Lead-to-Visit Conversion Rate */}
              <StatTile
                label="Lead-to-Visit Rate"
                value={data.summary.leadToVisitRateFormatted}
                icon={<TrendingUp className="w-4 h-4" />}
                subtitle="Target: 8.0% (Baseline: 6.0%)"
                delta={
                  data.summary.leadToVisitRate !== null
                    ? {
                        value:
                          data.summary.leadToVisitRate >= 0.08
                            ? 'Target Achieved (≥ 8%)'
                            : data.summary.leadToVisitRate >= 0.06
                              ? 'Above Baseline (≥ 6%)'
                              : 'Below Baseline (< 6%)',
                        isPositive: data.summary.leadToVisitRate >= 0.08,
                        label: '',
                      }
                    : undefined
                }
              />

              {/* Tile 4: Show-up Rate */}
              <StatTile
                label="Visit Show-up Rate"
                value={data.summary.showUpRateFormatted}
                icon={<CalendarCheck className="w-4 h-4" />}
                subtitle={`${data.summary.visitsCompleted} visited / ${data.summary.visitsCompleted + data.summary.visitsNoShow} scheduled`}
                delta={
                  data.summary.showUpRate !== null
                    ? {
                        value: `${(data.summary.showUpRate * 100).toFixed(0)}% attendance`,
                        isPositive: data.summary.showUpRate >= 0.7,
                        isNeutral: data.summary.showUpRate < 0.7,
                        label: '',
                      }
                    : undefined
                }
              />
            </div>

            {/* Pipeline Volume Counters Strip */}
            <Card padding="md" className="bg-surface/50 border border-hairline">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 divide-y md:divide-y-0 md:divide-x divide-hairline">
                <div className="px-2 pt-2 md:pt-0">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Chats Started
                  </div>
                  <div className="mt-1 font-serif text-2xl font-bold text-accent">
                    {data.summary.chatsStarted ?? 0}
                  </div>
                  <div className="text-xs text-muted mt-0.5">Anonymous buyer sessions</div>
                </div>

                <div className="px-2 pt-2 md:pt-0 md:pl-4">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Total Leads
                  </div>
                  <div className="mt-1 font-serif text-2xl font-bold text-ink">
                    {data.summary.totalLeads}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {data.summary.contactableLeadsCount ?? data.summary.totalLeads} contactable
                    {typeof data.summary.notContactableCount === 'number' && data.summary.notContactableCount > 0 ? (
                      <span className="text-amber-600 block text-[11px]">
                        ({data.summary.notContactableCount} not contactable)
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="px-2 pt-2 md:pt-0 md:pl-4">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Engaged Leads
                  </div>
                  <div className="mt-1 font-serif text-2xl font-bold text-ink">
                    {data.summary.engagedLeads}
                  </div>
                  <div className="text-xs text-muted mt-0.5">Interacted or qualified</div>
                </div>

                <div className="px-2 pt-2 md:pt-0 md:pl-4">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Visits Booked
                  </div>
                  <div className="mt-1 font-serif text-2xl font-bold text-ink">
                    {data.summary.visitsBooked}
                  </div>
                  <div className="text-xs text-muted mt-0.5">Confirmed appointments</div>
                </div>

                <div className="px-2 pt-2 md:pt-0 md:pl-4">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider">
                    Visits Completed
                  </div>
                  <div className="mt-1 font-serif text-2xl font-bold text-success">
                    {data.summary.visitsCompleted}
                  </div>
                  <div className="text-xs text-muted mt-0.5">Physical site tours completed</div>
                </div>
              </div>
            </Card>

            {/* Before vs After AI-Assisted Performance Card */}
            {data.comparison && (
              <Card padding="md" className="space-y-4 border border-accent/20 bg-gradient-to-r from-surface to-accent/5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h2 className="font-serif text-base font-semibold text-ink">
                        AI-Assisted Transformation: Before vs After
                      </h2>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-accent/10 text-accent border border-accent/30">
                        Simulated demo data
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      Ahmedabad Baseline (prior to Oct 15, 2026 go-live) vs. Autonomous AI Advisory Performance
                    </p>
                  </div>
                  <div className="text-xs text-muted font-mono">
                    Go-Live Date: <span className="font-semibold text-ink">Oct 15, 2026</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Metric 1: Median Response */}
                  <div className="p-3 bg-surface rounded-lg border border-hairline space-y-2">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wider">
                      Median First Response
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="text-[11px] text-muted">Baseline (Before)</div>
                        <div className="font-mono text-base font-bold text-amber-700">
                          {data.comparison.before.medianResponseFormatted}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-muted">AI-Assisted (After)</div>
                        <div className="font-mono text-base font-bold text-success">
                          {data.comparison.after.medianResponseFormatted}
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted pt-1 border-t border-hairline flex justify-between">
                      <span>Target: &lt; 5 min</span>
                      <span className="font-semibold text-success">99% speedup</span>
                    </div>
                  </div>

                  {/* Metric 2: Not Reached > 48h */}
                  <div className="p-3 bg-surface rounded-lg border border-hairline space-y-2">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wider">
                      Leads Not Reached &gt; 48h
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="text-[11px] text-muted">Baseline (Before)</div>
                        <div className="font-mono text-base font-bold text-danger">
                          {data.comparison.before.unreached48hFormatted}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-muted">AI-Assisted (After)</div>
                        <div className="font-mono text-base font-bold text-success">
                          {data.comparison.after.unreached48hFormatted}
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted pt-1 border-t border-hairline flex justify-between">
                      <span>Target SLA: &lt; 5.0%</span>
                      <span className="font-semibold text-success">SLA Compliant</span>
                    </div>
                  </div>

                  {/* Metric 3: Lead-to-Visit Rate */}
                  <div className="p-3 bg-surface rounded-lg border border-hairline space-y-2">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wider">
                      Lead-to-Visit Rate
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <div className="text-[11px] text-muted">Baseline (Before)</div>
                        <div className="font-mono text-base font-bold text-ink">
                          {data.comparison.before.leadToVisitFormatted}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-muted">AI-Assisted (After)</div>
                        <div className="font-mono text-base font-bold text-success">
                          {data.comparison.after.leadToVisitFormatted}
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] text-muted pt-1 border-t border-hairline flex justify-between">
                      <span>Target: 8.0% (Baseline 6.0%)</span>
                      <span className="font-semibold text-success">
                        Cohort sizes: {data.comparison.before.totalLeads} / {data.comparison.after.totalLeads}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* State 3: Empty State when no leads in window */}
            {data.summary.totalLeads === 0 ? (
              <EmptyState
                title="No Lead Activity in Selected Window"
                description="No enquiries or touchpoints were recorded for this project and date range. Try widening the timeframe or switching to All Projects."
                action={{
                  label: 'Reset to Last 30 Days',
                  onClick: () => {
                    setPeriod('30d');
                    setSelectedProjectId('');
                  },
                }}
              />
            ) : (
              <>
                {/* Visualizations Section (Recharts) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Chart 1: Median Response Time by Source */}
                  <Card padding="md" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-serif text-base font-semibold text-ink">
                          Median First Response by Source
                        </h2>
                        <p className="text-xs text-muted">
                          50th percentile response time in minutes vs. 5-minute target line
                        </p>
                      </div>
                      <Badge variant="neutral" className="text-[11px]">
                        Target: 5.0m
                      </Badge>
                    </div>

                    <div className="h-64 w-full" role="img" aria-label="Median Response Time Chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={data.responseTimeBySource.map((s) => ({
                            source: s.sourceLabel,
                            minutes: s.medianResponseMinutes ?? 0,
                            rawSecs: s.medianResponseSeconds,
                          }))}
                          margin={{ top: 20, right: 20, left: -10, bottom: 25 }}
                        >
                          <XAxis
                            dataKey="source"
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            interval={0}
                            angle={-15}
                            textAnchor="end"
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            unit="m"
                            domain={[0, 'auto']}
                          />
                          <Tooltip
                            formatter={(val: unknown) => [`${val ?? 0} min`, 'Median Response']}
                            contentStyle={{
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0',
                              fontSize: '12px',
                            }}
                          />
                          <ReferenceLine
                            y={5}
                            stroke="#dc2626"
                            strokeDasharray="4 4"
                            label={{
                              value: 'Target: 5m',
                              position: 'top',
                              fill: '#dc2626',
                              fontSize: 10,
                            }}
                          />
                          <Bar dataKey="minutes" radius={[4, 4, 0, 0]}>
                            {data.responseTimeBySource.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={SOURCE_COLORS[entry.source] || '#64748b'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Accessible Screen-Reader Summary */}
                    <div className="sr-only">
                      <h3>Median response times by source table alternative</h3>
                      <ul>
                        {data.responseTimeBySource.map((s) => (
                          <li key={s.source}>
                            {s.sourceLabel}:{' '}
                            {s.medianResponseMinutes !== null
                              ? `${s.medianResponseMinutes} minutes`
                              : 'No responses recorded'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Card>

                  {/* Chart 2: Lead Conversion Funnel */}
                  <Card padding="md" className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-serif text-base font-semibold text-ink">
                          Lead Conversion Funnel
                        </h2>
                        <p className="text-xs text-muted">
                          Progression from intake to engagement, booking, and completed visit
                        </p>
                      </div>
                      <Badge variant="neutral" className="text-[11px]">
                        Overall: {data.summary.leadToVisitRateFormatted}
                      </Badge>
                    </div>

                    {/* Styled Funnel Progression View */}
                    <div className="space-y-3 pt-2" role="region" aria-label="Conversion Funnel Progression">
                      {data.funnel.map((stage, idx) => {
                        const total = data.summary.totalLeads || 1;
                        const barWidthPercent = Math.max(10, Math.round((stage.count / total) * 100));

                        const stageColor =
                          idx === 0
                            ? 'bg-sky-600'
                            : idx === 1
                              ? 'bg-indigo-600'
                              : idx === 2
                                ? 'bg-amber-600'
                                : 'bg-emerald-600';

                        return (
                          <div key={stage.stage} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-ink">{stage.stageLabel}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-ink">{stage.count}</span>
                                {idx > 0 && (
                                  <span className="text-muted text-[11px]">
                                    ({stage.conversionFromPreviousFormatted} from prev)
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="w-full bg-surface-muted h-3.5 rounded-full overflow-hidden border border-hairline">
                              <div
                                className={`h-full ${stageColor} transition-all duration-500 rounded-full`}
                                style={{ width: `${barWidthPercent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-2 border-t border-hairline flex items-center justify-between text-xs text-muted">
                      <span>Baseline Lead-to-Visit: 6.0%</span>
                      <span className="font-semibold text-ink">
                        Target: 8.0% | Actual: {data.summary.leadToVisitRateFormatted}
                      </span>
                    </div>
                  </Card>
                </div>

                {/* By-Source Performance Breakdown Table */}
                <Card padding="none" className="overflow-hidden">
                  <div className="p-4 border-b border-hairline flex items-center justify-between">
                    <div>
                      <h2 className="font-serif text-base font-semibold text-ink">
                        Performance by Marketing Source
                      </h2>
                      <p className="text-xs text-muted">
                        First-touch attribution with spend allocation and cost per completed site visit
                      </p>
                    </div>
                    <Badge variant="neutral" className="text-xs">
                      {data.bySource.length} Channels
                    </Badge>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-ink min-w-[760px]">
                      <thead className="bg-surface-muted border-b border-hairline text-muted uppercase tracking-wider font-semibold">
                        <tr>
                          <th className="py-3 px-4">Marketing Source</th>
                          <th className="py-3 px-4 text-right">Leads</th>
                          <th className="py-3 px-4 text-right">Median Response</th>
                          <th className="py-3 px-4 text-right">Visits (Completed / Booked)</th>
                          <th className="py-3 px-4 text-right">Show-up Rate</th>
                          <th className="py-3 px-4 text-right">Period Spend</th>
                          <th className="py-3 px-4 text-right">Cost / Completed Visit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {data.bySource.map((sourceItem) => (
                          <tr key={sourceItem.source} className="hover:bg-hover/50 transition-colors">
                            <td className="py-3 px-4 font-medium flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: SOURCE_COLORS[sourceItem.source] }}
                              />
                              <div>
                                <span className="font-semibold">{sourceItem.sourceLabel}</span>
                                {sourceItem.isSmallSample && (
                                  <span
                                    className="ml-2 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200"
                                    title="Sample under 5 records"
                                  >
                                    Small Sample
                                  </span>
                                )}
                                <div className="text-[10px] text-muted mt-0.5">
                                  {sourceItem.spendSource || 'Ad Spend Allocation (₹30L/mo)'}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-medium">
                              {sourceItem.leadsCount}
                            </td>
                            <td className="py-3 px-4 text-right font-mono">
                              <span
                                className={
                                  sourceItem.medianResponseSeconds !== null &&
                                  sourceItem.medianResponseSeconds <= 300
                                    ? 'text-success font-medium'
                                    : sourceItem.medianResponseSeconds !== null
                                      ? 'text-amber-600 font-medium'
                                      : 'text-muted'
                                }
                              >
                                {sourceItem.medianResponseFormatted}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono">
                              <span className="font-bold text-success">{sourceItem.visitsCompleted}</span>
                              <span className="text-muted"> / </span>
                              <span>{sourceItem.visitsBooked}</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono">
                              {sourceItem.showUpRateFormatted}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-muted">
                              ₹{sourceItem.spendInr.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-ink">
                              {sourceItem.visitsCompleted < 5 ? (
                                <div>
                                  <span className="font-bold text-muted" title={`Fewer than 5 completed visits (sample: ${sourceItem.visitsCompleted})`}>
                                    —
                                  </span>
                                  <span className="text-[10px] text-muted block font-normal">
                                    &lt; 5 visits
                                  </span>
                                </div>
                              ) : (
                                <div>
                                  <span>{sourceItem.costPerVisitFormatted}</span>
                                  {sourceItem.costPerBookedVisit ? (
                                    <span className="text-[10px] text-muted block font-normal">
                                      ₹{sourceItem.costPerBookedVisit.toLocaleString('en-IN')} / booked
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </>
        )}

        {/* "How We Calculate" Popover / Modal */}
        <Modal
          isOpen={isHowWeCalculateOpen}
          onClose={() => setIsHowWeCalculateOpen(false)}
          title="Metric Definitions & Calculation Methodology"
        >
          <div className="space-y-4 text-xs text-ink max-h-[75vh] overflow-y-auto pr-1">
            <div className="p-3 bg-surface-muted rounded-lg border border-hairline space-y-1">
              <span className="font-semibold text-ink">Role Scoping (RBAC):</span>
              <p className="text-muted">
                {isSalesHead
                  ? 'As Sales Head, you are viewing aggregate metrics across all active sales executives and developer projects.'
                  : 'As a Sales Executive, this dashboard is scoped strictly to leads and appointments assigned to your account.'}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-ink text-sm">1. Median First Response Time &amp; Semantics</h4>
                <p className="text-muted mt-0.5">
                  The 50th percentile (<code className="bg-surface px-1 py-0.5 rounded">PERCENTILE_CONT(0.5)</code>) of the difference between first response (<code className="bg-surface px-1 py-0.5 rounded">first_response_at</code>) and intake timestamp (<code className="bg-surface px-1 py-0.5 rounded">first_touch_at</code>) in seconds, calculated across all leads that have received a response. Target SLA: <span className="font-semibold text-success">&lt; 5 minutes</span> (300 seconds).
                </p>
                <ul className="list-disc list-inside mt-1.5 space-y-1 text-muted text-[11px]">
                  <li>
                    <strong className="text-ink">Web Chat:</strong> Measured from the buyer's first inbound message to the first substantive assistant answer. The initial welcome greeting is stored separately (<code className="bg-surface px-1 py-0.5 rounded">is_greeting: true</code>) and excluded from the SLA clock.
                  </li>
                  <li>
                    <strong className="text-ink">Ingested Leads:</strong> Measured from ingestion to the first outbound message dispatched via channel outbox (<code className="bg-surface px-1 py-0.5 rounded">first_response_kind: outbound_message</code>).
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-ink text-sm">2. Leads Not Reached Within 48 Hours</h4>
                <p className="text-muted mt-0.5">
                  Count of leads in the period where either no response has occurred and more than 48 hours have elapsed since intake, or where the first response took more than 48 hours, divided by total <strong className="text-ink">contactable</strong> leads. Target SLA: <span className="font-semibold text-success">&lt; 5.0%</span>.
                </p>
                <p className="text-muted text-[11px] mt-1">
                  <strong className="text-ink">DPDP Act Compliance:</strong> Leads who have withdrawn consent or opted out cannot legally receive outbound communications. They are strictly excluded from the 48-hour SLA denominator and reported as <em className="text-ink">not contactable</em> so sales staff is never penalized for privacy compliance.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-ink text-sm">3. Visit Show-up Rate</h4>
                <p className="text-muted mt-0.5">
                  Calculated as <code className="bg-surface px-1 py-0.5 rounded">Completed Visits / (Completed Visits + No-Shows)</code>. If no visits have been marked with an outcome, returns divide-by-zero safe <code className="bg-surface px-1 py-0.5 rounded">-</code>.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-ink text-sm">4. Lead-to-Visit Conversion Rate</h4>
                <p className="text-muted mt-0.5">
                  Calculated as <code className="bg-surface px-1 py-0.5 rounded">Completed Visits / Total Ingested Leads</code>. Developer target benchmark is <span className="font-semibold text-ink">8.0%</span>, improving from the Ahmedabad residential baseline of <span className="font-semibold text-ink">6.0%</span>. Anonymous chat sessions without conversion triggers are tracked separately under <em className="text-ink">Chats Started</em>.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-ink text-sm">5. Cost Per Completed Site Visit</h4>
                <p className="text-muted mt-0.5">
                  Calculated as <code className="bg-surface px-1 py-0.5 rounded">Allocated Source Spend / Completed Visits</code>. Spend for the period is computed by proportionally allocating monthly marketing budgets (<code className="bg-surface px-1 py-0.5 rounded">ad_spend</code>, default ₹30L/mo) by day across the filter timeframe.
                </p>
                <p className="text-muted text-[11px] mt-1">
                  <strong className="text-ink">Sample Integrity:</strong> When completed visits are fewer than 5, cost per visit displays <code className="bg-surface px-1 py-0.5 rounded">—</code> to prevent skewed unit economics from insufficient sample sizes. Both completed and booked visit counts are displayed side by side.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-ink text-sm">6. First-Touch Attribution</h4>
                <p className="text-muted mt-0.5">
                  Every lead is tagged with an immutable first-touch source at intake (<code className="bg-surface px-1 py-0.5 rounded">property_portal</code>, <code className="bg-surface px-1 py-0.5 rounded">social_ad</code>, <code className="bg-surface px-1 py-0.5 rounded">website</code>, or <code className="bg-surface px-1 py-0.5 rounded">hoarding_call</code>). All downstream visits, response times, and conversions permanently attribute to this intake origin.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-hairline flex justify-end">
              <Button size="sm" onClick={() => setIsHowWeCalculateOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </StaffLayout>
  );
};
