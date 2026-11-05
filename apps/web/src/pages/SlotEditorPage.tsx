import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Trash2,
  Lock,
  Unlock,
  AlertTriangle,
  RotateCw,
  CalendarOff,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/Button.js';
import { Input } from '../components/Input.js';
import { Select } from '../components/Select.js';
import { Badge } from '../components/Badge.js';
import { Modal } from '../components/Modal.js';
import { Skeleton } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { useToast } from '../components/Toast.js';
import { formatTimeInKolkata, formatDateInKolkata } from '../lib/date.js';
import {
  fetchAvailabilityRules,
  createAvailabilityRule,
  deleteAvailabilityRule,
  fetchBlackoutDates,
  createBlackoutDate,
  deleteBlackoutDate,
  fetchAdminSlotsPreview,
  blockAdminSlot,
  unblockAdminSlot,
  triggerSlotGeneration,
  fetchProjects,
  fetchAdminExecutives,
  type ProjectItem,
  type AdminExecutiveItem,
  type FetchAdminSlotsPreviewParams,
} from '../lib/api.js';
import type {
  AdminAvailabilityRule,
  AdminBlackoutDate,
  AdminSlotItem,
} from '@housy/shared';

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export const SlotEditorPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'preview' | 'rules' | 'blackouts'>('preview');

  // Filters for preview
  const [filterProject, setFilterProject] = useState('all');
  const [filterExecutive, setFilterExecutive] = useState('all');

  // Modals state
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [isBlackoutModalOpen, setIsBlackoutModalOpen] = useState(false);
  const [selectedBookedSlot, setSelectedBookedSlot] = useState<AdminSlotItem | null>(null);

  // Form state for rule
  const [ruleProjectId, setRuleProjectId] = useState('');
  const [ruleExecutiveId, setRuleExecutiveId] = useState('');
  const [ruleWeekday, setRuleWeekday] = useState<number>(1);
  const [ruleStartTime, setRuleStartTime] = useState('10:00');
  const [ruleEndTime, setRuleEndTime] = useState('18:00');
  const [ruleSlotMinutes, setRuleSlotMinutes] = useState(60);
  const [ruleError, setRuleError] = useState('');

  // Form state for blackout
  const [blackoutDate, setBlackoutDate] = useState('');
  const [blackoutProjectId, setBlackoutProjectId] = useState('');
  const [blackoutExecutiveId, setBlackoutExecutiveId] = useState('');
  const [blackoutReason, setBlackoutReason] = useState('');
  const [blackoutError, setBlackoutError] = useState('');

  // Queries
  const { data: projectsData } = useQuery<ProjectItem[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });
  const projects = projectsData ?? [];

  const { data: executivesData } = useQuery<AdminExecutiveItem[]>({
    queryKey: ['admin-executives'],
    queryFn: fetchAdminExecutives,
  });
  const executives = executivesData ?? [];

  const previewParams: FetchAdminSlotsPreviewParams = {
    projectId: filterProject !== 'all' ? filterProject : undefined,
    executiveId: filterExecutive !== 'all' ? filterExecutive : undefined,
  };

  const {
    data: previewSlots,
    isLoading: isPreviewLoading,
    isError: isPreviewError,
    error: previewError,
    refetch: refetchPreview,
  } = useQuery<AdminSlotItem[]>({
    queryKey: ['admin-slots-preview', previewParams],
    queryFn: () => fetchAdminSlotsPreview(previewParams),
    enabled: activeTab === 'preview',
  });

  const {
    data: rules,
    isLoading: isRulesLoading,
    isError: isRulesError,
    error: rulesError,
    refetch: refetchRules,
  } = useQuery<AdminAvailabilityRule[]>({
    queryKey: ['admin-rules'],
    queryFn: () => fetchAvailabilityRules(),
    enabled: activeTab === 'rules',
  });

  const {
    data: blackouts,
    isLoading: isBlackoutsLoading,
    isError: isBlackoutsError,
    error: blackoutsError,
    refetch: refetchBlackouts,
  } = useQuery<AdminBlackoutDate[]>({
    queryKey: ['admin-blackouts'],
    queryFn: () => fetchBlackoutDates(),
    enabled: activeTab === 'blackouts',
  });

  // Mutations
  const generateMutation = useMutation({
    mutationFn: () => triggerSlotGeneration(21),
    onSuccess: (data) => {
      showToast({
        type: 'success',
        title: 'Slots Generated',
        message: `Idempotent generation complete: created ${data.createdSlotsCount} new open slots. Booked slots were retained.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['admin-slots-preview'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Slot Generation Failed',
        message: err.message,
      });
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: createAvailabilityRule,
    onSuccess: (res) => {
      showToast({
        type: 'success',
        title: 'Availability Rule Saved',
        message: `Rule created. ${res.createdSlotsCount} new slots automatically generated for the next 21 days.`,
      });
      setIsRuleModalOpen(false);
      resetRuleForm();
      void queryClient.invalidateQueries({ queryKey: ['admin-rules'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-slots-preview'] });
    },
    onError: (err: Error) => {
      setRuleError(err.message);
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: deleteAvailabilityRule,
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Rule Deleted',
        message: 'Availability rule removed. Booked slots remain protected.',
      });
      void queryClient.invalidateQueries({ queryKey: ['admin-rules'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-slots-preview'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Failed to Delete Rule',
        message: err.message,
      });
    },
  });

  const createBlackoutMutation = useMutation({
    mutationFn: createBlackoutDate,
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Blackout Date Scheduled',
        message: 'Slots on this date are now blocked. Generation will skip this date.',
      });
      setIsBlackoutModalOpen(false);
      resetBlackoutForm();
      void queryClient.invalidateQueries({ queryKey: ['admin-blackouts'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-slots-preview'] });
    },
    onError: (err: Error) => {
      setBlackoutError(err.message);
    },
  });

  const deleteBlackoutMutation = useMutation({
    mutationFn: deleteBlackoutDate,
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Blackout Removed',
        message: 'Blackout date removed. Re-running generation will create available slots.',
      });
      void queryClient.invalidateQueries({ queryKey: ['admin-blackouts'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-slots-preview'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Failed to Remove Blackout',
        message: err.message,
      });
    },
  });

  const blockSlotMutation = useMutation({
    mutationFn: (id: string) => blockAdminSlot(id),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Slot Blocked',
        message: 'This slot is now blocked from buyer and staff booking.',
      });
      void queryClient.invalidateQueries({ queryKey: ['admin-slots-preview'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Cannot Block Slot',
        message: err.message,
      });
    },
  });

  const unblockSlotMutation = useMutation({
    mutationFn: (id: string) => unblockAdminSlot(id),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Slot Unblocked',
        message: 'Slot restored to open availability.',
      });
      void queryClient.invalidateQueries({ queryKey: ['admin-slots-preview'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Failed to Unblock Slot',
        message: err.message,
      });
    },
  });

  // Helpers
  const resetRuleForm = (): void => {
    setRuleProjectId(projects[0]?.id || '');
    setRuleExecutiveId(executives[0]?.id || '');
    setRuleWeekday(1);
    setRuleStartTime('10:00');
    setRuleEndTime('18:00');
    setRuleSlotMinutes(60);
    setRuleError('');
  };

  const resetBlackoutForm = (): void => {
    setBlackoutDate('');
    setBlackoutProjectId('');
    setBlackoutExecutiveId('');
    setBlackoutReason('');
    setBlackoutError('');
  };

  const handleOpenRuleModal = (): void => {
    resetRuleForm();
    setIsRuleModalOpen(true);
  };

  const handleOpenBlackoutModal = (): void => {
    resetBlackoutForm();
    setIsBlackoutModalOpen(true);
  };

  const handleSaveRule = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!ruleProjectId) {
      setRuleError('Please select a project.');
      return;
    }
    if (!ruleExecutiveId) {
      setRuleError('Please select an executive.');
      return;
    }
    if (ruleStartTime >= ruleEndTime) {
      setRuleError('Start time must precede end time.');
      return;
    }

    createRuleMutation.mutate({
      projectId: ruleProjectId,
      executiveId: ruleExecutiveId,
      weekday: Number(ruleWeekday),
      startTime: ruleStartTime,
      endTime: ruleEndTime,
      slotMinutes: Number(ruleSlotMinutes),
    });
  };

  const handleSaveBlackout = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!blackoutDate) {
      setBlackoutError('Please select a valid calendar date.');
      return;
    }

    createBlackoutMutation.mutate({
      blackoutDate,
      projectId: blackoutProjectId || null,
      executiveId: blackoutExecutiveId || null,
      reason: blackoutReason.trim() || null,
    });
  };

  // Group slots by Day in Asia/Kolkata
  const groupedSlots = React.useMemo(() => {
    if (!previewSlots) return [];
    const map = new Map<string, AdminSlotItem[]>();

    for (const slot of previewSlots) {
      const dayKey = formatDateInKolkata(slot.startsAt);
      if (!map.has(dayKey)) {
        map.set(dayKey, []);
      }
      map.get(dayKey)!.push(slot);
    }

    return Array.from(map.entries()).map(([day, slots]) => ({
      day,
      slots: slots.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    }));
  }, [previewSlots]);

  return (
    <StaffLayout userRole="sales_head">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Executive Visit Slots & Availability"
          description="Configure weekly availability rules per executive, blackout dates, and manage slot generation and blocking."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateMutation.mutate()}
                isLoading={generateMutation.isPending}
                className="gap-1.5"
              >
                <RotateCw className="w-4 h-4 text-accent" />
                <span>Generate Next 21 Days</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenBlackoutModal}
                className="gap-1.5"
              >
                <CalendarOff className="w-4 h-4 text-warning" />
                <span>Add Blackout Date</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenRuleModal}
                className="gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Weekly Rule</span>
              </Button>
            </div>
          }
        />

        {/* Informational Banner */}
        <div className="p-4 rounded-xl bg-accent-soft/30 border border-accent/20 flex items-start gap-3.5 shadow-subtle">
          <div className="p-2 rounded-lg bg-accent/10 text-accent flex-shrink-0 mt-0.5">
            <ShieldAlert className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 text-sm">
            <h2 className="font-semibold text-ink text-sm">Strict Double-Booking Protection & Slot Safety</h2>
            <p className="text-muted mt-1 leading-relaxed text-xs sm:text-sm">
              Slot generation is strictly idempotent. Adding or modifying rules will generate new open slots without ever deleting or altering existing booked appointments. Booked slots are locked and protected against deletion or blocking.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-hairline gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>Calendar Slot Preview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'rules'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Weekly Availability Rules</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('blackouts')}
            className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'blackouts'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <CalendarOff className="w-4 h-4" />
            <span>Blackout Dates</span>
          </button>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 1: CALENDAR SLOT PREVIEW */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'preview' && (
          <div className="space-y-4">
            {/* Filter toolbar */}
            <div className="bg-surface p-4 rounded-token border border-hairline flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Projects' },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />

                <Select
                  value={filterExecutive}
                  onChange={(e) => setFilterExecutive(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Sales Executives' },
                    ...executives.map((e) => ({ value: e.id, label: e.name })),
                  ]}
                />
              </div>

              <div className="flex items-center gap-3 text-xs text-muted">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-success" />
                  <span>Open</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                  <span>Booked</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                  <span>Blocked</span>
                </div>
              </div>
            </div>

            {/* List State: Loading / Error / Empty / Days */}
            {isPreviewLoading ? (
              <div className="bg-surface p-6 rounded-token border border-hairline space-y-4">
                <Skeleton className="h-6 w-1/4" />
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              </div>
            ) : isPreviewError ? (
              <ErrorState
                title="Failed to Load Slot Preview"
                message={(previewError as Error)?.message || 'An error occurred.'}
                onRetry={() => void refetchPreview()}
              />
            ) : groupedSlots.length === 0 ? (
              <EmptyState
                title="No Slots Generated"
                description="No visit slots found for the next 21 days. Click 'Generate Next 21 Days' or add an availability rule."
                action={{
                  label: 'Generate Slots Now',
                  onClick: () => generateMutation.mutate(),
                  icon: <RotateCw className="w-4 h-4 mr-1.5" />,
                }}
              />
            ) : (
              <div className="space-y-6">
                {groupedSlots.map(({ day, slots }) => (
                  <div
                    key={day}
                    className="p-4 rounded-token bg-surface border border-hairline shadow-subtle space-y-3"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-hairline">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-accent" />
                        <h2 className="font-semibold text-ink text-sm sm:text-base">{day}</h2>
                      </div>
                      <span className="text-xs text-muted font-medium">
                        {slots.length} total slot{slots.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                      {slots.map((slot) => {
                        const isBooked = slot.status === 'booked';
                        const isBlocked = slot.status === 'blocked';
                        const isOpen = slot.status === 'open';

                        return (
                          <div
                            key={slot.id}
                            className={`p-3 rounded-lg border text-xs flex flex-col justify-between gap-2 transition-all ${
                              isBooked
                                ? 'bg-accent/5 border-accent/30'
                                : isBlocked
                                  ? 'bg-warning-soft/30 border-warning/30'
                                  : 'bg-background border-hairline hover:border-accent/40'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div>
                                <span className="font-semibold text-ink text-xs block">
                                  {formatTimeInKolkata(slot.startsAt)} - {formatTimeInKolkata(slot.endsAt)}
                                </span>
                                <span className="text-[11px] text-muted block mt-0.5">
                                  {slot.executiveName || 'Executive'} · {slot.projectName || 'Project'}
                                </span>
                              </div>

                              <Badge
                                variant={isBooked ? 'accent' : isBlocked ? 'warning' : 'success'}
                                className="capitalize text-[10px] px-1.5 py-0"
                              >
                                {slot.status}
                              </Badge>
                            </div>

                            <div className="pt-2 border-t border-hairline/60 flex items-center justify-between">
                              {isOpen && (
                                <button
                                  type="button"
                                  onClick={() => blockSlotMutation.mutate(slot.id)}
                                  className="text-[11px] text-muted hover:text-warning flex items-center gap-1 font-medium"
                                  title="Block this slot"
                                >
                                  <Lock className="w-3 h-3" />
                                  <span>Block Slot</span>
                                </button>
                              )}

                              {isBlocked && (
                                <button
                                  type="button"
                                  onClick={() => unblockSlotMutation.mutate(slot.id)}
                                  className="text-[11px] text-accent hover:underline flex items-center gap-1 font-medium"
                                  title="Unblock this slot"
                                >
                                  <Unlock className="w-3 h-3" />
                                  <span>Unblock</span>
                                </button>
                              )}

                              {isBooked && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedBookedSlot(slot)}
                                  className="text-[11px] text-accent hover:underline flex items-center gap-1 font-medium"
                                  title="View booking details"
                                >
                                  <UserCheck className="w-3 h-3" />
                                  <span>{slot.booking?.leadName || 'Visitor Booked'}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 2: WEEKLY AVAILABILITY RULES */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'rules' && (
          <div className="space-y-4">
            {isRulesLoading ? (
              <div className="bg-surface p-6 rounded-token border border-hairline space-y-4">
                <Skeleton className="h-6 w-1/4" />
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              </div>
            ) : isRulesError ? (
              <ErrorState
                title="Failed to Load Availability Rules"
                message={(rulesError as Error)?.message || 'An error occurred.'}
                onRetry={() => void refetchRules()}
              />
            ) : !rules || rules.length === 0 ? (
              <EmptyState
                title="No Weekly Rules Defined"
                description="Create availability rules per executive and project to automatically generate visit slots."
                action={{
                  label: 'Add First Rule',
                  onClick: handleOpenRuleModal,
                  icon: <Plus className="w-4 h-4 mr-1.5" />,
                }}
              />
            ) : (
              <div className="bg-surface rounded-token border border-hairline overflow-hidden shadow-subtle">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-background border-b border-hairline text-muted uppercase text-[11px] font-semibold tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Project</th>
                        <th className="py-3 px-4">Sales Executive</th>
                        <th className="py-3 px-4">Weekday</th>
                        <th className="py-3 px-4">Active Hours</th>
                        <th className="py-3 px-4">Slot Duration</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {rules.map((rule) => {
                        const weekdayLabel =
                          WEEKDAYS.find((w) => w.value === rule.weekday)?.label ?? `Day ${rule.weekday}`;

                        return (
                          <tr key={rule.id} className="hover:bg-background/50 transition-colors">
                            <td className="py-3.5 px-4 font-medium text-ink">
                              {rule.projectName || 'Project'}
                            </td>
                            <td className="py-3.5 px-4 text-ink">
                              {rule.executiveName || 'Executive'}
                            </td>
                            <td className="py-3.5 px-4">
                              <Badge variant="neutral" className="text-xs font-medium">
                                {weekdayLabel}
                              </Badge>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs text-ink">
                              {rule.startTime.slice(0, 5)} - {rule.endTime.slice(0, 5)} IST
                            </td>
                            <td className="py-3.5 px-4 text-xs text-muted">
                              {rule.slotMinutes} mins
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (window.confirm(`Delete rule for ${weekdayLabel}? Booked slots will not be altered.`)) {
                                    deleteRuleMutation.mutate(rule.id);
                                  }
                                }}
                                title="Delete Rule"
                                className="text-danger hover:text-danger hover:bg-danger-soft/20"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 3: BLACKOUT DATES */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'blackouts' && (
          <div className="space-y-4">
            {isBlackoutsLoading ? (
              <div className="bg-surface p-6 rounded-token border border-hairline space-y-4">
                <Skeleton className="h-6 w-1/4" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              </div>
            ) : isBlackoutsError ? (
              <ErrorState
                title="Failed to Load Blackout Dates"
                message={(blackoutsError as Error)?.message || 'An error occurred.'}
                onRetry={() => void refetchBlackouts()}
              />
            ) : !blackouts || blackouts.length === 0 ? (
              <EmptyState
                title="No Blackout Dates"
                description="No blackout dates scheduled. Add public holidays, office closures, or executive leave days."
                action={{
                  label: 'Add Blackout Date',
                  onClick: handleOpenBlackoutModal,
                  icon: <CalendarOff className="w-4 h-4 mr-1.5" />,
                }}
              />
            ) : (
              <div className="bg-surface rounded-token border border-hairline overflow-hidden shadow-subtle">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-background border-b border-hairline text-muted uppercase text-[11px] font-semibold tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Scope</th>
                        <th className="py-3 px-4">Executive</th>
                        <th className="py-3 px-4">Reason</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {blackouts.map((b) => (
                        <tr key={b.id} className="hover:bg-background/50 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-semibold text-ink text-xs">
                            {b.blackoutDate}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-muted">
                            {b.projectName || 'All Projects (Global)'}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-muted">
                            {b.executiveName || 'All Executives'}
                          </td>
                          <td className="py-3.5 px-4 text-sm text-ink">
                            {b.reason || 'Scheduled Holiday / Blackout'}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (window.confirm(`Remove blackout for ${b.blackoutDate}?`)) {
                                  deleteBlackoutMutation.mutate(b.id);
                                }
                              }}
                              className="text-danger hover:text-danger hover:bg-danger-soft/20"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* ADD RULE MODAL */}
        {/* ------------------------------------------------------------------ */}
        <Modal
          isOpen={isRuleModalOpen}
          onClose={() => setIsRuleModalOpen(false)}
          title="Add Weekly Availability Rule"
          description="Sets the regular recurring hours for an executive. Changes will automatically trigger slot generation for the next 21 days."
        >
          <form onSubmit={handleSaveRule} className="space-y-4">
            {ruleError && (
              <div className="p-3 rounded-lg bg-danger-soft/40 border border-danger/30 text-danger text-xs font-medium">
                {ruleError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Project *
                </label>
                <Select
                  value={ruleProjectId}
                  onChange={(e) => setRuleProjectId(e.target.value)}
                  options={projects.map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Executive *
                </label>
                <Select
                  value={ruleExecutiveId}
                  onChange={(e) => setRuleExecutiveId(e.target.value)}
                  options={executives.map((e) => ({ value: e.id, label: e.name }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink uppercase mb-1">
                Day of the Week *
              </label>
              <Select
                value={ruleWeekday.toString()}
                onChange={(e) => setRuleWeekday(Number(e.target.value))}
                options={WEEKDAYS.map((w) => ({ value: w.value.toString(), label: w.label }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Start Time *
                </label>
                <Input
                  type="time"
                  value={ruleStartTime}
                  onChange={(e) => setRuleStartTime(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  End Time *
                </label>
                <Input
                  type="time"
                  value={ruleEndTime}
                  onChange={(e) => setRuleEndTime(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Slot Duration
                </label>
                <Select
                  value={ruleSlotMinutes.toString()}
                  onChange={(e) => setRuleSlotMinutes(Number(e.target.value))}
                  options={[
                    { value: '30', label: '30 mins' },
                    { value: '45', label: '45 mins' },
                    { value: '60', label: '60 mins (Default)' },
                    { value: '90', label: '90 mins' },
                  ]}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-hairline">
              <Button type="button" variant="outline" onClick={() => setIsRuleModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={createRuleMutation.isPending}>
                Save & Generate Slots
              </Button>
            </div>
          </form>
        </Modal>

        {/* ------------------------------------------------------------------ */}
        {/* ADD BLACKOUT MODAL */}
        {/* ------------------------------------------------------------------ */}
        <Modal
          isOpen={isBlackoutModalOpen}
          onClose={() => setIsBlackoutModalOpen(false)}
          title="Add Blackout Date"
          description="Designate a date as unavailable. Generated slots on this date will be automatically blocked."
        >
          <form onSubmit={handleSaveBlackout} className="space-y-4">
            {blackoutError && (
              <div className="p-3 rounded-lg bg-danger-soft/40 border border-danger/30 text-danger text-xs font-medium">
                {blackoutError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-ink uppercase mb-1">
                Blackout Date (YYYY-MM-DD) *
              </label>
              <Input
                type="date"
                value={blackoutDate}
                onChange={(e) => setBlackoutDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Project Scope
                </label>
                <Select
                  value={blackoutProjectId}
                  onChange={(e) => setBlackoutProjectId(e.target.value)}
                  options={[
                    { value: '', label: 'All Projects (Global)' },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Executive Scope
                </label>
                <Select
                  value={blackoutExecutiveId}
                  onChange={(e) => setBlackoutExecutiveId(e.target.value)}
                  options={[
                    { value: '', label: 'All Executives' },
                    ...executives.map((e) => ({ value: e.id, label: e.name })),
                  ]}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink uppercase mb-1">
                Reason / Note
              </label>
              <Input
                placeholder="e.g. Diwali Holiday, Staff Offsite, RERA Audit"
                value={blackoutReason}
                onChange={(e) => setBlackoutReason(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-hairline">
              <Button type="button" variant="outline" onClick={() => setIsBlackoutModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={createBlackoutMutation.isPending}>
                Schedule Blackout
              </Button>
            </div>
          </form>
        </Modal>

        {/* ------------------------------------------------------------------ */}
        {/* BOOKED SLOT WARNING MODAL */}
        {/* ------------------------------------------------------------------ */}
        <Modal
          isOpen={!!selectedBookedSlot}
          onClose={() => setSelectedBookedSlot(null)}
          title="Active Site Visit Appointment"
          description="Booked slots cannot be deleted, blocked, or altered directly from the slot manager."
        >
          {selectedBookedSlot && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-accent-soft/40 border border-accent/20 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                <div className="text-xs text-ink space-y-1">
                  <p className="font-semibold text-sm">Protected Booking</p>
                  <p className="leading-relaxed text-muted">
                    This slot has a confirmed appointment with an active buyer. To make this slot available or to reassign the executive, use the Site Visits page to reschedule or cancel the appointment with buyer notification.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-surface border border-hairline space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted">Visitor Name:</span>
                  <span className="font-semibold text-ink">
                    {selectedBookedSlot.booking?.leadName || 'Visitor'}
                  </span>
                </div>
                {selectedBookedSlot.booking?.leadPublicId && (
                  <div className="flex justify-between">
                    <span className="text-muted">Lead ID:</span>
                    <span className="font-mono text-ink">
                      {selectedBookedSlot.booking.leadPublicId}
                    </span>
                  </div>
                )}
                {selectedBookedSlot.booking?.leadPhone && (
                  <div className="flex justify-between">
                    <span className="text-muted">Contact:</span>
                    <span className="font-mono text-ink">
                      {selectedBookedSlot.booking.leadPhone}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted">Slot Time (IST):</span>
                  <span className="font-medium text-ink">
                    {formatTimeInKolkata(selectedBookedSlot.startsAt)} -{' '}
                    {formatTimeInKolkata(selectedBookedSlot.endsAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Assigned Executive:</span>
                  <span className="font-medium text-ink">
                    {selectedBookedSlot.executiveName}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
                <Button variant="primary" onClick={() => setSelectedBookedSlot(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </StaffLayout>
  );
};
