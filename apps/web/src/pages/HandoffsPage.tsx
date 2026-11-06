import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/Button.js';
import { Badge } from '../components/Badge.js';
import { Card } from '../components/Card.js';
import { Modal } from '../components/Modal.js';
import { Skeleton } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { useToast } from '../components/Toast.js';
import {
  fetchHandoffs,
  fetchHandoffTranscript,
  acceptHandoff,
  postHandoffMessage,
} from '../lib/api.js';
import { formatInKolkataTime } from '../lib/date.js';
import {
  UserCheck,
  Phone,
  MessageSquare,
  Send,
  Eye,
  Calendar,
} from 'lucide-react';
import type { HandoffItem, HandoffStatus, ChatHistoryItem } from '@housy/shared';

export const HandoffsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<HandoffStatus | 'all'>('all');
  const [selectedHandoff, setSelectedHandoff] = useState<HandoffItem | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');

  // Fetch handoffs list
  const {
    data: handoffsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['handoffs', statusFilter],
    queryFn: () =>
      fetchHandoffs({
        status: statusFilter === 'all' ? undefined : statusFilter,
      }),
  });

  // Fetch transcript for selected handoff
  const {
    data: transcript,
    isLoading: isTranscriptLoading,
    error: transcriptError,
  } = useQuery({
    queryKey: ['handoff-transcript', selectedHandoff?.id],
    queryFn: () => fetchHandoffTranscript(selectedHandoff!.id),
    enabled: isTranscriptOpen && !!selectedHandoff?.id,
  });

  // Accept handoff mutation
  const acceptMutation = useMutation({
    mutationFn: (handoffId: string) => acceptHandoff(handoffId),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['handoffs'] });
      if (selectedHandoff?.id === updated.id) {
        setSelectedHandoff(updated);
      }
      showToast({
        type: 'success',
        title: 'Handoff Accepted',
        message: `You have taken ownership of lead ${updated.leadName}.`,
      });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Accept Failed',
        message: err.message || 'Unable to accept handoff',
      });
    },
  });

  // Post message mutation
  const postMessageMutation = useMutation({
    mutationFn: ({ handoffId, message }: { handoffId: string; message: string }) =>
      postHandoffMessage(handoffId, message),
    onSuccess: () => {
      setReplyMessage('');
      queryClient.invalidateQueries({ queryKey: ['handoff-transcript', selectedHandoff?.id] });
      showToast({
        type: 'success',
        title: 'Message Sent',
        message: 'Your message has been posted. AI assistant is paused for this lead.',
      });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Send Failed',
        message: err.message || 'Unable to post message',
      });
    },
  });

  const handoffs = handoffsData?.data || [];

  return (
    <StaffLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Executive Inbox"
          description="Manage buyer handoffs, view AI-generated consultation summaries, and take over live conversations."
        />

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-hairline pb-3 overflow-x-auto">
          {(['all', 'new', 'accepted', 'done'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                statusFilter === status
                  ? 'bg-ink text-white'
                  : 'text-muted hover:text-ink hover:bg-surface'
              }`}
            >
              {status === 'all' ? 'All Handoffs' : `${status} Leads`}
            </button>
          ))}
        </div>

        {/* State 1: Loading state */}
        {isLoading && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading handoffs">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton variant="text" width="180px" height="24px" />
                  <Skeleton variant="text" width="80px" height="20px" />
                </div>
                <Skeleton variant="rectangular" width="100%" height="80px" className="rounded-lg" />
                <div className="flex gap-2">
                  <Skeleton variant="rectangular" width="120px" height="36px" className="rounded-lg" />
                  <Skeleton variant="rectangular" width="120px" height="36px" className="rounded-lg" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* State 2: Error state */}
        {isError && (
          <ErrorState
            title="Unable to load handoffs"
            message={error instanceof Error ? error.message : 'Please check your connection and retry.'}
            onRetry={() => refetch()}
          />
        )}

        {/* State 3: Empty state */}
        {!isLoading && !isError && handoffs.length === 0 && (
          <EmptyState
            title="No handoffs found"
            description={
              statusFilter === 'all'
                ? 'No buyer handoffs have been assigned to your inbox yet.'
                : `No handoffs currently in "${statusFilter}" status.`
            }
            action={{
              label: 'Refresh Inbox',
              onClick: () => refetch(),
            }}
          />
        )}

        {/* Handoff List */}
        {!isLoading && !isError && handoffs.length > 0 && (
          <div className="space-y-5">
            {handoffs.map((handoff) => {
              const summary = handoff.summary;
              const isNew = handoff.status === 'new';
              const cleanPhone = handoff.leadPhone?.replace(/\D/g, '') || '';
              const telUrl = handoff.leadPhone ? `tel:${handoff.leadPhone}` : null;
              const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;

              return (
                <Card key={handoff.id} className="p-6 space-y-5 hover:border-muted/50 transition-colors">
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg text-ink">{handoff.leadName}</h3>
                        <span className="text-xs font-mono text-muted">({handoff.leadPublicId})</span>
                        <Badge
                          variant={
                            handoff.status === 'new'
                              ? 'warning'
                              : handoff.status === 'accepted'
                              ? 'accent'
                              : 'neutral'
                          }
                          className="capitalize text-xs"
                        >
                          {handoff.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted mt-1 flex items-center gap-2">
                        <span>Reason: <strong className="text-ink">{handoff.reason}</strong></span>
                        <span>•</span>
                        <span>Assigned to: <strong className="text-ink">{handoff.executiveName}</strong></span>
                        <span>•</span>
                        <span>Received {formatInKolkataTime(handoff.createdAt)}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {isNew && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => acceptMutation.mutate(handoff.id)}
                          isLoading={acceptMutation.isPending && acceptMutation.variables === handoff.id}
                          leftIcon={<UserCheck className="w-4 h-4" />}
                        >
                          Accept Handoff
                        </Button>
                      )}
                      {telUrl && (
                        <a
                          href={telUrl}
                          className="inline-flex items-center justify-center font-medium rounded-xl transition-colors min-h-[44px] px-3 py-2 text-xs gap-1.5 border border-hairline text-ink hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <Phone className="w-4 h-4" />
                          <span>Call</span>
                        </a>
                      )}
                      {waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center font-medium rounded-xl transition-colors min-h-[44px] px-3 py-2 text-xs gap-1.5 border border-hairline text-ink hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <MessageSquare className="w-4 h-4 text-emerald-600" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedHandoff(handoff);
                          setIsTranscriptOpen(true);
                        }}
                        leftIcon={<Eye className="w-4 h-4" />}
                        data-testid="view-transcript-btn"
                      >
                        Transcript
                      </Button>
                    </div>
                  </div>

                  {/* Summary Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-surface/60 p-4 rounded-xl border border-hairline">
                    <div className="space-y-2">
                      <div>
                        <span className="text-muted block">Project & Requirement</span>
                        <strong className="text-ink text-sm font-medium">
                          {summary?.project || 'General Inquiry'} • {summary?.wants || 'Not specified'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-muted block">Budget Range</span>
                        <span className="text-ink font-medium">{summary?.budgetRange || 'Not disclosed'}</span>
                      </div>
                      <div>
                        <span className="text-muted block">Timeline</span>
                        <span className="text-ink font-medium">{summary?.timeline || 'Immediate'}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <span className="text-muted block">Buyer Sentiment</span>
                        <Badge
                          variant={
                            summary?.sentiment === 'positive' || summary?.sentiment === 'urgent'
                              ? 'accent'
                              : 'neutral'
                          }
                          className="capitalize text-xs mt-0.5"
                        >
                          {summary?.sentiment || 'Neutral'}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted block">Confirmed Site Visit</span>
                        <span className="text-ink font-medium flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-accent" />
                          {summary?.visitTime || 'No scheduled visit'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted block">Preferred Language</span>
                        <span className="text-ink uppercase font-mono font-medium">
                          {summary?.language || 'en'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <span className="text-muted block">Open / Unanswered Questions</span>
                        {summary?.openQuestions && summary.openQuestions.length > 0 ? (
                          <ul className="list-disc list-inside text-amber-700 space-y-0.5 mt-0.5">
                            {summary.openQuestions.map((q, idx) => (
                              <li key={idx} className="line-clamp-1">{q}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted italic">None recorded</span>
                        )}
                      </div>
                      <div>
                        <span className="text-muted block">Key Inquiries</span>
                        {summary?.keyQuestionsAsked && summary.keyQuestionsAsked.length > 0 ? (
                          <ul className="list-disc list-inside text-ink/80 space-y-0.5 mt-0.5">
                            {summary.keyQuestionsAsked.slice(0, 2).map((q, idx) => (
                              <li key={idx} className="line-clamp-1">{q}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted italic">General overview</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Inline Reply Box to take over conversation */}
                  <div className="pt-2 flex flex-col sm:flex-row items-end gap-3">
                    <div className="flex-1 w-full">
                      <label className="text-xs text-muted block mb-1">
                        Reply directly as sales executive (pauses AI assistant and sets conversation to human mode):
                      </label>
                      <input
                        type="text"
                        value={selectedHandoff?.id === handoff.id ? replyMessage : ''}
                        onChange={(e) => {
                          setSelectedHandoff(handoff);
                          setReplyMessage(e.target.value);
                        }}
                        placeholder={`Message ${handoff.leadName}...`}
                        className="w-full px-3 py-2 text-sm bg-background border border-hairline rounded-lg focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        if (replyMessage.trim()) {
                          postMessageMutation.mutate({
                            handoffId: handoff.id,
                            message: replyMessage.trim(),
                          });
                        }
                      }}
                      disabled={!replyMessage.trim() || selectedHandoff?.id !== handoff.id || postMessageMutation.isPending}
                      isLoading={postMessageMutation.isPending && selectedHandoff?.id === handoff.id}
                      leftIcon={<Send className="w-4 h-4" />}
                    >
                      Send Reply
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Transcript Viewer Modal */}
        <Modal
          isOpen={isTranscriptOpen}
          onClose={() => setIsTranscriptOpen(false)}
          title={`Conversation Transcript: ${selectedHandoff?.leadName || ''}`}
          description={`Lead ID: ${selectedHandoff?.leadPublicId || ''} • Channel: Web Chat`}
          maxWidth="lg"
          data-testid="transcript-modal"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-muted">
                Status: {selectedHandoff?.status} • Executive: {selectedHandoff?.executiveName}
              </span>
              <Button variant="outline" size="sm" onClick={() => setIsTranscriptOpen(false)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="py-2 space-y-3 max-h-[60vh] overflow-y-auto">
            {isTranscriptLoading && (
              <div className="space-y-3">
                <Skeleton variant="text" width="60%" height="32px" />
                <Skeleton variant="text" width="70%" height="32px" />
                <Skeleton variant="text" width="50%" height="32px" />
              </div>
            )}

            {transcriptError && (
              <p className="text-sm text-danger">
                {transcriptError instanceof Error ? transcriptError.message : 'Unable to load transcript.'}
              </p>
            )}

            {transcript && transcript.length === 0 && (
              <p className="text-sm text-muted italic">No messages recorded in this conversation.</p>
            )}

            {transcript &&
              transcript.map((msg: ChatHistoryItem) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-xl text-sm ${
                    msg.role === 'buyer'
                      ? 'bg-surface border border-hairline ml-8'
                      : 'bg-accent/10 border border-accent/20 mr-8'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span className="font-semibold capitalize text-ink">
                      {msg.role === 'buyer' ? selectedHandoff?.leadName || 'Buyer' : 'AI / Staff'}
                    </span>
                    <span>{formatInKolkataTime(msg.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-ink">{msg.content}</p>
                </div>
              ))}
          </div>
        </Modal>
      </div>
    </StaffLayout>
  );
};

export default HandoffsPage;
