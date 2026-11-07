import { Link } from 'react-router-dom';
import { Compass, Home, MessageSquare } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background text-ink flex flex-col items-center justify-center p-6 text-center antialiased">
      <div className="max-w-md w-full bg-surface border border-hairline rounded-3xl p-8 sm:p-10 shadow-card space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-accent-soft text-accent flex items-center justify-center">
          <Compass className="w-8 h-8 animate-pulse" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold text-accent uppercase tracking-widest">
            Error 404
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-ink">
            Page Not Found
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            The page or property listing you requested could not be located in our residential portfolio.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:opacity-90 transition-opacity shadow-sm"
          >
            <Home className="w-4 h-4" />
            Return Home
          </Link>
          <Link
            to="/chat"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-hairline text-ink font-medium text-sm hover:bg-background transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-accent" />
            Buyer Chat
          </Link>
        </div>
      </div>

      <div className="mt-8 text-xs text-muted">
        <span>Aaranya Realty, Ahmedabad · RERA Certified</span>
      </div>
    </div>
  );
}
export default NotFoundPage;
