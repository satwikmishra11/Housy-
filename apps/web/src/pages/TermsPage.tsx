import { Link } from 'react-router-dom';
import { FileText, ArrowLeft, ShieldAlert, CheckCircle, Scale, Building } from 'lucide-react';

export function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-ink antialiased flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md border-b border-hairline px-4 sm:px-8 py-3.5 shadow-subtle">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-accent transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Return to Home
          </Link>
          <span className="text-xs text-muted font-medium">Terms of Service & RERA Disclosures</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-10 sm:py-14 space-y-10">
        <div className="space-y-3 border-b border-hairline pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft text-accent text-xs font-semibold">
            <Scale className="w-3.5 h-3.5" />
            <span>Legal Disclosures & Service Terms</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-ink">
            Terms of Use & Real Estate Disclosures
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            Effective Date: November 2026 · Developer: <strong>Aaranya Realty, Ahmedabad</strong>
          </p>
        </div>

        {/* 1. Regulatory RERA Disclosures */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-ink font-semibold text-base">
            <Building className="w-5 h-5 text-accent" />
            <h2>1. RERA Regulatory Compliance</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            All residential properties displayed on this platform are registered under the Real Estate (Regulation and Development) Act, 2016 (RERA) with the Gujarat Real Estate Regulatory Authority (GUJRERA) and the Ahmedabad Urban Development Authority (AUDA):
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-surface border border-hairline space-y-1">
              <span className="font-semibold text-xs text-ink block">The Palm Serene</span>
              <p className="text-xs text-muted font-mono">RERA Reg: PR/GJ/AHMEDABAD/AUDA/RAA01234/011126</p>
              <p className="text-[11px] text-muted">SG Highway, Near Iscon Cross Road, Ahmedabad</p>
            </div>
            <div className="p-4 rounded-xl bg-surface border border-hairline space-y-1">
              <span className="font-semibold text-xs text-ink block">Skyline Greens</span>
              <p className="text-xs text-muted font-mono">RERA Reg: PR/GJ/AHMEDABAD/AUDA/RAA05678/011126</p>
              <p className="text-[11px] text-muted">Science City Road, Sola, Ahmedabad</p>
            </div>
          </div>
        </section>

        {/* 2. Nature of Conversational AI Advisory */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-ink font-semibold text-base">
            <ShieldAlert className="w-5 h-5 text-accent" />
            <h2>2. Conversational AI Scope & Grounding Policy</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            The AI chat assistant provides automated customer guidance based exclusively on verified developer fact sheets.
          </p>
          <ul className="list-disc list-inside text-sm text-muted space-y-1.5 pl-2">
            <li><strong>No Verbal Contracts:</strong> Information provided by the AI assistant does not constitute a legal sale agreement, commercial offer, or allotment letter.</li>
            <li><strong>Price Ranges Only:</strong> The AI quotes verified price ranges only. It does not provide discounts, custom payment terms, or financial waivers. All final pricing is determined by official cost sheets executed with authorized sales executives.</li>
            <li><strong>No Investment Guarantees:</strong> The AI does not make speculative claims regarding rental yield, capital appreciation, return on investment (ROI), or resale value.</li>
          </ul>
        </section>

        {/* 3. Site Visit Appointment Rules */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-ink font-semibold text-base">
            <CheckCircle className="w-5 h-5 text-accent" />
            <h2>3. Site Visit Appointments & Code of Conduct</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            Site visit bookings are arranged to ensure an uninterrupted, personalized experience:
          </p>
          <ul className="list-disc list-inside text-sm text-muted space-y-1.5 pl-2">
            <li>Appointments are scheduled for 60 minutes with a dedicated named sales executive.</li>
            <li>To coordinate logistics safely, bookings require a minimum 3-hour advance notice.</li>
            <li>Visitors must provide valid contact details and affirmative consent under the DPDP Act 2023.</li>
            <li>Rescheduling or cancellation can be performed at any time via your self-service management link without fee or penalty.</li>
          </ul>
        </section>

        {/* 4. Limitation of Liability */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-ink font-semibold text-base">
            <FileText className="w-5 h-5 text-accent" />
            <h2>4. Limitation of Liability & Contact</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            Aaranya Realty shall not be liable for technical interruptions, network delays, or downstream server cold-starts beyond our reasonable control. For official enquiries or legal notices, please write to legal@aaranyarealty-demo.internal.
          </p>
        </section>

        <div className="pt-4 flex items-center justify-between text-xs text-muted border-t border-hairline">
          <span>© 2026 Aaranya Realty, Ahmedabad. All rights reserved.</span>
          <Link to="/chat" className="text-accent font-semibold hover:underline">
            Go to Buyer Chat →
          </Link>
        </div>
      </main>
    </div>
  );
}
export default TermsPage;
