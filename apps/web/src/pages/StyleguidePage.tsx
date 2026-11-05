import React, { useState } from 'react';
import { StaffLayout } from '../layouts/StaffLayout.js';
import { BuyerLayout } from '../layouts/BuyerLayout.js';
import { Button } from '../components/Button.js';
import { Input } from '../components/Input.js';
import { Select } from '../components/Select.js';
import { Textarea } from '../components/Textarea.js';
import { Checkbox } from '../components/Checkbox.js';
import { Card } from '../components/Card.js';
import { Badge } from '../components/Badge.js';
import { Tabs } from '../components/Tabs.js';
import { Modal } from '../components/Modal.js';
import { useToast, ToastProvider } from '../components/Toast.js';
import { Skeleton } from '../components/Skeleton.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorState } from '../components/ErrorState.js';
import { StatTile } from '../components/StatTile.js';
import { ChatBubble } from '../components/ChatBubble.js';
import { SlotChip } from '../components/SlotChip.js';
import { ResponsiveTable, type Column } from '../components/ResponsiveTable.js';
import { PageHeader } from '../components/PageHeader.js';
import {
  Sparkles,
  ArrowRight,
  Phone,
  CheckCircle,
  Layout,
  MessageSquare,
  Layers,
} from 'lucide-react';

interface SampleLead {
  id: string;
  name: string;
  source: string;
  project: string;
  wants: string;
  status: string;
}

const SAMPLE_LEADS: SampleLead[] = [
  { id: 'LD-58210', name: 'Hardik Patel', source: 'Property portal', project: 'Project 1', wants: '3 BHK', status: 'Booked' },
  { id: 'LD-58211', name: 'Nidhi Shah', source: 'Social media ad', project: 'Project 2', wants: '2 BHK', status: 'Not booked' },
  { id: 'LD-58224', name: 'Kavita Joshi', source: 'Hoarding call', project: 'Project 2', wants: '2 BHK', status: 'Visited' },
];

const StyleguideContent: React.FC = () => {
  const { showToast } = useToast();

  // State handles for interactive demonstrations
  const [activeTab, setActiveTab] = useState('all');
  const [pillTab, setPillTab] = useState('day');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [checkboxState, setCheckboxState] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<string | null>('11:00 AM');
  const [viewMode, setViewMode] = useState<'staff' | 'buyer'>('staff');

  const tableColumns: Column<SampleLead>[] = [
    { key: 'id', header: 'Lead ID' },
    { key: 'name', header: 'Buyer Name' },
    {
      key: 'source',
      header: 'Source',
      render: (lead) => <Badge variant="source">{lead.source}</Badge>,
    },
    { key: 'project', header: 'Project' },
    { key: 'wants', header: 'Configuration' },
    {
      key: 'status',
      header: 'Status',
      render: (lead) => (
        <Badge
          variant={
            lead.status === 'Booked'
              ? 'accent'
              : lead.status === 'Visited'
                ? 'success'
                : 'neutral'
          }
        >
          {lead.status}
        </Badge>
      ),
    },
  ];

  const content = (
    <div className="space-y-12">
      {/* Header */}
      <PageHeader
        title="Design System & Component Catalog"
        description="Core design tokens, atomic UI primitives, domain components, and responsive app shells adhering to the client brief: restrained palette, zero emojis, Cormorant Garamond serif headings, and 44px touch targets."
        badge={<Badge variant="accent">Design System v1.0</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'staff' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setViewMode('staff')}
              leftIcon={<Layout className="w-3.5 h-3.5" />}
            >
              Staff Shell
            </Button>
            <Button
              variant={viewMode === 'buyer' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setViewMode('buyer')}
              leftIcon={<MessageSquare className="w-3.5 h-3.5" />}
            >
              Buyer Shell
            </Button>
          </div>
        }
      />

      {/* 1. Design Tokens */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent" />
          <h2 className="font-serif text-2xl font-semibold text-ink">1. Design Tokens & Palette</h2>
        </div>
        <p className="text-xs text-muted">
          Restrained color tokens, single deep-green accent (#1F4D45), 12px border radius, and 8px grid.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-4 rounded-xl border border-hairline bg-background flex flex-col justify-between h-24">
            <span className="text-xs font-semibold text-ink">Background</span>
            <span className="text-[11px] font-mono text-muted">#FBFAF8</span>
          </div>
          <div className="p-4 rounded-xl border border-hairline bg-surface flex flex-col justify-between h-24">
            <span className="text-xs font-semibold text-ink">Surface</span>
            <span className="text-[11px] font-mono text-muted">#FFFFFF</span>
          </div>
          <div className="p-4 rounded-xl border border-hairline bg-accent text-white flex flex-col justify-between h-24">
            <span className="text-xs font-semibold">Deep Green Accent</span>
            <span className="text-[11px] font-mono text-white/80">#1F4D45</span>
          </div>
          <div className="p-4 rounded-xl border border-hairline bg-accent-soft text-accent flex flex-col justify-between h-24">
            <span className="text-xs font-semibold">Accent Soft</span>
            <span className="text-[11px] font-mono">#E8EFEC</span>
          </div>
          <div className="p-4 rounded-xl border border-hairline bg-ink text-white flex flex-col justify-between h-24">
            <span className="text-xs font-semibold">Ink Body</span>
            <span className="text-[11px] font-mono text-white/80">#16181D</span>
          </div>
          <div className="p-4 rounded-xl border border-hairline bg-surface flex flex-col justify-between h-24">
            <span className="text-xs font-semibold text-muted">Muted Text</span>
            <span className="text-[11px] font-mono text-muted">#6B6F76</span>
          </div>
          <div className="p-4 rounded-xl border border-hairline bg-[#E7E4DE] flex flex-col justify-between h-24">
            <span className="text-xs font-semibold text-ink">Hairline Border</span>
            <span className="text-[11px] font-mono text-muted">#E7E4DE</span>
          </div>
          <div className="p-4 rounded-xl border border-hairline bg-success-soft text-success flex flex-col justify-between h-24">
            <span className="text-xs font-semibold">Success</span>
            <span className="text-[11px] font-mono">#2F6B4F</span>
          </div>
          <div className="p-4 rounded-xl border border-hairline bg-warning-soft text-warning flex flex-col justify-between h-24">
            <span className="text-xs font-semibold">Warning</span>
            <span className="text-[11px] font-mono">#A8741A</span>
          </div>
          <div className="p-4 rounded-xl border border-hairline bg-danger-soft text-danger flex flex-col justify-between h-24">
            <span className="text-xs font-semibold">Danger</span>
            <span className="text-[11px] font-mono">#A33A3A</span>
          </div>
        </div>
      </section>

      {/* 2. Buttons */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-ink">2. Buttons (44px Minimum Touch Targets)</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary Action</Button>
          <Button variant="secondary">Secondary Action</Button>
          <Button variant="outline">Outline Action</Button>
          <Button variant="ghost">Ghost Action</Button>
          <Button variant="danger">Danger Action</Button>
          <Button variant="primary" isLoading>
            Loading State
          </Button>
          <Button variant="primary" disabled>
            Disabled State
          </Button>
          <Button variant="primary" rightIcon={<ArrowRight className="w-4 h-4" />}>
            With Icon
          </Button>
        </div>
      </section>

      {/* 3. Inputs & Forms */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-ink">3. Form Controls</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Full Name"
            placeholder="e.g. Hardik Patel"
            helperText="Buyer name as per official ID"
          />
          <Input
            label="Phone Number"
            type="tel"
            placeholder="+91 98765 43210"
            leftIcon={<Phone className="w-4 h-4" />}
          />
          <Input
            label="Budget"
            defaultValue="₹1.5 Crore"
            errorMessage="Budget exceeds maximum configured threshold for 2 BHK"
          />
          <Select
            label="Preferred Configuration"
            options={[
              { value: '2bhk', label: '2 BHK (₹65L – ₹85L)' },
              { value: '3bhk', label: '3 BHK (₹95L – ₹1.2 Cr)' },
            ]}
          />
          <div className="md:col-span-2">
            <Textarea
              label="Specific Buyer Requirements"
              placeholder="e.g. Higher floor, garden-facing, possession by Q4 2026..."
              rows={2}
            />
          </div>
          <div className="md:col-span-2">
            <Checkbox
              label="Digital Personal Data Protection (DPDP) Act 2023 Consent"
              description="I consent to receive site visit details and floor plans from Company A via WhatsApp and SMS."
              checked={checkboxState}
              onChange={(e) => setCheckboxState(e.target.checked)}
            />
          </div>
        </div>
      </section>

      {/* 4. Badges & Source Tags */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-ink">4. Badges & Source Tags</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="source">Property portal</Badge>
          <Badge variant="source">Social media ad</Badge>
          <Badge variant="source">Hoarding call</Badge>
          <Badge variant="source">Website enquiry</Badge>
          <Badge variant="neutral">Neutral Status</Badge>
          <Badge variant="accent" icon={<Sparkles className="w-3.5 h-3.5" />}>
            AI Verified
          </Badge>
          <Badge variant="success" icon={<CheckCircle className="w-3.5 h-3.5" />}>
            Completed Visit
          </Badge>
          <Badge variant="warning">Follow-up Due</Badge>
          <Badge variant="danger">Cancelled</Badge>
        </div>
      </section>

      {/* 5. Tabs */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-ink">5. Navigation Tabs</h2>
        <div className="space-y-4">
          <Tabs
            variant="underline"
            activeTab={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: 'all', label: 'All Leads', badge: <Badge variant="neutral">420</Badge> },
              { id: 'unreached', label: 'Unreached Leads (<48h)', badge: <Badge variant="warning">14</Badge> },
              { id: 'booked', label: 'Booked Visits', badge: <Badge variant="accent">32</Badge> },
            ]}
          />
          <Tabs
            variant="pill"
            activeTab={pillTab}
            onChange={setPillTab}
            tabs={[
              { id: 'day', label: 'Daily View' },
              { id: 'week', label: 'Weekly Summary' },
              { id: 'month', label: 'Monthly (₹30 Lakh Spend)' },
            ]}
          />
        </div>
      </section>

      {/* 6. Stat Tiles */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-ink">6. Stat Tiles (Executive Metrics)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="Median First Response"
            value="3m 42s"
            delta={{ value: '-78%', isPositive: true, label: 'vs 14h baseline' }}
            subtitle="Target < 5 min"
          />
          <StatTile
            label="Unreached Leads (<48h)"
            value="4.2%"
            delta={{ value: '-30.8%', isPositive: true, label: 'vs 35% baseline' }}
            subtitle="Target < 5%"
          />
          <StatTile
            label="Lead to Visit Rate"
            value="7.8%"
            delta={{ value: '+1.8%', isPositive: true, label: 'Target 8%' }}
            subtitle="Completed visits only"
          />
          <StatTile
            label="Cost Per Visit"
            value="₹12,820"
            delta={{ value: '-24%', isPositive: true, label: 'Across 4 sources' }}
            subtitle="₹30L Monthly Ad Budget"
          />
        </div>
      </section>

      {/* 7. Slot Chips */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-ink">
          7. Site Visit Slot Chips (60-Minute Slots, 10:00–18:00 IST)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {['10:00 AM', '11:00 AM', '12:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'].map(
            (slot) => {
              const isSelected = selectedSlot === slot;
              const isBooked = slot === '12:00 PM';
              return (
                <SlotChip
                  key={slot}
                  time={slot}
                  status={isBooked ? 'booked' : isSelected ? 'selected' : 'available'}
                  executiveName={isBooked ? 'Booked' : 'Amit Shah'}
                  onClick={() => setSelectedSlot(slot)}
                />
              );
            },
          )}
        </div>
      </section>

      {/* 8. Chat Bubbles */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-ink">8. Chat Bubbles (Calm & Premium)</h2>
        <Card padding="md" className="max-w-xl mx-auto space-y-2 bg-background/50">
          <ChatBubble
            role="system"
            content="Chat started with Company A Verified Assistant · RERA Reg: PR/GJ/AHMEDABAD/AUDA/RAA01234/011126"
          />
          <ChatBubble
            role="assistant"
            avatar="A"
            senderName="Company A Assistant"
            content="Namaste Hardik-bhai! Welcome to Company A. Are you interested in Project 1 (3 BHK from ₹95L) or Project 2 (2 BHK from ₹65L)?"
            timestamp="2026-11-05T09:45:00.000Z"
          />
          <ChatBubble
            role="user"
            content="I am looking for a 3 BHK unit on a higher floor in Project 1. Can we visit this Saturday around 11 AM?"
            timestamp="2026-11-05T09:46:12.000Z"
            status="read"
          />
          <ChatBubble
            role="assistant"
            avatar="A"
            senderName="Company A Assistant"
            content="Certainly. Project 1 offers 3 BHK premium apartments (1,480 sq.ft) with possession in Dec 2026. Saturday at 11:00 AM IST is open with executive Amit Shah. Shall I lock this 60-minute slot for you?"
            timestamp="2026-11-05T09:46:40.000Z"
          />
        </Card>
      </section>

      {/* 9. Responsive Table */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-ink">
          9. Responsive Table (Table on Desktop, Stacked Cards on Mobile)
        </h2>
        <ResponsiveTable
          data={SAMPLE_LEADS}
          columns={tableColumns}
          keyExtractor={(l) => l.id}
          onRowClick={(lead) =>
            showToast({
              type: 'info',
              title: `Selected Lead ${lead.id}`,
              message: `${lead.name} (${lead.wants} in ${lead.project})`,
            })
          }
        />
      </section>

      {/* 10. Modals, Sheets, and Toasts */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-ink">10. Interactive Overlays & Notifications</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setIsModalOpen(true)}>
            Open Centered Modal
          </Button>
          <Button variant="outline" onClick={() => setIsSheetOpen(true)}>
            Open Slide-over Sheet
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              showToast({
                type: 'success',
                title: 'Site Visit Confirmed',
                message: 'Slot booked for 2026-11-08 at 11:00 AM IST with executive Amit Shah.',
              })
            }
          >
            Trigger Success Toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              showToast({
                type: 'error',
                title: 'Slot Conflict Detected',
                message: 'This slot was just reserved by another buyer. Please select an alternate slot.',
              })
            }
          >
            Trigger Error Toast
          </Button>
        </div>

        {/* Modal Instance */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Reserve Site Visit Slot"
          description="Confirming an exclusive 60-minute site visit with Company A."
          footer={
            <>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setIsModalOpen(false);
                  showToast({
                    type: 'success',
                    title: 'Reservation Confirmed',
                    message: 'Calendar invite and location pin dispatched via Outbox.',
                  });
                }}
              >
                Confirm Slot
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-sm text-ink leading-relaxed">
            <p>
              You are booking a site visit for <strong>Project 1</strong> (3 BHK) at <strong>11:00 AM IST</strong>.
            </p>
            <div className="p-3 rounded-lg bg-background border border-hairline text-xs text-muted flex flex-col gap-1">
              <span>• Executive: Amit Shah</span>
              <span>• Location: SG Highway, Ahmedabad</span>
              <span>• Reminders scheduled for 1 day and 2 hours prior via WhatsApp/SMS</span>
            </div>
          </div>
        </Modal>

        {/* Sheet Instance */}
        <Modal
          variant="sheet"
          isOpen={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          title="Fact Sheet Editor"
          description="Sales Head verified facts for AI Assistant Grounding."
          footer={
            <Button variant="primary" className="w-full" onClick={() => setIsSheetOpen(false)}>
              Save Fact Sheet Changes
            </Button>
          }
        >
          <div className="space-y-4">
            <Input label="Project 1 3-BHK Pricing" defaultValue="₹95 Lakh to ₹1.2 Crore" />
            <Input label="RERA Registration" defaultValue="PR/GJ/AHMEDABAD/CITY/AUDA/RAA00000/011126" />
            <Textarea
              label="Approved Amenities"
              rows={4}
              defaultValue="Clubhouse, Olympic lap pool, EV charging stations, 2-tier security, children play area."
            />
          </div>
        </Modal>
      </section>

      {/* 11. Skeletons, Empty & Error States */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-semibold text-ink">
          11. Asynchronous States (Loading, Empty, Error)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Skeleton Card */}
          <Card padding="md" className="space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton variant="circular" width={32} height={32} />
              <div className="flex-1 space-y-1">
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="40%" />
              </div>
            </div>
            <Skeleton variant="rectangular" height={100} />
            <Skeleton variant="text" count={3} />
          </Card>

          {/* Empty State */}
          <EmptyState
            title="No Pending Follow-ups"
            description="All enquiries have been responded to within the 2-minute SLA target."
            action={{
              label: 'View All Leads',
              onClick: () =>
                showToast({ type: 'info', title: 'Navigation', message: 'Navigating to Leads...' }),
            }}
          />

          {/* Error State */}
          <ErrorState
            title="Outbox Channel Failed"
            message="Unable to dispatch WhatsApp template message due to upstream carrier timeout."
            onRetry={() =>
              showToast({
                type: 'info',
                title: 'Retrying Outbox Job',
                message: 'Outbox message re-queued.',
              })
            }
          />
        </div>
      </section>
    </div>
  );

  return viewMode === 'staff' ? (
    <StaffLayout>{content}</StaffLayout>
  ) : (
    <BuyerLayout>{content}</BuyerLayout>
  );
};

export const StyleguidePage: React.FC = () => {
  return (
    <ToastProvider>
      <StyleguideContent />
    </ToastProvider>
  );
};

export default StyleguidePage;
