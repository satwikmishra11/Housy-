import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { StatTile } from '../components/StatTile.js';
import { Button } from '../components/Button.js';
import { Badge } from '../components/Badge.js';
import { Card } from '../components/Card.js';
import { Skeleton } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { Tabs } from '../components/Tabs.js';
import { Modal } from '../components/Modal.js';
import { Textarea } from '../components/Textarea.js';
import { LeadDetailDrawer } from '../components/LeadDetailDrawer.js';
import { useToast } from '../components/Toast.js';
import {
  fetchDailyReviewSummary,
  downloadDailyReviewCsv,
  reviewFlaggedChat,
  resolveUnansweredQuestion,
  fetchChatHistory,
} from '../lib/api.js';
import { formatInKolkataTime } from '../lib/date.js';
import {
  Flag,
  HelpCircle,
  Clock,
  AlertTriangle,
  Download,
  RefreshCw,
  Eye,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import type { DailyReviewSummary, ChatHistoryItem } from '@housy/shared';

export const DailyReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'all' | 'flagged' | 'unanswered' | 'handoffs' | 'unreached'>('all');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isTranscriptModalOpen, setIsTranscriptModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<DailyReviewSummary>({
    queryKey: ['sales-head-daily-review'],
    queryFn: fetchDailyReviewSummary,
    refetchInterval: 30000,
  });

  const {
    data: transcript,
    isLoading: isTranscriptLoading,
  } = useQuery<ChatHistoryItem[]>({
    queryKey: ['chat-transcript', selectedConversationId],
    queryFn: () => fetchChatHistory(selectedConversationId!),
    enabled: Boolean(selectedConversationId) && isTranscriptModalOpen,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ conversationId, note }: { conversationId: string; note: string }) =>
      reviewFlaggedChat(conversationId, note),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Review Saved',
        message: 'Flagged conversation marked as reviewed.',
      });
      setIsReviewModalOpen(false);
      setReviewNote('');
      queryClient.invalidateQueries({ queryKey: ['sales-head-daily-review'] });
      queryClient.invalidateQueries({ queryKey: ['flagged-chats'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Review Failed',
        message: err.message || 'Could not save review note',
      });
    },
  });

  const dismissQuestionMutation = useMutation({
    mutationFn: (id: string) => resolveUnansweredQuestion(id, 'dismissed'),
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Question Dismissed',
        message: 'Unanswered question dismissed from review queue.',
      });
      queryClient.invalidateQueries({ queryKey: ['sales-head-daily-review'] });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Dismiss Failed',
        message: err.message || 'Could not dismiss question',
      });
    },
  });

  const handleCsvExport = async (): Promise<void> => {
    try {
      setIsExporting(true);
      await downloadDailyReviewCsv();
      showToast({
        type: 'success',
        title: 'CSV Export Downloaded',
        message: 'Daily review queue exported to CSV successfully.',
      });
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Export Failed',
        message: err instanceof Error ? err.message : 'Could not export CSV',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const counts = data?.counts || {
    flaggedChats: 0,
    unansweredQuestions: 0,
    escalatedHandoffs: 0,
    unreachedLeads: 0,
  };

  return (
    <StaffLayout userRole="sales_head">
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Daily Review Queue"
          description="Sales Head morning review cockpit: unreviewed AI flagged conversations, unanswered buyer questions, un-accepted handoff escalations (>15m), and unreached leads breaching the 48h SLA."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleCsvExport}
                disabled={isExporting || isLoading}
                isLoading={isExporting}
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                1-Click CSV Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
              >
                Refresh
              </Button>
            </div>
          }
        />

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="space-y-6" aria-busy="true">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Skeleton height="80px" />
              <Skeleton height="80px" />
              <Skeleton height="80px" />
              <Skeleton height="80px" />
            </div>
            <Skeleton height="300px" />
          </div>
        )}

        {/* Error State */}
        {isError && (
          <ErrorState
            title="Failed to Load Daily Review"
            message={error instanceof Error ? error.message : 'Could not fetch daily review queue.'}
            onRetry={() => refetch()}
          />
        )}

        {/* Content */}
        {!isLoading && !isError && data && (
          <div className="space-y-6">
            {/* Stat Tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Flagged Chats Pending"
                value={counts.flaggedChats}
                icon={
                  <Flag
                    className={`w-4 h-4 ${counts.flaggedChats > 0 ? 'text-warning' : 'text-muted'}`}
                  />
                }
              />
              <StatTile
                label="Unanswered Questions"
                value={counts.unansweredQuestions}
                icon={
                  <HelpCircle
                    className={`w-4 h-4 ${counts.unansweredQuestions > 0 ? 'text-accent' : 'text-muted'}`}
                  />
                }
              />
              <StatTile
                label="Escalated Handoffs (>15m)"
                value={counts.escalatedHandoffs}
                icon={
                  <Clock
                    className={`w-4 h-4 ${counts.escalatedHandoffs > 0 ? 'text-danger' : 'text-muted'}`}
                  />
                }
              />
              <StatTile
                label="Unreached Leads (>48h SLA)"
                value={counts.unreachedLeads}
                icon={
                  <AlertTriangle
                    className={`w-4 h-4 ${counts.unreachedLeads > 0 ? 'text-danger' : 'text-muted'}`}
                  />
                }
              />
            </div>

            {/* Filter Tabs */}
            <Tabs
              activeTab={activeTab}
              onChange={(tab) => setActiveTab(tab as typeof activeTab)}
              tabs={[
                { id: 'all', label: 'All Review Items' },
                { id: 'flagged', label: `Flagged Chats (${counts.flaggedChats})` },
                { id: 'unanswered', label: `Unanswered Q&A (${counts.unansweredQuestions})` },
                { id: 'handoffs', label: `Escalations > 15m (${counts.escalatedHandoffs})` },
                { id: 'unreached', label: `Unreached Leads (${counts.unreachedLeads})` },
              ]}
            />

            {/* Section 1: Flagged Conversations */}
            {(activeTab === 'all' || activeTab === 'flagged') && (
              <section className="space-y-3" aria-labelledby="flagged-chats-heading">
                <div className="flex items-center justify-between">
                  <h2 id="flagged-chats-heading" className="text-base font-semibold text-ink flex items-center gap-2">
                    <Flag className="w-4 h-4 text-warning" />
                    <span>Flagged Conversations Pending Review</span>
                    <Badge variant={data.flaggedChats.length > 0 ? 'warning' : 'neutral'}>
                      {data.flaggedChats.length}
                    </Badge>
                  </h2>
                </div>

                {data.flaggedChats.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-8 h-8 text-success" />}
                    title="No Flagged Conversations"
                    description="All AI assistant chats adhere to safety guidelines and fact-sheet grounding rules."
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.flaggedChats.map((c) => (
                      <Card key={c.id} className="p-4 border-warning/40 flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-ink text-sm block">{c.leadName}</span>
                              <span className="font-mono text-xs text-muted">{c.leadPublicId}</span>
                            </div>
                            <Badge variant="warning">{c.language.toUpperCase()}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {c.flagReasons.map((reason) => (
                              <Badge key={reason} variant="neutral">
                                {reason}
                              </Badge>
                            ))}
                          </div>
                          <div className="text-[11px] text-muted font-mono">
                            Flagged: {formatInKolkataTime(c.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-hairline">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedConversationId(c.id);
                              setIsTranscriptModalOpen(true);
                            }}
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                          >
                            Transcript
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setSelectedConversationId(c.id);
                              setReviewNote('');
                              setIsReviewModalOpen(true);
                            }}
                            leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          >
                            Mark Reviewed
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Section 2: Unanswered Questions */}
            {(activeTab === 'all' || activeTab === 'unanswered') && (
              <section className="space-y-3" aria-labelledby="unanswered-qa-heading">
                <div className="flex items-center justify-between">
                  <h2 id="unanswered-qa-heading" className="text-base font-semibold text-ink flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-accent" />
                    <span>Unanswered Buyer Questions</span>
                    <Badge variant={data.unansweredQuestions.length > 0 ? 'accent' : 'neutral'}>
                      {data.unansweredQuestions.length}
                    </Badge>
                  </h2>
                </div>

                {data.unansweredQuestions.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-8 h-8 text-success" />}
                    title="No Unanswered Questions"
                    description="The AI sales assistant successfully answered all queries using the active project fact sheets."
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.unansweredQuestions.map((q) => (
                      <Card key={q.id} className="p-4 flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="neutral">{q.buyerLanguage.toUpperCase()}</Badge>
                            <span className="text-xs text-muted">
                              {q.projectName || 'General Inquiry'}
                            </span>
                          </div>
                          <p className="font-medium text-ink text-sm leading-snug">
                            "{q.question}"
                          </p>
                          <div className="text-[11px] text-muted font-mono">
                            Received: {formatInKolkataTime(q.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-hairline">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => dismissQuestionMutation.mutate(q.id)}
                            isLoading={
                              dismissQuestionMutation.isPending &&
                              dismissQuestionMutation.variables === q.id
                            }
                          >
                            Dismiss
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => navigate('/fact-sheet')}
                            rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
                          >
                            Open in Fact Editor
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Section 3: Escalated Handoffs (>15m) */}
            {(activeTab === 'all' || activeTab === 'handoffs') && (
              <section className="space-y-3" aria-labelledby="escalations-heading">
                <div className="flex items-center justify-between">
                  <h2 id="escalations-heading" className="text-base font-semibold text-ink flex items-center gap-2">
                    <Clock className="w-4 h-4 text-danger" />
                    <span>Un-accepted Handoffs Past 15 Min (Escalated)</span>
                    <Badge variant={data.escalatedHandoffs.length > 0 ? 'danger' : 'neutral'}>
                      {data.escalatedHandoffs.length}
                    </Badge>
                  </h2>
                </div>

                {data.escalatedHandoffs.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-8 h-8 text-success" />}
                    title="No Escalated Handoffs"
                    description="All AI conversation handoffs are being accepted by executives within the 15-minute SLA."
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.escalatedHandoffs.map((h) => (
                      <Card key={h.id} className="p-4 border-danger/30 flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink text-sm">{h.leadName}</span>
                            <Badge variant="danger">{h.minutesWaiting} mins waiting</Badge>
                          </div>
                          <p className="text-xs text-muted">
                            Reason: <strong className="text-ink font-medium">{h.reason}</strong>
                          </p>
                          <div className="text-xs text-muted">
                            Assigned To: <span className="text-ink font-medium">{h.executiveName || 'Unassigned'}</span>
                          </div>
                          <div className="text-[11px] text-muted font-mono">
                            Transferred: {formatInKolkataTime(h.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-hairline">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLeadId(h.leadId)}
                          >
                            View Lead Details
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate('/handoffs')}
                            rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
                          >
                            Manage in Handoffs
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Section 4: Unreached Leads (>48h SLA) */}
            {(activeTab === 'all' || activeTab === 'unreached') && (
              <section className="space-y-3" aria-labelledby="unreached-leads-heading">
                <div className="flex items-center justify-between">
                  <h2 id="unreached-leads-heading" className="text-base font-semibold text-ink flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-danger" />
                    <span>Unreached Leads Breaching 48h SLA</span>
                    <Badge variant={data.unreachedLeads.length > 0 ? 'danger' : 'neutral'}>
                      {data.unreachedLeads.length}
                    </Badge>
                  </h2>
                </div>

                {data.unreachedLeads.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 className="w-8 h-8 text-success" />}
                    title="Zero Unreached Leads"
                    description="All contactable incoming inquiries have received timely outreach within the 48-hour SLA."
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.unreachedLeads.map((l) => (
                      <Card key={l.id} className="p-4 border-danger/30 flex flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-ink text-sm block">{l.name}</span>
                              <span className="font-mono text-xs text-muted">{l.publicId}</span>
                            </div>
                            <Badge variant="danger">{l.daysBreached} days overdue</Badge>
                          </div>
                          <div className="text-xs text-muted space-y-1">
                            <div>Source: <span className="text-ink font-medium capitalize">{l.source.replace('_', ' ')}</span></div>
                            <div>Project: <span className="text-ink font-medium">{l.projectName || 'Unassigned'}</span></div>
                            <div className="font-mono text-xs">{l.phoneE164 || 'No phone recorded'}</div>
                          </div>
                        </div>
                        <div className="flex justify-end pt-2 border-t border-hairline">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setSelectedLeadId(l.id)}
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                          >
                            Open Lead Drawer
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {/* Flagged Chat Review Note Modal */}
      <Modal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        title="Mark Flagged Chat as Reviewed"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Add a supervisory review note before clearing this flagged conversation from the active queue.
          </p>
          <Textarea
            label="Supervisory Review Note"
            placeholder="e.g. Verified price negotiation handled appropriately; fact sheet grounding confirmed."
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2 pt-3 border-t border-hairline">
            <Button variant="ghost" onClick={() => setIsReviewModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!reviewNote.trim()}
              onClick={() => {
                if (selectedConversationId && reviewNote.trim()) {
                  reviewMutation.mutate({
                    conversationId: selectedConversationId,
                    note: reviewNote.trim(),
                  });
                }
              }}
              isLoading={reviewMutation.isPending}
            >
              Confirm Review
            </Button>
          </div>
        </div>
      </Modal>

      {/* Transcript Modal */}
      <Modal
        isOpen={isTranscriptModalOpen}
        onClose={() => {
          setIsTranscriptModalOpen(false);
          setSelectedConversationId(null);
        }}
        title="Conversation Transcript"
        maxWidth="lg"
      >
        <div className="space-y-4">
          {isTranscriptLoading && (
            <div className="space-y-2 py-4" aria-busy="true">
              <Skeleton height="40px" />
              <Skeleton height="40px" />
              <Skeleton height="40px" />
            </div>
          )}

          {!isTranscriptLoading && transcript && transcript.length === 0 && (
            <p className="text-xs text-muted text-center py-4">No messages recorded in this conversation.</p>
          )}

          {!isTranscriptLoading && transcript && transcript.length > 0 && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              {transcript.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-lg text-xs space-y-1 ${
                    msg.role === 'buyer'
                      ? 'bg-surface-alt border border-hairline mr-8'
                      : msg.role === 'executive'
                        ? 'bg-accent/10 border border-accent/20 ml-8'
                        : 'bg-surface border border-hairline ml-8'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <strong className="text-ink font-semibold capitalize">
                      {msg.role === 'buyer' ? 'Buyer' : msg.role === 'executive' ? 'Sales Executive' : 'AI Assistant'}
                    </strong>
                    <span>{formatInKolkataTime(msg.createdAt)}</span>
                  </div>
                  <p className="text-ink leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-hairline">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsTranscriptModalOpen(false);
                setSelectedConversationId(null);
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Lead Detail Drawer */}
      <LeadDetailDrawer
        leadId={selectedLeadId}
        isOpen={Boolean(selectedLeadId)}
        onClose={() => setSelectedLeadId(null)}
        onLeadUpdated={() => refetch()}
      />
    </StaffLayout>
  );
};
