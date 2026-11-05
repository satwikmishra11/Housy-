import React from 'react';
import { DatabaseZap } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No health telemetry available',
  description = 'No diagnostic reports have been collected yet. Trigger a health check to view status.',
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-stone-300 bg-white/50 shadow-sm">
      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 mb-4">
        <DatabaseZap className="w-6 h-6" />
      </div>
      <h3 className="text-base font-medium text-stone-900">{title}</h3>
      <p className="mt-1 text-sm text-stone-500 max-w-sm">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-stone-900 hover:bg-stone-800 transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

