import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/Button.js';
import { Badge } from '../components/Badge.js';
import { Card } from '../components/Card.js';
import { Skeleton } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { Select } from '../components/Select.js';
import { fetchOutbox } from '../lib/api.js';
import { formatInKolkataTime } from '../lib/date.js';
import {
  Send,
  MessageSquare,
  Mail,
  Smartphone,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { OutboundMessageItem } from '@housy/shared';

export const OutboxPage: React.FC = () => {
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const {
    data: outboxData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['outbox', channelFilter, statusFilter, page],
    queryFn: () =>
      fetchOutbox({
        channel: channelFilter !== 'all' ? channelFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page,
        limit: 20,
      }),
  });

  const messages = outboxData?.data || [];
  const totalCount = outboxData?.totalCount ?? 0;

  const renderChannelIcon = (channel: string) => {
    switch (channel) {
      case 'whatsapp':
        return <MessageSquare className="w-4 h-4 text-emerald-600" />;
      case 'sms':
        return <Smartphone className="w-4 h-4 text-sky-600" />;
      case 'email':
        return <Mail className="w-4 h-4 text-indigo-600" />;
      default:
        return <Send className="w-4 h-4 text-muted" />;
    }
  };

  return (
    <StaffLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Outbound Message Log"
          description="Auditable log of outgoing WhatsApp, SMS, and Email messages rendered from approved templates with RERA registration numbers."
          actions={
            <Button variant="outline" size="sm" onClick={() => refetch()} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Refresh Outbox
            </Button>
          }
        />

        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-hairline pb-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-44">
              <Select
                label="Channel"
                value={channelFilter}
                onChange={(e) => {
                  setChannelFilter(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Channels' },
                  { value: 'whatsapp', label: 'WhatsApp Only' },
                  { value: 'sms', label: 'SMS Only' },
                  { value: 'email', label: 'Email Only' },
                ]}
              />
            </div>

            <div className="w-44">
              <Select
                label="Status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'sent', label: 'Sent / Dispatched' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'failed', label: 'Failed' },
                ]}
              />
            </div>
          </div>

          <div className="text-xs text-muted flex items-center gap-1.5 self-end sm:self-center">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <span>DPDP consent verified prior to send</span>
          </div>
        </div>

        {/* State 1: Loading state */}
        {isLoading && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading outbox messages">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton variant="text" width="200px" height="20px" />
                  <Skeleton variant="text" width="70px" height="20px" />
                </div>
                <Skeleton variant="rectangular" width="100%" height="45px" className="rounded-lg" />
              </Card>
            ))}
          </div>
        )}

        {/* State 2: Error state */}
        {isError && (
          <ErrorState
            title="Unable to load outbox"
            message={error instanceof Error ? error.message : 'Please check connection and retry.'}
            onRetry={() => refetch()}
          />
        )}

        {/* State 3: Empty state */}
        {!isLoading && !isError && messages.length === 0 && (
          <EmptyState
            title="Outbox is empty"
            message={
              channelFilter !== 'all' || statusFilter !== 'all'
                ? 'No outbound messages match the selected filters.'
                : 'No automated reminders or confirmation messages have been generated yet.'
            }
            actionLabel="Refresh Outbox"
            onAction={() => refetch()}
          />
        )}

        {/* Outbound Messages List */}
        {!isLoading && !isError && messages.length > 0 && (
          <div className="space-y-4">
            {messages.map((item) => {
              const hasRera = item.body.includes('PR/GJ/AHMEDABAD/AUDA/RAA01234/011126');

              return (
                <Card key={item.id} className="p-5 space-y-3 hover:border-muted/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1.5 font-medium text-ink text-sm">
                        {renderChannelIcon(item.channel)}
                        <span className="capitalize">{item.channel}</span>
                      </span>
                      <span className="text-muted">•</span>
                      <strong className="text-ink text-sm">{item.leadName}</strong>
                      <span className="text-xs font-mono text-muted">({item.leadPhone || item.leadPublicId})</span>
                      <span className="text-muted">•</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-surface border border-hairline font-mono text-muted">
                        {item.templateKey}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          item.status === 'sent'
                            ? 'accent'
                            : item.status === 'failed'
                            ? 'neutral'
                            : 'amber'
                        }
                        className="text-xs capitalize"
                      >
                        {item.status}
                      </Badge>
                      <span className="text-xs text-muted">
                        {formatInKolkataTime(item.sentAt || item.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Body text with RERA callout */}
                  <div className="p-3.5 bg-surface/70 rounded-xl border border-hairline text-xs font-sans text-ink leading-relaxed whitespace-pre-wrap">
                    {item.body}
                  </div>

                  {hasRera && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                      <span>RERA registration number present (PR/GJ/AHMEDABAD/AUDA/RAA01234/011126)</span>
                    </div>
                  )}

                  {item.errorMessage && (
                    <p className="text-xs text-danger flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Dispatch failed: {item.errorMessage}</span>
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </StaffLayout>
  );
};

export default OutboxPage;
