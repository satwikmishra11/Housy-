import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../lib/api.js';
import { formatInKolkataTime } from '../lib/date.js';
import { LoadingState } from '../components/LoadingState.js';
import { ErrorState } from '../components/ErrorState.js';
import { EmptyState } from '../components/EmptyState.js';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Database,
  Clock,
  Server,
  Layers,
  RefreshCw,
  Cpu,
} from 'lucide-react';

export const HealthPage: React.FC = () => {
  const [showEmptyOverride, setShowEmptyOverride] = React.useState(false);

  const {
    data: health,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchHealth,
    refetchInterval: 15000,
  });

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Top Navigation */}
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-stone-900 text-stone-100 flex items-center justify-center font-bold text-sm tracking-wider">
              H
            </div>
            <div>
              <span className="font-semibold text-stone-900 tracking-tight text-base">Housy</span>
              <span className="text-xs text-stone-600 ml-2 font-mono">Company A · Ahmedabad</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEmptyOverride((prev) => !prev)}
              className="text-xs px-2.5 py-1.5 rounded border border-stone-300 text-stone-600 hover:bg-stone-100 transition"
              title="Toggle empty state view for UI verification"
            >
              {showEmptyOverride ? 'Show Real Telemetry' : 'Simulate Empty State'}
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 transition shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-stone-200 text-stone-800 mb-3">
            <Activity className="w-3.5 h-3.5" />
            Phase 1 Foundation Verification
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-950">
            System Diagnostics & Connectivity
          </h1>
          <p className="mt-2 text-sm text-stone-600 max-w-2xl leading-relaxed">
            Verifying end-to-end integration between Vite React 18, 3-tier Node Express API,
            and PostgreSQL 16 database.
          </p>
        </div>

        {/* State Rendering */}
        {showEmptyOverride ? (
          <EmptyState
            title="Diagnostics Telemetry Cleared"
            description="Diagnostic data feed is currently idle. Click below to re-engage active telemetry streams."
            action={{
              label: 'Restore Live Telemetry',
              onClick: () => setShowEmptyOverride(false),
            }}
          />
        ) : isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState
            title="Failed to load system status"
            message={error instanceof Error ? error.message : 'Unable to reach API server'}
            onRetry={() => refetch()}
          />
        ) : health ? (
          <div className="space-y-6">
            {/* Primary Status Banner */}
            <div
              className={`p-6 rounded-2xl border transition-all ${
                health.status === 'ok'
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-amber-200 bg-amber-50/60'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-start gap-4">
                  {health.status === 'ok' ? (
                    <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-stone-950">
                        {health.status === 'ok'
                          ? 'Core Services Operational'
                          : 'Service Operating in Degraded Mode'}
                      </h2>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-mono uppercase font-semibold ${
                          health.status === 'ok'
                            ? 'bg-emerald-200/80 text-emerald-900'
                            : 'bg-amber-200/80 text-amber-900'
                        }`}
                      >
                        {health.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-stone-600">
                      Evaluated on{' '}
                      <span className="font-medium text-stone-800">
                        {formatInKolkataTime(health.timestamp)}
                      </span>{' '}
                      (IST / Asia/Kolkata)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <div className="text-right">
                    <span className="block text-xs text-stone-500 uppercase tracking-wider font-medium">
                      API Uptime
                    </span>
                    <span className="text-sm font-semibold text-stone-800 font-mono">
                      {Math.floor(health.uptimeSeconds / 60)}m {health.uptimeSeconds % 60}s
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Diagnostic Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Database Telemetry */}
              <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Database
                  </span>
                  <Database className="w-4 h-4 text-stone-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      health.database.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-lg font-semibold capitalize text-stone-900">
                    {health.database.status}
                  </span>
                </div>
                <div className="mt-3 pt-3 border-t border-stone-100 flex justify-between items-center text-xs">
                  <span className="text-stone-500">Latency</span>
                  <span className="font-mono font-medium text-stone-800">
                    {health.database.latencyMs !== null && health.database.latencyMs !== undefined
                      ? `${health.database.latencyMs} ms`
                      : 'Unavailable'}
                  </span>
                </div>
                {health.database.message && (
                  <p className="mt-2 text-xs text-rose-600 bg-rose-50 p-2 rounded">
                    {health.database.message}
                  </p>
                )}
              </div>

              {/* LLM Engine Telemetry */}
              <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    AI Engine
                  </span>
                  <Cpu className="w-4 h-4 text-stone-400" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      health.llm?.status === 'ok'
                        ? 'bg-emerald-500'
                        : health.llm?.status === 'degraded'
                        ? 'bg-amber-500'
                        : health.llm?.status === 'unconfigured'
                        ? 'bg-stone-400'
                        : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-lg font-semibold capitalize text-stone-900">
                    {health.llm?.status ?? 'Unknown'}
                  </span>
                  {health.llm && (
                    <span className="text-xs text-stone-500 font-mono">
                      ({health.llm.provider})
                    </span>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-stone-100 space-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-stone-500">Model</span>
                    <span
                      className="font-mono font-medium text-stone-800 truncate max-w-[120px]"
                      title={health.llm?.model}
                    >
                      {health.llm?.model ?? 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-stone-500">Probe Latency</span>
                    <span className="font-mono font-medium text-stone-800">
                      {health.llm?.probeLatencyMs !== null &&
                      health.llm?.probeLatencyMs !== undefined
                        ? `${health.llm.probeLatencyMs} ms`
                        : 'Cached/Idle'}
                    </span>
                  </div>
                </div>
                {health.llm?.lastErrorKind && (
                  <p className="mt-2 text-xs text-amber-700 bg-amber-50 p-2 rounded truncate">
                    Kind: <span className="font-mono font-semibold">{health.llm.lastErrorKind}</span>
                  </p>
                )}
              </div>

              {/* Server Runtime */}
              <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Runtime
                  </span>
                  <Server className="w-4 h-4 text-stone-400" />
                </div>
                <div className="text-lg font-semibold text-stone-900">
                  Node.js / Express
                </div>
                <div className="mt-3 pt-3 border-t border-stone-100 flex justify-between items-center text-xs">
                  <span className="text-stone-500">Environment</span>
                  <span className="font-mono font-medium uppercase px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                    {health.environment}
                  </span>
                </div>
              </div>

              {/* Architectural Standard */}
              <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Time Zone
                  </span>
                  <Clock className="w-4 h-4 text-stone-400" />
                </div>
                <div className="text-lg font-semibold text-stone-900">
                  Asia/Kolkata (IST)
                </div>
                <div className="mt-3 pt-3 border-t border-stone-100 flex justify-between items-center text-xs">
                  <span className="text-stone-500">Storage Format</span>
                  <span className="font-mono font-medium text-stone-700">UTC (ISO 8601)</span>
                </div>
              </div>
            </div>

            {/* Architecture Compliance Overview */}
            <div className="p-6 rounded-2xl bg-white border border-stone-200 shadow-xs">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-stone-600" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-800">
                  Foundation Architecture Compliance
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-100">
                  <span className="font-semibold text-stone-800 block mb-1">3-Tier API</span>
                  <p className="text-stone-500">Routes → Services → Repositories with Zod validation</p>
                </div>
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-100">
                  <span className="font-semibold text-stone-800 block mb-1">Storage</span>
                  <p className="text-stone-500">PostgreSQL 16 with node-pg-migrate and pg pool</p>
                </div>
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-100">
                  <span className="font-semibold text-stone-800 block mb-1">Shared Schemas</span>
                  <p className="text-stone-500">@housy/shared package with strict TypeScript</p>
                </div>
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-100">
                  <span className="font-semibold text-stone-800 block mb-1">Client Presentation</span>
                  <p className="text-stone-500">React 18 + Vite + Tailwind + TanStack Query</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
};

