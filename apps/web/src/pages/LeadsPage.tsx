import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/Button.js';
import { Input } from '../components/Input.js';
import { Badge } from '../components/Badge.js';
import { Select } from '../components/Select.js';
import { Skeleton } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { CsvImportModal } from '../components/CsvImportModal.js';
import { LeadDetailDrawer } from '../components/LeadDetailDrawer.js';
import { fetchLeads, mergeLeads, keepSeparateLead, type FetchLeadsParams } from '../lib/api.js';
import { formatInKolkataTime } from '../lib/date.js';
import { useToast } from '../components/Toast.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Search,
  Upload,
  RefreshCw,
  GitMerge,
  ShieldAlert,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Users,
} from 'lucide-react';
import type { LeadListItem, LeadSource, LeadStatus } from '@housy/shared';

export const LeadsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  let authUser: { role?: 'sales_head' | 'executive'; name?: string } | null = null;
  try {
    const auth = useAuth();
    authUser = auth.user;
  } catch {
    authUser = null;
  }
  const isSalesHead = authUser?.role === 'sales_head';

  const [activeTab, setActiveTab] = useState<'all' | 'duplicates'>('all');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  const queryParams: FetchLeadsParams = {
    search: search.trim() || undefined,
    source: sourceFilter !== 'all' ? sourceFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    projectId: projectFilter !== 'all' ? projectFilter : undefined,
    duplicatesOnly: activeTab === 'duplicates' ? true : undefined,
    unassignedOnly: unassignedOnly ? true : undefined,
    page,
    limit: 15,
  };

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['leads', queryParams],
    queryFn: () => fetchLeads(queryParams),
  });

  // Separate query for duplicate badge count
  const { data: duplicateCountData } = useQuery({
    queryKey: ['leads', 'duplicate-count'],
    queryFn: () => fetchLeads({ duplicatesOnly: true, limit: 1 }),
  });
  const duplicateCount = duplicateCountData?.total ?? 0;

  const keepSeparateMutation = useMutation({
    mutationFn: (id: string) => keepSeparateLead(id),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Lead Unlinked',
        message: 'Lead marked as separate.',
      });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: 'Action Failed',
        message: err instanceof Error ? err.message : 'Failed to keep separate',
      });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: ({ primaryId, secondaryId }: { primaryId: string; secondaryId: string }) =>
      mergeLeads(primaryId, secondaryId),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Leads Merged',
        message: 'Leads merged into single record.',
      });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: 'Merge Failed',
        message: err instanceof Error ? err.message : 'Failed to merge leads',
      });
    },
  });

  const getSourceBadgeVariant = (source: LeadSource): 'neutral' | 'accent' => {
    switch (source) {
      case 'property_portal':
        return 'accent';
      case 'social_ad':
        return 'neutral';
      case 'website':
        return 'neutral';
      case 'hoarding_call':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  const getStatusBadgeVariant = (
    status: LeadStatus,
  ): 'neutral' | 'success' | 'warning' | 'danger' => {
    switch (status) {
      case 'visit_booked':
      case 'visited':
        return 'success';
      case 'engaged':
        return 'warning';
      case 'no_show':
      case 'lost':
        return 'danger';
      case 'new':
      default:
        return 'neutral';
    }
  };

  return (
    <StaffLayout userRole={authUser?.role} userName={authUser?.name}>
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Unified Leads"
          description="Real-time multi-channel lead intake, duplicate detection, and source attribution."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
              >
                Refresh
              </Button>
              {isSalesHead && (
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Upload className="w-4 h-4" />}
                  onClick={() => setIsCsvModalOpen(true)}
                >
                  Import CSV
                </Button>
              )}
            </div>
          }
        />

        {/* View Tabs */}
        <div className="flex border-b border-hairline gap-4">
          <button
            type="button"
            className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'all'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-ink-muted hover:text-ink-base'
              }`}
            onClick={() => {
              setActiveTab('all');
              setPage(1);
            }}
          >
            <Users className="w-4 h-4" />
            <span>All Leads</span>
            {data && <span className="text-xs text-ink-muted font-normal">({data.total})</span>}
          </button>
          <button
            type="button"
            className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'duplicates'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-ink-muted hover:text-ink-base'
              }`}
            onClick={() => {
              setActiveTab('duplicates');
              setPage(1);
            }}
          >
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span>Review Duplicates</span>
            {duplicateCount > 0 && (
              <Badge variant="warning">
                {duplicateCount}
              </Badge>
            )}
          </button>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="bg-surface p-4 rounded-token border border-hairline space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search by name, phone, email, or Lead ID (e.g. LD-58210)..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Sources' },
                  { value: 'property_portal', label: 'Property Portal' },
                  { value: 'social_ad', label: 'Social Media Ad' },
                  { value: 'website', label: 'Website' },
                  { value: 'hoarding_call', label: 'Hoarding Call' },
                ]}
              />

              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'new', label: 'New' },
                  { value: 'engaged', label: 'Engaged' },
                  { value: 'visit_booked', label: 'Visit Booked' },
                  { value: 'visited', label: 'Visited' },
                  { value: 'no_show', label: 'No Show' },
                  { value: 'lost', label: 'Lost' },
                ]}
              />

              <Select
                value={projectFilter}
                onChange={(e) => {
                  setProjectFilter(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Projects' },
                  { value: 'Project 1', label: 'Project 1' },
                  { value: 'Project 2', label: 'Project 2' },
                ]}
              />

              <Button
                variant={unassignedOnly ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => {
                  setUnassignedOnly(!unassignedOnly);
                  setPage(1);
                }}
              >
                Unassigned
              </Button>
            </div>
          </div>
        </div>

        {/* 1. Loading State */}
        {isLoading && (
          <div className="bg-surface rounded-token border border-hairline p-6 space-y-4">
            <Skeleton height="40px" />
            <Skeleton height="48px" />
            <Skeleton height="48px" />
            <Skeleton height="48px" />
            <Skeleton height="48px" />
          </div>
        )}

        {/* 2. Error State */}
        {isError && (
          <ErrorState
            title="Unable to load leads"
            message={error instanceof Error ? error.message : 'An error occurred while fetching leads.'}
            onRetry={() => refetch()}
          />
        )}

        {/* 3. Empty State */}
        {!isLoading && !isError && data?.data.length === 0 && (
          <EmptyState
            title="No leads found"
            description={
              activeTab === 'duplicates'
                ? 'All possible duplicates have been reviewed! No duplicate conflicts exist.'
                : 'No buyer enquiries matched your current search filters.'
            }
            action={{
              label: 'Clear Filters',
              onClick: () => {
                setSearch('');
                setSourceFilter('all');
                setStatusFilter('all');
                setUnassignedOnly(false);
              },
            }}
          />
        )}

        {/* 4. Leads List (Desktop Table + Mobile Cards) */}
        {!isLoading && !isError && data && data.data.length > 0 && (
          <div className="space-y-4">
            {/* Desktop Table View (>= md) */}
            <div className="hidden md:block bg-surface border border-hairline rounded-token overflow-hidden shadow-soft">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-surface-alt border-b border-hairline text-xs font-semibold text-ink-muted">
                  <tr>
                    <th className="py-3 px-4">Lead ID</th>
                    <th className="py-3 px-4">Buyer Name</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Project & Wants</th>
                    <th className="py-3 px-4">Touchpoints / Duplicate</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Last Activity</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {data.data.map((lead: LeadListItem) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-surface-alt/60 transition-colors cursor-pointer group"
                      onClick={() => setSelectedLeadId(lead.id)}
                    >
                      <td className="py-3 px-4 font-mono text-xs font-medium text-ink-muted">
                        {lead.publicId}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-ink-base group-hover:text-accent transition-colors">
                          {lead.name}
                        </div>
                        <div className="text-xs text-ink-muted font-mono">
                          {lead.phoneE164 || lead.email || 'Anonymous visitor'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={getSourceBadgeVariant(lead.source)}>
                          {lead.source.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs font-medium text-ink-base">
                          {lead.projectName || '—'}
                        </div>
                        <div className="text-xs text-ink-muted">{lead.wants}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {lead.touchpointsCount > 1 ? (
                            <Badge variant="accent">
                              {lead.touchpointsCount} touches
                            </Badge>
                          ) : (
                            <span className="text-xs text-ink-muted">1 touch</span>
                          )}

                          {lead.possibleDuplicateOf && (
                            <Badge variant="warning">
                              <AlertTriangle className="w-3 h-3 mr-1 inline" /> Possible Duplicate
                            </Badge>
                          )}

                          {lead.consentStatus === 'withdrawn' && (
                            <Badge variant="danger">
                              <ShieldAlert className="w-3 h-3 mr-1 inline" /> Cannot Contact
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={getStatusBadgeVariant(lead.status)}>
                          {lead.status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-ink-muted">
                        {formatInKolkataTime(lead.lastActivityAt)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {activeTab === 'duplicates' && lead.possibleDuplicateOf ? (
                          <div
                            className="flex justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => keepSeparateMutation.mutate(lead.id)}
                              isLoading={keepSeparateMutation.isPending}
                            >
                              Keep Separate
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              leftIcon={<GitMerge className="w-3.5 h-3.5" />}
                              onClick={() =>
                                mergeMutation.mutate({
                                  primaryId: lead.possibleDuplicateOf!,
                                  secondaryId: lead.id,
                                })
                              }
                              isLoading={mergeMutation.isPending}
                            >
                              Merge
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLeadId(lead.id);
                            }}
                          >
                            View
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (< md) */}
            <div className="md:hidden space-y-3">
              {data.data.map((lead: LeadListItem) => (
                <div
                  key={lead.id}
                  className="bg-surface border border-hairline rounded-token p-4 space-y-3 shadow-soft active:bg-surface-alt transition-colors"
                  onClick={() => setSelectedLeadId(lead.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-muted">{lead.publicId}</span>
                        <Badge variant={getSourceBadgeVariant(lead.source)}>
                          {lead.source.replace('_', ' ')}
                        </Badge>
                      </div>
                      <h4 className="font-semibold text-ink-base mt-1 text-base">{lead.name}</h4>
                    </div>
                    <Badge variant={getStatusBadgeVariant(lead.status)}>
                      {lead.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  <div className="text-xs text-ink-muted space-y-1">
                    <div>{lead.phoneE164 || lead.email || 'No contact provided'}</div>
                    <div>
                      {lead.projectName || 'Unassigned Project'} • {lead.wants}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-hairline text-xs">
                    {lead.touchpointsCount > 1 && (
                      <Badge variant="accent">
                        {lead.touchpointsCount} touches
                      </Badge>
                    )}
                    {lead.possibleDuplicateOf && (
                      <Badge variant="warning">
                        Possible Duplicate
                      </Badge>
                    )}
                    {lead.consentStatus === 'withdrawn' && (
                      <Badge variant="danger">
                        Cannot Contact
                      </Badge>
                    )}
                    <span className="text-ink-muted ml-auto font-mono text-[11px]">
                      {formatInKolkataTime(lead.lastActivityAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-ink-muted">
                Showing {data.data.length} of {data.total} leads (Page {data.page} of{' '}
                {data.totalPages})
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  leftIcon={<ChevronLeft className="w-4 h-4" />}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  rightIcon={<ChevronRight className="w-4 h-4" />}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Slide-over / Modal Lead Detail Drawer */}
      <LeadDetailDrawer
        leadId={selectedLeadId}
        isOpen={Boolean(selectedLeadId)}
        onClose={() => setSelectedLeadId(null)}
        onLeadUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
      />

      {/* CSV Import Modal */}
      <CsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
      />
    </StaffLayout>
  );
};