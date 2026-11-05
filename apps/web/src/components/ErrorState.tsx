import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button.js';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
  details?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  className = '',
  details,
}) => {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-danger/30 bg-danger-soft/60 shadow-subtle ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="font-serif text-xl sm:text-2xl font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-ink/80 max-w-md leading-relaxed">{message}</p>
      {details && (
        <pre className="mt-3 p-3 bg-surface rounded-lg border border-hairline text-xs text-muted font-mono max-w-md overflow-x-auto text-left">
          {details}
        </pre>
      )}
      {onRetry && (
        <div className="mt-6">
          <Button variant="outline" onClick={onRetry} leftIcon={<RotateCcw className="w-4 h-4" />}>
            Retry Request
          </Button>
        </div>
      )}
    </div>
  );
};
