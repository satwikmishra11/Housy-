import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from './Card.js';

export interface StatTileProps {
  label: string;
  value: string | number;
  delta?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
    label?: string;
  };
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  delta,
  subtitle,
  icon,
  className = '',
}) => {
  return (
    <Card padding="md" className={`flex flex-col justify-between ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">{label}</span>
        {icon && <div className="text-muted/80">{icon}</div>}
      </div>

      <div className="mt-4 mb-2">
        <div className="font-serif text-3xl sm:text-4xl font-semibold text-ink tracking-tight">
          {value}
        </div>
      </div>

      {(delta || subtitle) && (
        <div className="mt-2 pt-3 border-t border-hairline flex items-center justify-between text-xs">
          {delta && (
            <div
              className={`inline-flex items-center gap-1 font-medium ${
                delta.isNeutral
                  ? 'text-muted'
                  : delta.isPositive
                    ? 'text-success'
                    : 'text-danger'
              }`}
            >
              {delta.isNeutral ? (
                <Minus className="w-3.5 h-3.5" />
              ) : delta.isPositive ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              <span>{delta.value}</span>
              {delta.label && <span className="text-muted font-normal ml-0.5">{delta.label}</span>}
            </div>
          )}
          {subtitle && <span className="text-muted ml-auto truncate">{subtitle}</span>}
        </div>
      )}
    </Card>
  );
};

