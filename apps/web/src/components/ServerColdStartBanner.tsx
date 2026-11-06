import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, X } from 'lucide-react';

export const ServerColdStartBanner: React.FC = () => {
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Cloud backend is waking up from idle (~30–45s on free tier). Waiting for response...',
  );

  useEffect(() => {
    const handleWakingUp = (e: Event): void => {
      const customEvt = e as CustomEvent<{ message?: string }>;
      if (customEvt.detail?.message) {
        setStatusMessage(customEvt.detail.message);
      }
      setIsWakingUp(true);
      setIsReady(false);
      setDismissed(false);
    };

    const handleReady = (): void => {
      setIsWakingUp((prev) => {
        if (prev) {
          setIsReady(true);
          setTimeout(() => {
            setIsWakingUp(false);
            setIsReady(false);
          }, 2500);
        }
        return prev;
      });
    };

    window.addEventListener('housy:backend-waking-up', handleWakingUp);
    window.addEventListener('housy:backend-ready', handleReady);

    return () => {
      window.removeEventListener('housy:backend-waking-up', handleWakingUp);
      window.removeEventListener('housy:backend-ready', handleReady);
    };
  }, []);

  if (!isWakingUp || dismissed) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-50 px-4 py-2.5 text-xs sm:text-sm font-medium transition-all duration-300 shadow-md ${
        isReady
          ? 'bg-emerald-700 text-white border-b border-emerald-800'
          : 'bg-stone-900 text-amber-200 border-b border-amber-500/30'
      }`}
    >
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {isReady ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0 animate-bounce" />
          ) : (
            <Loader2 className="w-4 h-4 text-amber-400 flex-shrink-0 animate-spin" />
          )}
          <span className="truncate">
            {isReady ? 'Backend connected and ready!' : statusMessage}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-white/10 text-stone-300 hover:text-white transition-colors"
          aria-label="Dismiss cold-start notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
