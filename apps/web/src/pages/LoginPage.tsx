import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { fetchHealth, type ApiError } from '../lib/api.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/Card.js';
import { Input } from '../components/Input.js';
import { Button } from '../components/Button.js';
import { Lock, Mail, Building2, Shield, User, ArrowLeft, ArrowRight } from 'lucide-react';
import { LanguageSwitcher } from '../components/LanguageSwitcher.js';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [dbStatusLine, setDbStatusLine] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/leads';

  // If already authenticated, redirect
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  // Fetch /api/health once on mount and show small status line when database is not ok
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => fetchHealth())
      .then((health) => {
        if (!active || !health?.database) return;
        if (health.database.status !== 'ok') {
          const reason = health.database.reason;
          setDbStatusLine(reason === 'schema_missing' ? 'Setup incomplete' : 'Service is starting up');
        }
      })
      .catch(() => {
        if (!active) return;
        setDbStatusLine('Service is starting up');
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setErrorMessage(null);
    setErrorRequestId(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please provide both email and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login({ email: email.trim(), password });
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please check your credentials.';
      const reqId = (err as ApiError)?.requestId || null;
      setErrorMessage(message);
      setErrorRequestId(reqId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillDemoAccount = (demoEmail: string): void => {
    setEmail(demoEmail);
    const demoSeedPass = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_DEMO_SEED_PASSWORD;
    if (demoSeedPass) {
      setPassword(demoSeedPass);
    }
    setErrorMessage(null);
    setErrorRequestId(null);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between p-4 sm:p-6 antialiased">
      {/* Top Header */}
      <header className="flex items-center justify-between max-w-5xl mx-auto w-full py-2">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
            title="Return to Home"
          >
            <div className="w-8 h-8 rounded-xl bg-accent text-white flex items-center justify-center font-serif font-bold text-base shadow-subtle">
              H
            </div>
            <span className="font-semibold text-ink text-sm tracking-tight">Housy</span>
          </Link>
          <span className="text-muted/40">·</span>
          <Link
            to="/"
            aria-label="Back to Home"
            className="text-xs text-muted hover:text-ink transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Home</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/chat"
            className="text-xs font-medium text-accent hover:underline inline-flex items-center gap-1"
          >
            <span>Buyer AI Chat</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main Form Container */}
      <main className="flex-1 flex items-center justify-center py-8">
        <div className="w-full max-w-md">
          <Card className="shadow-subtle border-hairline">
            <CardHeader className="text-center pb-2">
              <div className="w-12 h-12 rounded-2xl bg-accent-soft text-accent mx-auto mb-3 flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <CardTitle className="text-3xl font-serif font-normal text-ink">
                Staff Sign In
              </CardTitle>
              <CardDescription className="text-muted text-sm mt-1">
                Aaranya Realty · Ahmedabad Sales Workspace
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
              {dbStatusLine && (
                <div
                  role="status"
                  className="mb-4 px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="font-medium">{dbStatusLine}</span>
                  </div>
                  <span className="text-[11px] text-amber-700 font-mono">System</span>
                </div>
              )}

              {errorMessage && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm flex flex-col gap-1"
                >
                  <span className="font-medium">{errorMessage}</span>
                  {errorRequestId && (
                    <span className="text-xs opacity-90 font-mono">Reference: {errorRequestId}</span>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Work Email"
                  type="email"
                  placeholder="name@developer.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leftIcon={<Mail className="w-4 h-4" />}
                  required
                  autoFocus
                  autoComplete="email"
                />

                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="w-4 h-4" />}
                  required
                  autoComplete="current-password"
                />

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full mt-2"
                  isLoading={isSubmitting}
                >
                  Sign In to Workspace
                </Button>
              </form>

              {/* Demo Accounts Quick-Fill Section */}
              <div className="mt-6 pt-5 border-t border-hairline">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2.5 text-center">
                  Quick Demo Accounts
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('harshil.mehta@example.com')}
                    className="min-h-[44px] px-3 py-2 border border-hairline bg-surface hover:bg-background rounded-xl text-xs text-ink transition-colors flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Shield className="w-3.5 h-3.5 text-accent" />
                    <span>Sales Head</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fillDemoAccount('amit.shah@example.com')}
                    className="min-h-[44px] px-3 py-2 border border-hairline bg-surface hover:bg-background rounded-xl text-xs text-ink transition-colors flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <User className="w-3.5 h-3.5 text-muted" />
                    <span>Sales Executive</span>
                  </button>
                </div>
                <p className="text-[11px] text-muted text-center mt-2.5">
                  Staff accounts are seeded per deployment.md (see README.md for credentials)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Direct Link to Buyer Chat */}
          <div className="mt-4 text-center">
            <p className="text-xs text-muted">
              Looking for residences or scheduling a site tour?{' '}
              <Link to="/chat" className="text-accent font-medium hover:underline inline-flex items-center gap-0.5">
                <span>Chat with our AI Advisor</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-3 text-xs text-muted max-w-5xl mx-auto w-full">
        RERA Registered Developer Platform · Passwords stored with Argon2id
      </footer>
    </div>
  );
};

