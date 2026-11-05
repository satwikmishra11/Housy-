import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { Select } from '../components/Select.js';
import { Input } from '../components/Input.js';
import { useToast } from '../components/Toast.js';
import {
  simulateDemoLead,
  runDemoReminders,
  fastForwardDemoReminders,
} from '../lib/api.js';
import {
  Sparkles,
  FastForward,
  PlayCircle,
  UserPlus,
} from 'lucide-react';
import type { LeadSource } from '@housy/shared';

export const DemoPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [selectedSource, setSelectedSource] = useState<LeadSource>('social_ad');
  const [leadName, setLeadName] = useState('Pooja Shah');
  const [leadPhone, setLeadPhone] = useState('+919825312345');
  const [leadWants, setLeadWants] = useState('3 BHK Luxury');

  // Simulate Lead Mutation
  const simulateLeadMutation = useMutation({
    mutationFn: () =>
      simulateDemoLead({
        source: selectedSource,
        name: leadName.trim() || undefined,
        phone: leadPhone.trim() || undefined,
        wants: leadWants.trim() || undefined,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['handoffs'] });
      showToast({
        type: 'success',
        title: 'Lead Simulated',
        message: `Simulated lead from source: ${selectedSource} (${data.simulatedLead.name})`,
      });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Simulation Failed',
        message: err.message || 'Unable to simulate lead',
      });
    },
  });

  // Fast-Forward Reminders Mutation
  const fastForwardMutation = useMutation({
    mutationFn: () => fastForwardDemoReminders(),
    onSuccess: (data) => {
      showToast({
        type: 'info',
        title: 'Reminders Fast-Forwarded',
        message: `${data.fastForwardedCount} scheduled reminders shifted into past due range.`,
      });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Fast-Forward Failed',
        message: err.message || 'Unable to fast-forward reminders',
      });
    },
  });

  // Run Reminders Worker Mutation
  const runRemindersMutation = useMutation({
    mutationFn: () => runDemoReminders(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['outbox'] });
      showToast({
        type: 'success',
        title: 'Worker Executed',
        message: `Processed: ${data.outcome.processedCount}, Sent: ${data.outcome.sentCount}, Failed: ${data.outcome.failedCount}`,
      });
    },
    onError: (err: Error) => {
      showToast({
        type: 'error',
        title: 'Worker Execution Failed',
        message: err.message || 'Unable to trigger reminder worker',
      });
    },
  });

  return (
    <StaffLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="Demo Controls & Simulation"
          description="Interactive controls for stakeholder evaluations: simulate multi-source lead ingest, fast-forward reminder schedules, and trigger worker loops instantly."
        />

        {/* Demo Mode Notice */}
        <div className="p-4 bg-accent/10 border border-accent/20 rounded-xl flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <h2 className="font-semibold text-ink text-sm">Demo Mode Active</h2>
            <p className="text-muted">
              These controls are available in staging/evaluation environments to simulate live buyer traffic,
              time advancement, and channel dispatch without waiting for real cron triggers or 24h intervals.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Simulate Ingest per Source */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-hairline pb-3">
              <UserPlus className="w-5 h-5 text-accent" />
              <div>
                <h3 className="font-semibold text-ink text-base">Simulate Ingested Lead</h3>
                <p className="text-xs text-muted">Test attribution tagging and deduplication per source</p>
              </div>
            </div>

            <div className="space-y-3">
              <Select
                label="Attribution Source"
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value as LeadSource)}
                options={[
                  { value: 'social_ad', label: 'Social Ad (Meta / Instagram)' },
                  { value: 'portal_housing', label: 'Property Portal: Housing.com' },
                  { value: 'portal_99acres', label: 'Property Portal: 99acres' },
                  { value: 'portal_magicbricks', label: 'Property Portal: MagicBricks' },
                  { value: 'qr_outdoor', label: 'Outdoor Hoarding QR Code' },
                  { value: 'qr_print', label: 'Print Brochure / Newspaper QR' },
                  { value: 'hoarding_call', label: 'Hoarding Phone Inbound Call' },
                  { value: 'website', label: 'Developer Website Landing Page' },
                  { value: 'walk_in', label: 'Sales Gallery Walk-In' },
                ]}
              />

              <Input
                label="Lead Name"
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                placeholder="e.g. Pooja Shah"
              />

              <Input
                label="Mobile Phone (+91 E.164)"
                value={leadPhone}
                onChange={(e) => setLeadPhone(e.target.value)}
                placeholder="+919825312345"
              />

              <Input
                label="Wants / Requirements"
                value={leadWants}
                onChange={(e) => setLeadWants(e.target.value)}
                placeholder="e.g. 3 BHK Luxury"
              />

              <Button
                variant="primary"
                className="w-full justify-center mt-2"
                onClick={() => simulateLeadMutation.mutate()}
                isLoading={simulateLeadMutation.isPending}
                leftIcon={<UserPlus className="w-4 h-4" />}
              >
                Simulate Ingestion
              </Button>
            </div>
          </Card>

          {/* Card 2: Reminders & Fast-Forward Controls */}
          <div className="space-y-6">
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-hairline pb-3">
                <FastForward className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="font-semibold text-ink text-base">Fast-Forward Reminders</h3>
                  <p className="text-xs text-muted">Advance reminder clock to simulate passage of 24h/2h</p>
                </div>
              </div>

              <p className="text-xs text-muted leading-relaxed">
                Shifts all pending reminders into the past (NOW - 5 minutes), allowing the worker to immediately
                claim and process them without waiting for wall-clock scheduled time.
              </p>

              <Button
                variant="outline"
                className="w-full justify-center"
                onClick={() => fastForwardMutation.mutate()}
                isLoading={fastForwardMutation.isPending}
                leftIcon={<FastForward className="w-4 h-4 text-amber-600" />}
              >
                Fast-Forward Pending Reminders
              </Button>
            </Card>

            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-hairline pb-3">
                <PlayCircle className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-semibold text-ink text-base">Run Reminder Worker</h3>
                  <p className="text-xs text-muted">Execute background dispatch job on demand</p>
                </div>
              </div>

              <p className="text-xs text-muted leading-relaxed">
                Immediately claims due reminders with <code>SELECT ... FOR UPDATE SKIP LOCKED</code>, verifies DPDP
                consent and confirmed booking status, and dispatches via the Outbox adapter.
              </p>

              <Button
                variant="primary"
                className="w-full justify-center"
                onClick={() => runRemindersMutation.mutate()}
                isLoading={runRemindersMutation.isPending}
                leftIcon={<PlayCircle className="w-4 h-4" />}
              >
                Process Due Reminders Now
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </StaffLayout>
  );
};

export default DemoPage;
