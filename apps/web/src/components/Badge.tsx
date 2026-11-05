import React from 'react';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'source';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  icon,
  className = '',
  ...props
}) => {
  const variantStyles: Record<BadgeVariant, string> = {
    neutral: 'border-hairline bg-surface text-ink',
    accent: 'border-accent/25 bg-accent-soft text-accent font-medium',
    success: 'border-success/30 bg-success-soft text-success font-medium',
    warning: 'border-warning/30 bg-warning-soft text-warning font-medium',
    danger: 'border-danger/30 bg-danger-soft text-danger font-medium',
    source:
      'border-hairline bg-background text-muted text-[11px] uppercase tracking-wider font-medium hover:border-muted/40 transition-colors',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border select-none ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};

