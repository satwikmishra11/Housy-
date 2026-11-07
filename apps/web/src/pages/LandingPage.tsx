import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ShieldCheck,
  Calendar,
  ArrowRight,
  Lock,
  MessageSquare,
  CheckCircle2,
  User,
  Shield,
  FileText,
  BarChart3,
} from 'lucide-react';
import { Button } from '../components/Button.js';
import { Badge } from '../components/Badge.js';
import { LanguageSwitcher } from '../components/LanguageSwitcher.js';
import { useAuth } from '../context/AuthContext.js';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Quick 1-click login for demo accounts directly from landing page
  const handleQuickLogin = async (email: string) => {
    const demoPassword = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DEMO_SEED_PASSWORD;
    if (demoPassword) {
      try {
        setIsLoggingIn(true);
        await login({ email, password: demoPassword });
        navigate('/leads', { replace: true });
        return;
      } catch {
        // Fallback to regular login
      } finally {
        setIsLoggingIn(false);
      }
    }
    navigate(`/login?email=${encodeURIComponent(email)}`);
  };

  return (
    <div className="min-h-screen bg-background text-ink flex flex-col antialiased selection:bg-accent/20">
      {/* 1. TOP NAVBAR */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-hairline px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center font-serif font-bold text-lg select-none shadow-subtle">
            H
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink text-base tracking-tight leading-none">Housy</span>
              <Badge variant="accent" className="text-[10px] px-1.5 py-0 hidden sm:inline-block">
                Company A · Ahmedabad
              </Badge>
            </div>
            <span className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3 h-3 text-accent" />
              RERA Registered Developer Platform
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <LanguageSwitcher compact />

          {/* Homebuyer Chat CTA */}
          <Link
            to="/chat"
            aria-label="Buyer AI Chat"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-accent bg-accent-soft hover:bg-accent-soft/80 border border-accent/20 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Buyer AI Chat</span>
          </Link>

          {/* Staff Login CTA */}
          {isAuthenticated ? (
            <Link
              to="/leads"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-accent hover:bg-accent/90 transition-colors shadow-subtle"
            >
              <span>Go to Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-ink hover:bg-ink/90 transition-colors shadow-subtle"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Staff Sign In</span>
            </Link>
          )}
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-10 sm:py-16 space-y-12 sm:space-y-16">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-accent-soft text-accent border border-accent/25 shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Intelligent Real Estate Sales & Triage Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-normal text-ink leading-[1.1] tracking-tight">
            Ahmedabad Luxury Residences, <br className="hidden sm:inline" />
            <span className="italic font-normal">Guided by Verified AI Advisory.</span>
          </h1>

          <p className="text-muted text-base sm:text-lg max-w-2xl mx-auto leading-relaxed font-normal">
            A unified sales ecosystem for Aaranya Realty, Ahmedabad: real-time multilingual AI chat for homebuyers, instant site-visit scheduling with conflict prevention, and CRM workspace for sales executives.
          </p>
        </div>

        {/* 3. DUAL PORTAL CARDS (Buyer vs Staff) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {/* Card 1: Homebuyer Experience */}
          <div className="p-6 sm:p-8 rounded-3xl bg-surface border-2 border-accent/30 shadow-card hover:border-accent/60 transition-all flex flex-col justify-between relative overflow-hidden group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent bg-accent-soft px-2.5 py-1 rounded-full">
                  For Homebuyers & Investors
                </span>
                <span className="text-xs text-muted flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                  RERA Grounded
                </span>
              </div>

              <div>
                <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-ink">
                  AI Residence Advisor
                </h2>
                <p className="text-muted text-sm mt-2 leading-relaxed">
                  Engage in 24/7 private consultation in English, Hindi, or Gujarati. Inquire about 2 & 3 BHK configurations, verified pricing, bank loan approvals, and select real-time visit slots.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-hairline">
                {[
                  '100% Grounded in Official RERA Fact Sheets (EN/HI/GU)',
                  'Direct Calendar Slot Booking (No double-booking risk)',
                  'DPDP Act 2023 Compliant (Consent notice & privacy protection)',
                  'Warm Handoff to Dedicated Sales Executive on request',
                ].map((feat, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-ink/80">
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-hairline">
              <Link
                to="/chat"
                className="w-full inline-flex items-center justify-center font-medium rounded-xl transition-colors duration-150 min-h-[46px] px-4 py-2.5 text-sm gap-2 bg-accent text-white hover:bg-accent/90 shadow-subtle"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Launch Buyer Chat Experience</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Card 2: Staff & Executive Workspace */}
          <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-hairline shadow-card hover:border-muted/50 transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted bg-background px-2.5 py-1 rounded-full border border-hairline">
                  For Staff & Management
                </span>
                <span className="text-xs text-muted flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-muted" />
                  Role-Based Access
                </span>
              </div>

              <div>
                <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-ink">
                  Sales Executive Portal
                </h2>
                <p className="text-muted text-sm mt-2 leading-relaxed">
                  Unified lead triage from 99acres, MagicBricks, Meta ads, and hoarding QR codes. Live human chat takeover, appointment outcome logging, and acquisition analytics.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-hairline">
                {[
                  'Unified Lead Triage with Trigram Fuzzy Deduplication',
                  'Live Chat Takeover & Executive Direct Response',
                  '15-Minute Unaccepted Handoff SLA Escalations',
                  'Sales Dashboard: First Response Time & Cost-per-Visit',
                ].map((feat, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-ink/80">
                    <CheckCircle2 className="w-3.5 h-3.5 text-muted flex-shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-hairline space-y-3">
              <Link
                to="/login"
                className="w-full inline-flex items-center justify-center font-medium rounded-xl transition-colors duration-150 min-h-[46px] px-4 py-2.5 text-sm gap-2 bg-ink text-white hover:bg-ink/90 shadow-subtle"
              >
                <Lock className="w-4 h-4" />
                <span>Sign In to Staff Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              {/* Quick Demo Fill Buttons */}
              <div className="pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted text-center mb-2">
                  One-Click Demo Accounts
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isLoggingIn}
                    onClick={() => handleQuickLogin('harshil.mehta@example.com')}
                    className="text-xs justify-center"
                    leftIcon={<Shield className="w-3.5 h-3.5 text-accent" />}
                  >
                    Sales Head
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isLoggingIn}
                    onClick={() => handleQuickLogin('amit.shah@example.com')}
                    className="text-xs justify-center"
                    leftIcon={<User className="w-3.5 h-3.5 text-muted" />}
                  >
                    Executive
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. RESIDENTIAL PROJECTS SHOWCASE */}
        <section className="space-y-6 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-hairline pb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Portfolio Showcase
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-ink mt-1">
                Aaranya Signature Residences
              </h2>
            </div>
            <span className="text-xs text-muted">Ahmedabad, Gujarat</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* The Palm Serene */}
            <div className="p-6 rounded-2xl bg-surface border border-hairline hover:border-accent/40 transition-colors space-y-4 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xl font-serif font-bold text-ink">The Palm Serene</h3>
                  <p className="text-xs text-muted mt-0.5">SG Highway, Near Iscon Cross Road, Ahmedabad 380054</p>
                </div>
                <Badge variant="accent">SG Highway</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-background p-3 rounded-xl border border-hairline">
                <div>
                  <span className="text-muted block">Typology</span>
                  <strong className="text-ink font-medium">2 & 3 BHK High-Rise</strong>
                </div>
                <div>
                  <span className="text-muted block">Price Range</span>
                  <strong className="text-ink font-medium">₹65L – ₹1.2 Cr</strong>
                </div>
                <div>
                  <span className="text-muted block">Possession</span>
                  <span className="text-ink">December 2026</span>
                </div>
                <div>
                  <span className="text-muted block">RERA Registration</span>
                  <span className="text-ink font-mono text-[10px]">PR/GJ/.../011126</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Link
                  to="/projects/the-palm-serene"
                  className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
                >
                  <span>Explore Showcase</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  to="/chat?project=Project%201"
                  className="text-xs text-muted hover:text-ink flex items-center gap-1"
                >
                  <Calendar className="w-3 h-3 text-accent" />
                  <span>Chat & Book Visit</span>
                </Link>
              </div>
            </div>

            {/* Skyline Greens */}
            <div className="p-6 rounded-2xl bg-surface border border-hairline hover:border-accent/40 transition-colors space-y-4 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xl font-serif font-bold text-ink">Skyline Greens</h3>
                  <p className="text-xs text-muted mt-0.5">Science City Road, Sola, Ahmedabad 380060</p>
                </div>
                <Badge variant="neutral">Science City</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-background p-3 rounded-xl border border-hairline">
                <div>
                  <span className="text-muted block">Typology</span>
                  <strong className="text-ink font-medium">2 & 3 BHK Residences</strong>
                </div>
                <div>
                  <span className="text-muted block">Price Range</span>
                  <strong className="text-ink font-medium">₹65L – ₹1.2 Cr</strong>
                </div>
                <div>
                  <span className="text-muted block">Possession</span>
                  <span className="text-ink">March 2027</span>
                </div>
                <div>
                  <span className="text-muted block">RERA Registration</span>
                  <span className="text-ink font-mono text-[10px]">PR/GJ/.../05678</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Link
                  to="/projects/skyline-greens"
                  className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
                >
                  <span>Explore Showcase</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  to="/chat?project=Project%202"
                  className="text-xs text-muted hover:text-ink flex items-center gap-1"
                >
                  <Calendar className="w-3 h-3 text-accent" />
                  <span>Chat & Book Visit</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 5. PLATFORM CAPABILITIES */}
        <section className="space-y-6 pt-4">
          <div className="border-b border-hairline pb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Architecture & Compliance
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-ink mt-1">
              Engineered for Authenticity, Speed, and Security
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-surface border border-hairline space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-ink">Verified Fact Sheet</h3>
              <p className="text-xs text-muted leading-relaxed">
                Zero hallucinated prices. AI cites fact keys for all numeric claims; negotiation prompts trigger automated policy replies.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-hairline space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-ink">Zero Double-Booking</h3>
              <p className="text-xs text-muted leading-relaxed">
                PostgreSQL partial unique indexes prevent concurrent collisions. 24h & 2h WhatsApp reminders keep show-up rates high.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-hairline space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-ink">DPDP Act 2023</h3>
              <p className="text-xs text-muted leading-relaxed">
                Affirmative consent collection, instant self-service opt-out, reminder halting, and seamless re-consent workflows.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-hairline space-y-2.5">
              <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-ink">Executive Analytics</h3>
              <p className="text-xs text-muted leading-relaxed">
                Median response times, 48h SLA breaches, lead-to-visit rates, and acquisition cost-per-visit across ₹30L monthly spend.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* 6. REGULATORY FOOTER */}
      <footer className="border-t border-hairline bg-surface/60 py-6 px-4 sm:px-8 mt-12 text-xs text-muted">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-accent text-white flex items-center justify-center font-serif font-bold text-xs">
              H
            </div>
            <span>Aaranya Realty, Ahmedabad · RERA Registration: PR/GJ/AHMEDABAD/AUDA/RAA01234/011126</span>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <Link to="/chat" className="hover:text-ink transition-colors">
              Buyer Chat
            </Link>
            <span>•</span>
            <Link to="/privacy" className="hover:text-ink transition-colors">
              Privacy Notice
            </Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-ink transition-colors">
              Terms & RERA
            </Link>
            <span>•</span>
            <Link to="/login" className="hover:text-ink transition-colors">
              Staff Sign In
            </Link>
            <span>•</span>
            <Link to="/health" className="hover:text-ink transition-colors">
              System Health
            </Link>
            <span>•</span>
            <Link to="/styleguide" className="hover:text-ink transition-colors">
              Design System
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
export default LandingPage;
