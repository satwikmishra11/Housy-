import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  description?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading system status...',
  description = 'Connecting to service endpoints and verifying database health',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-stone-200 bg-white/70 backdrop-blur-sm shadow-sm"
    >
      <Loader2 className="w-8 h-8 text-stone-700 animate-spin mb-4" />
      <h3 className="text-base font-semibold text-stone-900">{message}</h3>
      <p className="mt-1 text-sm text-stone-500 max-w-sm">{description}</p>
    </div>
  );
};

