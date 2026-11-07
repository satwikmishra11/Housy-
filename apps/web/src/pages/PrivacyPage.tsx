import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Mail, FileText, Lock, Clock, UserCheck } from 'lucide-react';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-ink antialiased flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-hairline px-4 sm:px-8 py-3.5 shadow-subtle">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-accent transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Return to Home
          </Link>
          <span className="text-xs text-muted font-medium">Digital Personal Data Protection (DPDP) Act 2023 Notice</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-10 sm:py-14 space-y-10">
        <div className="space-y-3 border-b border-hairline pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>DPDP Act 2023 Compliant</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-ink">
            Privacy Notice & Data Processing Policy
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            Effective Date: November 2026 · Data Fiduciary: <strong>Aaranya Realty, Ahmedabad</strong>
          </p>
        </div>

        {/* 1. Purpose Specification */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-ink font-semibold text-base">
            <FileText className="w-5 h-5 text-accent" />
            <h2>1. Purpose of Processing & Data Collection</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            In compliance with Section 5 and Section 6 of the Digital Personal Data Protection Act 2023, Aaranya Realty collects and processes personal data strictly with affirmative consent for specific, lawful purposes:
          </p>
          <ul className="list-disc list-inside text-sm text-muted space-y-1.5 pl-2">
            <li>Facilitating verified property inquiries, floor plans, and price range disclosures via our AI assistant.</li>
            <li>Scheduling and coordinating exclusive 60-minute site visits with named sales executives.</li>
            <li>Transmitting transactional appointment confirmations and reminders (T-24h and T-2h) via WhatsApp, SMS, or Email.</li>
            <li>Assigning dedicated sales executives to provide private on-site advisory and physical tours.</li>
          </ul>
        </section>

        {/* 2. Categories of Data Collected */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-ink font-semibold text-base">
            <Lock className="w-5 h-5 text-accent" />
            <h2>2. Categories of Personal Data Collected</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            We adhere to the principle of data minimization. The personal information processed includes:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-surface border border-hairline space-y-1">
              <span className="font-semibold text-xs text-ink block">Contact Identifiers</span>
              <p className="text-xs text-muted">Full Name, Indian Mobile Phone Number (+91), and optional Email address.</p>
            </div>
            <div className="p-4 rounded-xl bg-surface border border-hairline space-y-1">
              <span className="font-semibold text-xs text-ink block">Enquiry Preferences</span>
              <p className="text-xs text-muted">Preferred configuration (2 BHK / 3 BHK), budget parameters, and scheduled visit time slots.</p>
            </div>
          </div>
        </section>

        {/* 3. Data Retention Period */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-ink font-semibold text-base">
            <Clock className="w-5 h-5 text-accent" />
            <h2>3. Data Retention & Anonymization</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            Personal data is retained only for as long as necessary to fulfill the stated inquiry and site visit purposes. Anonymous chat sessions without contact details are archived or anonymized after 90 days of inactivity. Confirmed visit records and transactional logs are retained for statutory audit compliance under AUDA RERA regulations.
          </p>
        </section>

        {/* 4. Rights of the Data Principal & Consent Withdrawal */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-ink font-semibold text-base">
            <UserCheck className="w-5 h-5 text-accent" />
            <h2>4. Your Rights as a Data Principal (Opt-Out & Erasure)</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            Under the DPDP Act 2023, you hold the absolute right to:
          </p>
          <ul className="list-disc list-inside text-sm text-muted space-y-1.5 pl-2">
            <li><strong>Withdraw Consent at Any Time</strong>: Typing <code className="text-accent bg-accent-soft px-1 rounded">STOP</code>, <code className="text-accent bg-accent-soft px-1 rounded">UNSUBSCRIBE</code>, or requesting opt-out in chat immediately halts all outbound messaging and cancels scheduled reminders.</li>
            <li><strong>Self-Service Visit Management</strong>: Modify, reschedule, or cancel your visit and revoke consent directly from your unique visit management link (<code className="text-accent bg-accent-soft px-1 rounded">/visit/:token</code>).</li>
            <li><strong>Right to Correction & Erasure</strong>: Request the correction of inaccurate data or deletion of your contact records.</li>
          </ul>
        </section>

        {/* 5. Data Protection Grievance Officer */}
        <section className="p-6 rounded-2xl bg-surface border border-hairline space-y-4">
          <div className="flex items-center gap-2 text-ink font-semibold text-base">
            <Mail className="w-5 h-5 text-accent" />
            <h2>5. Data Protection Grievance Officer</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            For questions regarding this Privacy Notice, data rights requests, or grievances regarding personal data processing, please contact our designated Grievance Officer:
          </p>
          <div className="text-xs text-ink space-y-1 bg-background/60 p-4 rounded-xl border border-hairline font-mono">
            <div><strong>Designation:</strong> Data Protection & Grievance Officer</div>
            <div><strong>Company:</strong> Aaranya Realty, Ahmedabad</div>
            <div><strong>Address:</strong> SG Highway, Near Iscon Cross Road, Ahmedabad, Gujarat 380054</div>
            <div><strong>Email:</strong> grievance@aaranyarealty-demo.internal</div>
            <div><strong>Response Time:</strong> Acknowledged within 24 hours, resolved within 7 business days.</div>
          </div>
        </section>

        <div className="pt-4 flex items-center justify-between text-xs text-muted border-t border-hairline">
          <span>Aaranya Realty · Ahmedabad AUDA RERA Registered</span>
          <Link to="/chat" className="text-accent font-semibold hover:underline">
            Go to Buyer Chat →
          </Link>
        </div>
      </main>
    </div>
  );
}
export default PrivacyPage;
