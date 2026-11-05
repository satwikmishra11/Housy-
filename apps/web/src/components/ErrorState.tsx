import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load system status',
  message,
  onRetry,
}) => {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-rose-200 bg-rose-50/50 shadow-sm"
    >
      <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-4">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-rose-950">{title}</h3>
      <p className="mt-1 text-sm text-rose-700 max-w-md">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 border border-rose-300 text-sm font-medium rounded-lg text-rose-800 bg-white hover:bg-rose-50 transition shadow-xs"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Diagnostic
        </button>
      )}
    </div>
  );
};

