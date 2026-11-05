import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Search,
  Plus,
  Eye,
  History,
  Archive,
  Edit2,
  HelpCircle,
  Copy,
  Check,
  ShieldAlert,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/Button.js';
import { Input } from '../components/Input.js';
import { Textarea } from '../components/Textarea.js';
import { Select } from '../components/Select.js';
import { Badge } from '../components/Badge.js';
import { Modal } from '../components/Modal.js';
import { Skeleton } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { useToast } from '../components/Toast.js';
import { formatInKolkataTime } from '../lib/date.js';
import {
  fetchFactEntries,
  createFactEntry,
  updateFactEntry,
  archiveFactEntry,
  fetchFactVersions,
  fetchAssistantPreview,
  fetchUnansweredQuestions,
  resolveUnansweredQuestion,
  fetchProjects,
  type FetchFactEntriesParams,
  type ProjectItem,
} from '../lib/api.js';
import type {
  FactEntry,
  FactEntryVersion,
  FactAssistantPreviewItem,
  UnansweredQuestion,
  FactStatus,
  UnansweredQuestionStatus,
} from '@housy/shared';

const PRESET_CATEGORIES = [
  'pricing',
  'amenities',
  'floor_plans',
  'possession',
  'legal',
  'location',
  'developer',
  'offers',
  'general',
];

export const FactSheetPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'facts' | 'unanswered'>('facts');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('active');
  const [unansweredStatus, setUnansweredStatus] = useState<string>('unresolved');

  // Modals & Drawers state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingFact, setEditingFact] = useState<FactEntry | null>(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewProjectId, setPreviewProjectId] = useState<string>('all');
  const [copiedPreview, setCopiedPreview] = useState(false);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyFact, setHistoryFact] = useState<FactEntry | null>(null);

  // Form state for Add/Edit
  const [formProjectId, setFormProjectId] = useState<string>('');
  const [formKey, setFormKey] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('pricing');
  const [formValue, setFormValue] = useState('');
  const [formStatus, setFormStatus] = useState<FactStatus>('active');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Linked unanswered question ID (if opened from Unanswered tab)
  const [linkedQuestionId, setLinkedQuestionId] = useState<string | null>(null);

  // Queries
  const { data: projectsData } = useQuery<ProjectItem[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });
  const projects = projectsData ?? [];

  const factParams: FetchFactEntriesParams = {
    projectId: selectedProject !== 'all' ? selectedProject : undefined,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    status: selectedStatus !== 'all' ? (selectedStatus as FactStatus) : undefined,
    search: search.trim() || undefined,
  };

  const {
    data: facts,
    isLoading: isFactsLoading,
    isError: isFactsError,
    error: factsError,
    refetch: refetchFacts,
  } = useQuery<FactEntry[]>({
    queryKey: ['fact-sheet', factParams],
    queryFn: () => fetchFactEntries(factParams),
    enabled: activeTab === 'facts',
  });

  const {
    data: unansweredQuestions,
    isLoading: isUnansweredLoading,
    isError: isUnansweredError,
    error: unansweredError,
    refetch: refetchUnanswered,
  } = useQuery<UnansweredQuestion[]>({
    queryKey: ['unanswered-questions', unansweredStatus],
    queryFn: () =>
      fetchUnansweredQuestions(
        unansweredStatus !== 'all' ? (unansweredStatus as UnansweredQuestionStatus) : undefined,
      ),
    enabled: activeTab === 'unanswered',
  });

  const { data: previewData, isLoading: isPreviewLoading } = useQuery<FactAssistantPreviewItem[]>({
    queryKey: ['fact-preview', previewProjectId],
    queryFn: () => fetchAssistantPreview(previewProjectId !== 'all' ? previewProjectId : undefined),
    enabled: isPreviewOpen,
  });

  const { data: versionHistory, isLoading: isHistoryLoading } = useQuery<FactEntryVersion[]>({
    queryKey: ['fact-versions', historyFact?.id],
    queryFn: () => (historyFact ? fetchFactVersions(historyFact.id) : Promise.resolve([])),
    enabled: !!historyFact && isHistoryOpen,
  });

  // Mutations
  const createFactMutation = useMutation({
    mutationFn: createFactEntry,
    onSuccess: async () => {
      showToast({
        type: 'success',
        title: 'Fact Created',
        message: 'Fact entry added and published to AI knowledge base.',
      });
      setIsAddModalOpen(false);
      resetForm();

      if (linkedQuestionId) {
        await resolveUnansweredQuestion(linkedQuestionId, 'resolved');
        setLinkedQuestionId(null);
        void queryClient.invalidateQueries({ queryKey: ['unanswered-questions'] });
      }

      void queryClient.invalidateQueries({ queryKey: ['fact-sheet'] });
      void queryClient.invalidateQueries({ queryKey: ['fact-preview'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Failed to Create Fact',
        message: err.message,
      });
    },
  });

  const updateFactMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateFactEntry>[1] }) =>
      updateFactEntry(id, payload),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Fact Updated',
        message: 'New version row and audit trail successfully created.',
      });
      setIsEditModalOpen(false);
      setEditingFact(null);
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ['fact-sheet'] });
      void queryClient.invalidateQueries({ queryKey: ['fact-preview'] });
      void queryClient.invalidateQueries({ queryKey: ['fact-versions'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Failed to Update Fact',
        message: err.message,
      });
    },
  });

  const archiveFactMutation = useMutation({
    mutationFn: archiveFactEntry,
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Fact Archived',
        message: 'Fact is now archived and will no longer be injected into AI assistant prompts.',
      });
      void queryClient.invalidateQueries({ queryKey: ['fact-sheet'] });
      void queryClient.invalidateQueries({ queryKey: ['fact-preview'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Failed to Archive Fact',
        message: err.message,
      });
    },
  });

  const resolveQuestionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'resolved' | 'dismissed' }) =>
      resolveUnansweredQuestion(id, status),
    onSuccess: (_, variables) => {
      showToast({
        type: 'success',
        title: variables.status === 'resolved' ? 'Question Resolved' : 'Question Dismissed',
        message:
          variables.status === 'resolved'
            ? 'Marked as resolved with verified fact.'
            : 'Question dismissed from pending inbox.',
      });
      void queryClient.invalidateQueries({ queryKey: ['unanswered-questions'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Failed to Update Question',
        message: err.message,
      });
    },
  });

  // Helpers
  const resetForm = (): void => {
    setFormProjectId('');
    setFormKey('');
    setFormTitle('');
    setFormCategory('pricing');
    setFormValue('');
    setFormStatus('active');
    setFormErrors({});
    setLinkedQuestionId(null);
  };

  const validateForm = (isEdit: boolean): boolean => {
    const errors: Record<string, string> = {};

    if (!isEdit) {
      if (!formKey.trim()) {
        errors['key'] = 'Fact key is required.';
      } else if (!/^[a-z0-9_-]+$/i.test(formKey.trim())) {
        errors['key'] = 'Key can only contain alphanumeric characters, underscores, and hyphens.';
      } else if (formKey.trim().length > 100) {
        errors['key'] = 'Key cannot exceed 100 characters.';
      }
    }

    if (!formTitle.trim()) {
      errors['title'] = 'Title is required.';
    } else if (formTitle.trim().length < 2 || formTitle.trim().length > 200) {
      errors['title'] = 'Title must be between 2 and 200 characters.';
    }

    if (!formValue.trim()) {
      errors['value'] = 'Fact value / details are required.';
    } else if (formValue.trim().length < 2 || formValue.trim().length > 2000) {
      errors['value'] = 'Value must be between 2 and 2000 characters.';
    }

    if (!formCategory.trim()) {
      errors['category'] = 'Category is required.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleOpenAddModal = (initial?: { question?: string; projectId?: string | null; questionId?: string }): void => {
    resetForm();
    if (initial?.question) {
      setFormTitle(initial.question);
      setFormKey(
        initial.question
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .slice(0, 40)
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '') || 'unanswered_qa',
      );
      setFormValue(`Verified detail for: ${initial.question}`);
      if (initial.projectId) setFormProjectId(initial.projectId);
      if (initial.questionId) setLinkedQuestionId(initial.questionId);
    }
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (fact: FactEntry): void => {
    setEditingFact(fact);
    setFormProjectId(fact.projectId ?? '');
    setFormKey(fact.key);
    setFormTitle(fact.title);
    setFormCategory(fact.category);
    setFormValue(fact.value);
    setFormStatus(fact.status);
    setFormErrors({});
    setIsEditModalOpen(true);
  };

  const handleSaveAddFact = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!validateForm(false)) return;

    createFactMutation.mutate({
      projectId: formProjectId || null,
      key: formKey.trim(),
      title: formTitle.trim(),
      category: formCategory.trim(),
      value: formValue.trim(),
    });
  };

  const handleSaveEditFact = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!editingFact || !validateForm(true)) return;

    updateFactMutation.mutate({
      id: editingFact.id,
      payload: {
        title: formTitle.trim(),
        category: formCategory.trim(),
        value: formValue.trim(),
        status: formStatus,
      },
    });
  };

  const handleCopyPreview = (): void => {
    if (!previewData) return;
    const fullText = previewData.map((p) => p.injectedPromptText).join('\n\n');
    navigator.clipboard.writeText(fullText);
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 2500);
  };

  return (
    <StaffLayout userRole="sales_head">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Fact Sheet & Assistant Knowledge"
          description="Manage authoritative project facts and address buyer questions that the AI assistant couldn't answer."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPreviewOpen(true)}
                className="gap-1.5"
              >
                <Eye className="w-4 h-4 text-accent" />
                <span>Preview as Assistant</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleOpenAddModal()}
                className="gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Fact</span>
              </Button>
            </div>
          }
        />

        {/* Fact Grounding Policy Banner */}
        <div className="p-4 rounded-xl bg-accent-soft/40 border border-accent/20 flex items-start gap-3.5 shadow-subtle">
          <div className="p-2 rounded-lg bg-accent/10 text-accent flex-shrink-0 mt-0.5">
            <ShieldAlert className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 text-sm">
            <h2 className="font-semibold text-ink text-sm">AI Assistant Grounding & Zero-Hallucination Policy</h2>
            <p className="text-muted mt-1 leading-relaxed text-xs sm:text-sm">
              The conversational assistant is strictly restricted to facts declared on this sheet. If an answer cannot be verified from active entries, the assistant will decline to speculate and will initiate a human sales handoff. Every modification creates an immutable audit trail and version row.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-hairline gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('facts')}
            className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'facts'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Fact Sheet Entries</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('unanswered')}
            className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'unanswered'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Unanswered Questions Inbox</span>
          </button>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 1: FACT SHEET ENTRIES */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'facts' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-surface p-4 rounded-token border border-hairline flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Search facts by key, title, or details..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Projects (incl. Global)' },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />

                <Select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Categories' },
                    ...PRESET_CATEGORIES.map((c) => ({
                      value: c,
                      label: c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' '),
                    })),
                  ]}
                />

                <Select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  options={[
                    { value: 'active', label: 'Active Facts Only' },
                    { value: 'archived', label: 'Archived Only' },
                    { value: 'all', label: 'All Statuses' },
                  ]}
                />
              </div>
            </div>

            {/* List State: Loading / Error / Empty / Table */}
            {isFactsLoading ? (
              <div className="bg-surface p-6 rounded-token border border-hairline space-y-4">
                <Skeleton className="h-6 w-1/4" />
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-4 items-center">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-48 flex-1" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-8 w-20" />
                    </div>
                  ))}
                </div>
              </div>
            ) : isFactsError ? (
              <ErrorState
                title="Failed to Load Facts"
                message={(factsError as Error)?.message || 'An error occurred while fetching fact sheet entries.'}
                onRetry={() => void refetchFacts()}
              />
            ) : !facts || facts.length === 0 ? (
              <EmptyState
                title="No Facts Found"
                description={
                  search || selectedCategory !== 'all' || selectedProject !== 'all'
                    ? 'No facts match the selected filters. Try broadening your criteria or reset the search.'
                    : 'No fact entries declared yet. Add your first project fact to guide the AI assistant.'
                }
                action={{
                  label: 'Add First Fact',
                  onClick: () => handleOpenAddModal(),
                  icon: <Plus className="w-4 h-4 mr-1.5" />,
                }}
              />
            ) : (
              <div className="bg-surface rounded-token border border-hairline overflow-hidden shadow-subtle">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-background border-b border-hairline text-muted uppercase text-[11px] font-semibold tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Key & Scope</th>
                        <th className="py-3 px-4">Title & Fact Value</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Last Updated (IST)</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {facts.map((fact) => (
                        <tr key={fact.id} className="hover:bg-background/50 transition-colors">
                          <td className="py-3.5 px-4 align-top">
                            <span className="font-mono text-xs font-semibold text-ink block">
                              {fact.key}
                            </span>
                            <span className="text-xs text-muted mt-0.5 block">
                              {fact.projectName ? fact.projectName : 'Applies to All Projects'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 align-top max-w-md">
                            <div className="font-medium text-ink text-sm">{fact.title}</div>
                            <p className="text-xs text-muted mt-1 leading-relaxed line-clamp-2">
                              {fact.value}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <Badge variant="neutral" className="text-xs font-medium">
                              {fact.category}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <Badge
                              variant={fact.status === 'active' ? 'success' : 'neutral'}
                              className="text-xs capitalize"
                            >
                              {fact.status}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 align-top text-xs text-muted whitespace-nowrap">
                            <div>{formatInKolkataTime(fact.updatedAt)}</div>
                            {fact.updatedByName && (
                              <div className="text-[11px] text-ink-muted mt-0.5">by {fact.updatedByName}</div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEditModal(fact)}
                                title="Edit Fact"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setHistoryFact(fact);
                                  setIsHistoryOpen(true);
                                }}
                                title="Version History"
                              >
                                <History className="w-3.5 h-3.5" />
                              </Button>
                              {fact.status === 'active' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (window.confirm(`Archive fact "${fact.title}"? The AI assistant will stop using this fact.`)) {
                                      archiveFactMutation.mutate(fact.id);
                                    }
                                  }}
                                  title="Archive Fact"
                                  className="text-danger hover:text-danger hover:bg-danger-soft/20"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
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
        {/* TAB 2: UNANSWERED QUESTIONS INBOX */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'unanswered' && (
          <div className="space-y-4">
            {/* Filter toolbar */}
            <div className="bg-surface p-4 rounded-token border border-hairline flex items-center justify-between">
              <div className="text-sm font-medium text-ink flex items-center gap-2">
                <span>Filter by status:</span>
                <Select
                  value={unansweredStatus}
                  onChange={(e) => setUnansweredStatus(e.target.value)}
                  options={[
                    { value: 'unresolved', label: 'Unresolved (Pending)' },
                    { value: 'resolved', label: 'Resolved' },
                    { value: 'dismissed', label: 'Dismissed' },
                    { value: 'all', label: 'All Questions' },
                  ]}
                />
              </div>

              <div className="text-xs text-muted">
                These questions were asked by buyers where no factual answer was found in the sheet.
              </div>
            </div>

            {/* List State: Loading / Error / Empty / Items */}
            {isUnansweredLoading ? (
              <div className="bg-surface p-6 rounded-token border border-hairline space-y-4">
                <Skeleton className="h-6 w-1/4" />
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              </div>
            ) : isUnansweredError ? (
              <ErrorState
                title="Failed to Load Questions"
                message={(unansweredError as Error)?.message || 'An error occurred.'}
                onRetry={() => void refetchUnanswered()}
              />
            ) : !unansweredQuestions || unansweredQuestions.length === 0 ? (
              <EmptyState
                title="Inbox Clear"
                description={
                  unansweredStatus === 'unresolved'
                    ? 'No pending unanswered buyer questions. The AI assistant has answered all queries from the fact sheet.'
                    : 'No questions match the selected filter.'
                }
              />
            ) : (
              <div className="space-y-3">
                {unansweredQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="p-4 rounded-token bg-surface border border-hairline flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-subtle hover:border-accent/40 transition-colors"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            q.status === 'unresolved'
                              ? 'warning'
                              : q.status === 'resolved'
                                ? 'success'
                                : 'neutral'
                          }
                          className="capitalize text-xs"
                        >
                          {q.status}
                        </Badge>
                        <Badge variant="neutral" className="text-[11px] uppercase">
                          {q.buyerLanguage}
                        </Badge>
                        <span className="text-xs text-muted">
                          {q.projectName ? q.projectName : 'General Query'}
                        </span>
                        <span className="text-xs text-muted">·</span>
                        <span className="text-xs text-muted">{formatInKolkataTime(q.createdAt)}</span>
                      </div>

                      <p className="text-base font-medium text-ink">"{q.question}"</p>

                      {q.resolvedByName && (
                        <p className="text-xs text-muted">
                          Resolved by {q.resolvedByName} at{' '}
                          {q.resolvedAt ? formatInKolkataTime(q.resolvedAt) : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {q.status === 'unresolved' && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              handleOpenAddModal({
                                question: q.question,
                                projectId: q.projectId,
                                questionId: q.id,
                              })
                            }
                            className="gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add as Fact</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              resolveQuestionMutation.mutate({
                                id: q.id,
                                status: 'dismissed',
                              })
                            }
                            title="Dismiss Question"
                          >
                            <XCircle className="w-3.5 h-3.5 text-muted hover:text-danger" />
                          </Button>
                        </>
                      )}

                      {q.status === 'dismissed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            resolveQuestionMutation.mutate({
                              id: q.id,
                              status: 'resolved',
                            })
                          }
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-success" />
                          <span>Mark Resolved</span>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* ADD FACT MODAL */}
        {/* ------------------------------------------------------------------ */}
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Add Authoritative Project Fact"
          description="Every new fact is immediately published to the AI prompt context and recorded in the audit log."
        >
          <form onSubmit={handleSaveAddFact} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink uppercase mb-1">
                Project Scope
              </label>
              <Select
                value={formProjectId}
                onChange={(e) => setFormProjectId(e.target.value)}
                options={[
                  { value: '', label: 'All Projects (Global Scope)' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
              <p className="text-[11px] text-muted mt-1">
                Leave as Global Scope if this fact applies across all developments.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Unique Key *
                </label>
                <Input
                  placeholder="e.g. pricing_2bhk_min"
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  errorMessage={formErrors['key']}
                />
                <p className="text-[11px] text-muted mt-1">Letters, numbers, hyphens, underscores.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Category *
                </label>
                <Select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  options={PRESET_CATEGORIES.map((c) => ({
                    value: c,
                    label: c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' '),
                  }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink uppercase mb-1">
                Fact Title / Question *
              </label>
              <Input
                placeholder="e.g. 2 BHK Starting Price and Carpet Area"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                errorMessage={formErrors['title']}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink uppercase mb-1">
                Authoritative Value / Answer *
              </label>
              <Textarea
                placeholder="Enter exact pricing range, amenities, or legal details. The AI model will only state what is written here."
                rows={4}
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                errorMessage={formErrors['value']}
              />
              <p className="text-[11px] text-muted mt-1">
                Avoid speculative or approximate statements unless explicitly bounded.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-hairline">
              <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={createFactMutation.isPending}>
                Publish Fact
              </Button>
            </div>
          </form>
        </Modal>

        {/* ------------------------------------------------------------------ */}
        {/* EDIT FACT MODAL */}
        {/* ------------------------------------------------------------------ */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title={`Edit Fact: ${editingFact?.key}`}
          description="Editing writes an incremental version row and captures an audit trail record."
        >
          <form onSubmit={handleSaveEditFact} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Category *
                </label>
                <Select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  options={PRESET_CATEGORIES.map((c) => ({
                    value: c,
                    label: c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' '),
                  }))}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">
                  Status *
                </label>
                <Select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as FactStatus)}
                  options={[
                    { value: 'active', label: 'Active (Injected in AI)' },
                    { value: 'archived', label: 'Archived (Excluded)' },
                  ]}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink uppercase mb-1">
                Fact Title / Question *
              </label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                errorMessage={formErrors['title']}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink uppercase mb-1">
                Authoritative Value / Answer *
              </label>
              <Textarea
                rows={5}
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                errorMessage={formErrors['value']}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-hairline">
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={updateFactMutation.isPending}>
                Save & Create Version
              </Button>
            </div>
          </form>
        </Modal>

        {/* ------------------------------------------------------------------ */}
        {/* ASSISTANT PREVIEW DRAWER / MODAL */}
        {/* ------------------------------------------------------------------ */}
        <Modal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          title="AI Assistant Injected Prompt Preview"
          description="Exact fact text and IDs injected into the system prompt context for real-time buyer conversations."
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Select
                value={previewProjectId}
                onChange={(e) => setPreviewProjectId(e.target.value)}
                options={[
                  { value: 'all', label: 'All Projects Preview' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyPreview}
                className="gap-1.5 flex-shrink-0"
              >
                {copiedPreview ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-success" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy All</span>
                  </>
                )}
              </Button>
            </div>

            {isPreviewLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !previewData || previewData.length === 0 ? (
              <EmptyState
                title="No Active Facts Injected"
                description="There are currently no active fact entries for this scope. The assistant will decline all queries."
              />
            ) : (
              <div className="p-3 rounded-lg bg-ink text-surface font-mono text-xs max-h-96 overflow-y-auto space-y-2 leading-relaxed selection:bg-accent selection:text-white">
                {previewData.map((item) => (
                  <div key={item.id} className="pb-2 border-b border-white/10 last:border-0">
                    <span className="text-accent font-semibold">[FACT ID: {item.id}]</span>{' '}
                    <span className="text-warning uppercase">[{item.category}]</span>{' '}
                    <span className="text-white font-medium">{item.title}:</span>{' '}
                    <span className="text-white/80">{item.value}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="p-3 rounded-lg bg-surface border border-hairline flex items-center gap-2 text-xs text-muted">
              <Info className="w-4 h-4 text-accent flex-shrink-0" />
              <span>
                {previewData?.length ?? 0} active facts currently injected into the LLM system prompt.
              </span>
            </div>
          </div>
        </Modal>

        {/* ------------------------------------------------------------------ */}
        {/* VERSION HISTORY MODAL */}
        {/* ------------------------------------------------------------------ */}
        <Modal
          isOpen={isHistoryOpen}
          onClose={() => {
            setIsHistoryOpen(false);
            setHistoryFact(null);
          }}
          title={`Version History: ${historyFact?.key}`}
          description={`Every modification of "${historyFact?.title}" is tracked below.`}
        >
          <div className="space-y-3">
            {isHistoryLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !versionHistory || versionHistory.length === 0 ? (
              <EmptyState
                title="No History Found"
                description="No previous versions recorded for this fact entry."
              />
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {versionHistory.map((v) => (
                  <div
                    key={v.id}
                    className="p-3.5 rounded-lg bg-background border border-hairline space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="accent" className="text-xs">
                          v{v.versionNumber}
                        </Badge>
                        <Badge
                          variant={v.status === 'active' ? 'success' : 'neutral'}
                          className="capitalize text-[11px]"
                        >
                          {v.status}
                        </Badge>
                        <span className="text-xs font-semibold text-ink">{v.title}</span>
                      </div>
                      <span className="text-xs text-muted">
                        {formatInKolkataTime(v.changedAt)}
                      </span>
                    </div>

                    <p className="text-xs text-muted leading-relaxed pl-2 border-l-2 border-hairline">
                      {v.value}
                    </p>

                    {v.changedByName && (
                      <p className="text-[11px] text-ink-muted">Changed by {v.changedByName}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      </div>
    </StaffLayout>
  );
};
