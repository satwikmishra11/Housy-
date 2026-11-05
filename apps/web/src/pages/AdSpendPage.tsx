import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  TrendingUp,
  Save,
  RotateCcw,
  IndianRupee,
  Layers,
  Calendar,
  Info,
  CheckCircle,
} from 'lucide-react';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/Button.js';
import { Input } from '../components/Input.js';
import { Badge } from '../components/Badge.js';
import { Skeleton } from '../components/Skeleton.js';
import { ErrorState } from '../components/ErrorState.js';
import { useToast } from '../components/Toast.js';
import {
  fetchMonthlySpend,
  updateMonthlySpend,
  fetchSpendMonths,
  type MonthlySpendData,
} from '../lib/api.js';
import type { LeadSource, UpdateMonthlySpendPayload } from '@housy/shared';

const SOURCE_METADATA: Record<
  LeadSource,
  { label: string; description: string; color: string; defaultInr: number }
> = {
  property_portal: {
    label: 'Property Portals',
    description: 'MagicBricks, 99acres, Housing.com lead packages and featured listings.',
    color: '#0284c7', // sky-600
    defaultInr: 1200000,
  },
  social_ad: {
    label: 'Social Media Ads',
    description: 'Meta (Facebook & Instagram) and Google Search performance marketing.',
    color: '#8b5cf6', // violet-500
    defaultInr: 1000000,
  },
  hoarding_call: {
    label: 'Hoarding & Outdoor Call Campaigns',
    description: 'High-visibility billboard displays, physical signage, and toll-free numbers.',
    color: '#f59e0b', // amber-500
    defaultInr: 500000,
  },
  website: {
    label: 'Direct Website & Organic SEO',
    description: 'Organic search optimization, landing page hosting, and website conversion tools.',
    color: '#10b981', // emerald-500
    defaultInr: 300000,
  },
};

const BENCHMARK_MONTHLY_TOTAL_INR = 3000000; // ₹30 Lakh benchmark (Assumption A7)

function formatInrLakhs(amount: number): string {
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)} Lakh`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const AdSpendPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  // Local allocations state
  const [allocations, setAllocations] = useState<Record<LeadSource, number>>({
    property_portal: 1200000,
    social_ad: 1000000,
    hoarding_call: 500000,
    website: 300000,
  });

  const {
    data: spendData,
    isLoading: isSpendLoading,
    isError: isSpendError,
    error: spendError,
    refetch: refetchSpend,
  } = useQuery<MonthlySpendData>({
    queryKey: ['ad-spend', selectedMonth],
    queryFn: () => fetchMonthlySpend(selectedMonth),
  });

  const { data: recordedMonths } = useQuery<string[]>({
    queryKey: ['ad-spend-months'],
    queryFn: fetchSpendMonths,
  });

  // Synchronize local form inputs when backend data resolves
  useEffect(() => {
    if (spendData) {
      const updated: Record<LeadSource, number> = {
        property_portal: 0,
        social_ad: 0,
        hoarding_call: 0,
        website: 0,
      };
      for (const item of spendData.allocations) {
        updated[item.source] = item.amountInr;
      }
      setAllocations(updated);
    }
  }, [spendData]);

  const updateSpendMutation = useMutation({
    mutationFn: (payload: UpdateMonthlySpendPayload) => updateMonthlySpend(payload),
    onSuccess: (data) => {
      showToast({
        type: 'success',
        title: 'Ad Spend Updated',
        message: `Saved ₹${(data.totalInr / 100000).toFixed(1)} Lakh allocation for ${selectedMonth}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['ad-spend', selectedMonth] });
      void queryClient.invalidateQueries({ queryKey: ['ad-spend-months'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Failed to Save Spend',
        message: err.message,
      });
    },
  });

  const handleAmountChange = (source: LeadSource, valStr: string): void => {
    const parsed = parseFloat(valStr.replace(/[^0-9.]/g, '')) || 0;
    setAllocations((prev) => ({
      ...prev,
      [source]: parsed,
    }));
  };

  const handleResetToDefaults = (): void => {
    setAllocations({
      property_portal: SOURCE_METADATA.property_portal.defaultInr,
      social_ad: SOURCE_METADATA.social_ad.defaultInr,
      hoarding_call: SOURCE_METADATA.hoarding_call.defaultInr,
      website: SOURCE_METADATA.website.defaultInr,
    });
    showToast({
      type: 'info',
      title: 'Defaults Loaded',
      message: 'Reset to ₹30 Lakh monthly benchmark allocations.',
    });
  };

  const handleSave = (e?: React.FormEvent): void => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const payload: UpdateMonthlySpendPayload = {
      month: selectedMonth,
      allocations: (Object.keys(allocations) as LeadSource[]).map((source) => ({
        source,
        amountInr: allocations[source],
      })),
    };
    updateSpendMutation.mutate(payload);
  };

  const totalCalculatedInr = Object.values(allocations).reduce((a, b) => a + b, 0);
  const deltaFromBenchmark = totalCalculatedInr - BENCHMARK_MONTHLY_TOTAL_INR;

  const sourcesList: LeadSource[] = ['property_portal', 'social_ad', 'hoarding_call', 'website'];

  return (
    <StaffLayout userRole="sales_head">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <PageHeader
          title="Marketing Ad Spend & Channel Budgets"
          description="Allocate monthly acquisition spend across sources. Powers CAC calculations, visit conversion velocity, and attribution analytics."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetToDefaults}
                className="gap-1.5"
                title="Reset to ₹30 Lakh default"
              >
                <RotateCcw className="w-4 h-4 text-muted" />
                <span>Default ₹30L</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSave()}
                isLoading={updateSpendMutation.isPending}
                className="gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Save Allocation</span>
              </Button>
            </div>
          }
        />

        {/* Month Selector Bar */}
        <div className="bg-surface p-4 rounded-token border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-subtle">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-ink uppercase tracking-wider block">
                Accounting Period
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded-lg border border-hairline bg-background px-3 py-1.5 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                />
                {spendData?.isDefault && (
                  <Badge variant="neutral" className="text-xs">
                    Standard ₹30L Default
                  </Badge>
                )}
                {!spendData?.isDefault && !isSpendLoading && (
                  <Badge variant="success" className="text-xs">
                    Persisted in DB
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Quick pills for recorded months */}
          {recordedMonths && recordedMonths.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted mr-1">Saved months:</span>
              {recordedMonths.slice(0, 4).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMonth(m.slice(0, 7))}
                  className={`text-xs px-2.5 py-1 rounded-md font-mono transition-colors ${
                    selectedMonth === m.slice(0, 7)
                      ? 'bg-accent text-white font-semibold'
                      : 'bg-background hover:bg-hairline text-muted hover:text-ink'
                  }`}
                >
                  {m.slice(0, 7)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loading / Error / Content */}
        {isSpendLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : isSpendError ? (
          <ErrorState
            title="Failed to Load Ad Spend"
            message={(spendError as Error)?.message || 'An error occurred.'}
            onRetry={() => void refetchSpend()}
          />
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* KPI Summary Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-surface border border-hairline shadow-subtle">
                <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase">
                  <span>Total Budget</span>
                  <IndianRupee className="w-4 h-4 text-accent" />
                </div>
                <div className="mt-2 text-2xl font-serif font-bold text-ink tracking-tight">
                  {formatInrLakhs(totalCalculatedInr)}
                </div>
                <div className="mt-1 text-xs text-muted">
                  Full month acquisition outlay
                </div>
              </div>

              <div className="p-4 rounded-xl bg-surface border border-hairline shadow-subtle">
                <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase">
                  <span>Standard Benchmark</span>
                  <Layers className="w-4 h-4 text-muted" />
                </div>
                <div className="mt-2 text-2xl font-serif font-bold text-ink tracking-tight">
                  ₹30.00 Lakh
                </div>
                <div className="mt-1 text-xs flex items-center gap-1 font-medium">
                  {deltaFromBenchmark === 0 ? (
                    <span className="text-success flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Matches baseline
                    </span>
                  ) : deltaFromBenchmark > 0 ? (
                    <span className="text-warning">
                      +{formatInrLakhs(deltaFromBenchmark)} above baseline
                    </span>
                  ) : (
                    <span className="text-accent">
                      -{formatInrLakhs(Math.abs(deltaFromBenchmark))} below baseline
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-surface border border-hairline shadow-subtle">
                <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase">
                  <span>Lead Portals Share</span>
                  <TrendingUp className="w-4 h-4 text-accent" />
                </div>
                <div className="mt-2 text-2xl font-serif font-bold text-ink tracking-tight">
                  {totalCalculatedInr > 0
                    ? `${((allocations.property_portal / totalCalculatedInr) * 100).toFixed(1)}%`
                    : '0%'}
                </div>
                <div className="mt-1 text-xs text-muted">
                  Primary high-intent portal volume
                </div>
              </div>

              <div className="p-4 rounded-xl bg-surface border border-hairline shadow-subtle">
                <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase">
                  <span>Channels Active</span>
                  <BarChart3 className="w-4 h-4 text-success" />
                </div>
                <div className="mt-2 text-2xl font-serif font-bold text-ink tracking-tight">
                  4 Channels
                </div>
                <div className="mt-1 text-xs text-muted">
                  Portals, Ads, Hoardings, Website
                </div>
              </div>
            </div>

            {/* Visual Budget Allocation Bar */}
            <div className="p-5 rounded-token bg-surface border border-hairline shadow-subtle space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink uppercase tracking-wider">
                  Visual Budget Proportion
                </span>
                <span className="text-xs text-muted font-mono">
                  {totalCalculatedInr > 0 ? '100% Allocated' : 'No Allocation'}
                </span>
              </div>

              <div className="w-full h-4 rounded-full bg-background flex overflow-hidden border border-hairline">
                {sourcesList.map((source) => {
                  const pct = totalCalculatedInr > 0 ? (allocations[source] / totalCalculatedInr) * 100 : 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={source}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: SOURCE_METADATA[source].color,
                      }}
                      title={`${SOURCE_METADATA[source].label}: ${pct.toFixed(1)}% (${formatInrLakhs(allocations[source])})`}
                      className="h-full transition-all duration-300"
                    />
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                {sourcesList.map((source) => {
                  const pct = totalCalculatedInr > 0 ? (allocations[source] / totalCalculatedInr) * 100 : 0;
                  return (
                    <div key={source} className="flex items-center gap-1.5 text-xs text-muted">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: SOURCE_METADATA[source].color }}
                      />
                      <span className="font-medium text-ink">{SOURCE_METADATA[source].label}:</span>
                      <span>{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Channel Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sourcesList.map((source) => {
                const meta = SOURCE_METADATA[source];
                const amount = allocations[source];
                const pct = totalCalculatedInr > 0 ? (amount / totalCalculatedInr) * 100 : 0;

                return (
                  <div
                    key={source}
                    className="p-5 rounded-token bg-surface border border-hairline shadow-subtle space-y-4 hover:border-hairline transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: meta.color }}
                          />
                          <h2 className="font-semibold text-ink text-sm sm:text-base">{meta.label}</h2>
                        </div>
                        <p className="text-xs text-muted mt-1 leading-relaxed">
                          {meta.description}
                        </p>
                      </div>

                      <Badge variant="neutral" className="font-mono text-xs">
                        {pct.toFixed(1)}%
                      </Badge>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-ink uppercase">
                        Monthly Allocation (INR)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-muted text-sm">
                          ₹
                        </span>
                        <Input
                          type="number"
                          step="10000"
                          min="0"
                          value={amount.toString()}
                          onChange={(e) => handleAmountChange(source, e.target.value)}
                          className="pl-8 font-mono text-base font-semibold"
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted">
                        <span>Standard Baseline: {formatInrLakhs(meta.defaultInr)}</span>
                        <span className="font-medium text-accent">{formatInrLakhs(amount)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Note & Action footer */}
            <div className="p-4 rounded-xl bg-background border border-hairline flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-accent flex-shrink-0" />
                <span>
                  Ad spend records update attribution models dynamically for all active marketing channels.
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                onClick={handleSave}
                isLoading={updateSpendMutation.isPending}
                className="w-full sm:w-auto"
              >
                <Save className="w-4 h-4 mr-1.5" />
                <span>Save All Allocations</span>
              </Button>
            </div>
          </form>
        )}
      </div>
    </StaffLayout>
  );
};
