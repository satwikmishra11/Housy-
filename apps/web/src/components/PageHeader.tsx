import React from 'react';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  actions,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-hairline mb-8 ${className}`}
    >
      <div className="flex flex-col gap-1.5 max-w-2xl">
        {badge && <div className="mb-1">{badge}</div>}
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {description && <p className="text-sm text-muted leading-relaxed">{description}</p>}
      </div>

      {actions && <div className="flex items-center gap-3 self-start sm:self-auto">{actions}</div>}
    </div>
  );
};
