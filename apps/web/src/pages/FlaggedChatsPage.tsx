import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/Button.js';
import { Badge } from '../components/Badge.js';
import { Card } from '../components/Card.js';
import { Modal } from '../components/Modal.js';
import { Textarea } from '../components/Textarea.js';
import { Skeleton } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { useToast } from '../components/Toast.js';
import {
  fetchFlaggedChats,
  reviewFlaggedChat,
  fetchChatHistory,
} from '../lib/api.js';
import { formatInKolkataTime } from '../lib/date.js';
import {
  CheckCircle2,
  AlertTriangle,
  FileText,
  Eye,
} from 'lucide-react';
import type { FlaggedConversationItem, ChatHistoryItem } from '@housy/shared';

export const FlaggedChatsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<FlaggedConversationItem | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  // Fetch flagged chats list
  const {
    data: flaggedData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['flagged-chats', unreviewedOnly],
    queryFn: () => fetchFlaggedChats(unreviewedOnly),
  });

  // Fetch transcript for modal
  const {
    data: transcript,
    isLoading: isTranscriptLoading,
    error: transcriptError,
  } = useQuery({
    queryKey: ['chat-history', selectedConversation?.id],
    queryFn: () => fetchChatHistory(selectedConversation!.id),
    enabled: isTranscriptOpen && !!selectedConversation?.id,
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: ({ conversationId, note }: { conversationId: string; note: string }) =>
      reviewFlaggedChat(conversationId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flagged-chats'] });
      setIsReviewModalOpen(false);
      setReviewNote('');
      showToast({
        type: 'success',
        title: 'Review Saved',
        message: 'The flagged chat has been marked as reviewed with your note.',
      });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Review Failed',
        message: err.message || 'Unable to submit review note',
      });
    },
  });

  const chats = flaggedData?.data || [];
  const unreviewedCount = flaggedData?.unreviewedCount ?? 0;

  return (
    <StaffLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Flagged Chat Daily Review Queue"
          description="Sales Head review workflow for AI conversations flagged by pre-filters, missing facts, price inquiries, or prompt anomalies."
        />

        {/* Daily Review Queue Banner */}
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            unreviewedCount > 0
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-900'
              : 'bg-accent/10 border-accent/20 text-ink'
          }`}
        >
          <div className="flex items-center gap-3">
            {unreviewedCount > 0 ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0" />
            )}
            <div>
              <h2 className="font-semibold text-sm">
                {unreviewedCount > 0
                  ? `${unreviewedCount} flagged chats to review today`
                  : 'All flagged chats have been reviewed!'}
              </h2>
              <p className="text-xs opacity-90">
                {unreviewedCount > 0
                  ? 'Verify model citations, resolve missing facts, or validate policy responses.'
                  : 'No pending flagged conversations awaiting review.'}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unreviewedOnly}
              onChange={(e) => setUnreviewedOnly(e.target.checked)}
              className="rounded border-hairline text-accent focus:ring-accent"
            />
            Show unreviewed only
          </label>
        </div>

        {/* State 1: Loading state */}
        {isLoading && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading flagged chats">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton variant="text" width="180px" height="24px" />
                  <Skeleton variant="text" width="80px" height="20px" />
                </div>
                <Skeleton variant="rectangular" width="100%" height="60px" className="rounded-lg" />
              </Card>
            ))}
          </div>
        )}

        {/* State 2: Error state */}
        {isError && (
          <ErrorState
            title="Unable to load flagged chats"
            message={error instanceof Error ? error.message : 'Please check your connection and retry.'}
            onRetry={() => refetch()}
          />
        )}

        {/* State 3: Empty state */}
        {!isLoading && !isError && chats.length === 0 && (
          <EmptyState
            title="No flagged chats found"
            description={
              unreviewedOnly
                ? 'All flagged conversations have been marked as reviewed.'
                : 'No conversations have triggered security or safety flags.'
            }
            action={{
              label: 'Refresh Queue',
              onClick: () => refetch(),
            }}
          />
        )}

        {/* Flagged Chats List */}
        {!isLoading && !isError && chats.length > 0 && (
          <div className="space-y-4">
            {chats.map((item) => {
              const isReviewed = Boolean(item.reviewedBy);

              return (
                <Card key={item.id} className="p-5 space-y-4 hover:border-muted/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-ink text-base">{item.leadName}</h3>
                        <span className="text-xs font-mono text-muted">({item.leadPublicId})</span>
                        {item.flagReasons.map((reason) => (
                          <Badge key={reason} variant="warning" className="text-xs">
                            {reason}
                          </Badge>
                        ))}
                        {isReviewed ? (
                          <Badge variant="accent" className="text-xs">
                            Reviewed
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="text-xs text-amber-700 bg-amber-100">
                            Pending Review
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-1">
                        Channel: Web Chat • Source: {item.source} • Started {formatInKolkataTime(item.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedConversation(item);
                          setIsTranscriptOpen(true);
                        }}
                        leftIcon={<Eye className="w-4 h-4" />}
                      >
                        View Transcript
                      </Button>
                      {!isReviewed ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setSelectedConversation(item);
                            setReviewNote('');
                            setIsReviewModalOpen(true);
                          }}
                          leftIcon={<CheckCircle2 className="w-4 h-4" />}
                        >
                          Mark Reviewed
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedConversation(item);
                            setReviewNote(item.reviewNote || '');
                            setIsReviewModalOpen(true);
                          }}
                        >
                          Edit Note
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Navigate to fact sheet editor to add fact from flagged query
                          navigate('/fact-sheet');
                        }}
                        leftIcon={<FileText className="w-4 h-4 text-accent" />}
                      >
                        Convert to Fact
                      </Button>
                    </div>
                  </div>

                  {/* Review Note Display if already reviewed */}
                  {isReviewed && item.reviewNote && (
                    <div className="p-3 bg-surface rounded-lg border border-hairline text-xs space-y-1">
                      <div className="flex items-center justify-between text-muted">
                        <span>Reviewed by: <strong className="text-ink">{item.reviewedByName || 'Sales Head'}</strong></span>
                        <span>{item.reviewedAt ? formatInKolkataTime(item.reviewedAt) : ''}</span>
                      </div>
                      <p className="text-ink font-medium">{item.reviewNote}</p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Transcript Viewer Modal */}
        <Modal
          isOpen={isTranscriptOpen}
          onClose={() => setIsTranscriptOpen(false)}
          title={`Transcript & Citations: ${selectedConversation?.leadName || ''}`}
          description={`Flag Reasons: ${selectedConversation?.flagReasons.join(', ') || ''}`}
          maxWidth="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsTranscriptOpen(false);
                  navigate('/fact-sheet');
                }}
                leftIcon={<FileText className="w-4 h-4 text-accent" />}
              >
                Open Fact Sheet Editor
              </Button>
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
              </div>
            )}

            {transcriptError && (
              <p className="text-sm text-danger">
                {transcriptError instanceof Error ? transcriptError.message : 'Unable to load transcript.'}
              </p>
            )}

            {transcript &&
              transcript.map((msg: ChatHistoryItem) => {
                const citedFacts = msg.citedFactIds;

                return (
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
                        {msg.role === 'buyer' ? selectedConversation?.leadName || 'Buyer' : 'AI Assistant'}
                      </span>
                      <span>{formatInKolkataTime(msg.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-ink">{msg.content}</p>

                    {citedFacts && citedFacts.length > 0 && (
                      <div className="mt-2 pt-1 border-t border-hairline/60 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-muted">Cited Facts:</span>
                        {citedFacts.map((fid) => (
                          <span
                            key={fid}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-surface border border-hairline font-mono font-medium text-accent"
                          >
                            [{fid}]
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </Modal>

        {/* Review Dialog Modal */}
        <Modal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          title="Submit Flagged Chat Review"
          description={`Record notes for sales audit: ${selectedConversation?.leadName || ''}`}
          maxWidth="md"
          footer={
            <div className="flex items-center justify-end gap-3 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReviewModalOpen(false)}
                disabled={reviewMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (selectedConversation && reviewNote.trim()) {
                    reviewMutation.mutate({
                      conversationId: selectedConversation.id,
                      note: reviewNote.trim(),
                    });
                  }
                }}
                disabled={!reviewNote.trim() || reviewMutation.isPending}
                isLoading={reviewMutation.isPending}
              >
                Save Review
              </Button>
            </div>
          }
        >
          <div className="py-2 space-y-3">
            <label className="text-xs text-muted block">
              Enter review audit notes (e.g. explained price policy, confirmed missing fact added, verified no hallucination):
            </label>
            <Textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="e.g. Reviewed pricing inquiry; assistant correctly deferred discount negotiation to sales team."
              rows={4}
              maxLength={1000}
            />
          </div>
        </Modal>
      </div>
    </StaffLayout>
  );
};

export default FlaggedChatsPage;
