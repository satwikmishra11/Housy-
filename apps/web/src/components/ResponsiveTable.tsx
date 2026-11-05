import React from 'react';
import { Card } from './Card.js';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (item: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  hideOnMobile?: boolean;
}

export interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string | number;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (item: T) => void;
}

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor,
  emptyMessage = 'No records available',
  className = '',
  onRowClick,
}: ResponsiveTableProps<T>): React.ReactElement {
  if (data.length === 0) {
    return (
      <div className="p-8 text-center border border-hairline rounded-xl bg-surface text-sm text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Desktop Table View (>= md) */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-hairline bg-surface shadow-card">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline bg-background/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  } ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {data.map((item) => (
              <tr
                key={keyExtractor(item)}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={`transition-colors ${
                  onRowClick ? 'cursor-pointer hover:bg-background/80' : 'hover:bg-background/40'
                }`}
              >
                {columns.map((col) => {
                  const content = col.render
                    ? col.render(item)
                    : (item as Record<string, unknown>)[col.key] !== undefined
                      ? String((item as Record<string, unknown>)[col.key])
                      : null;

                  return (
                    <td
                      key={col.key}
                      className={`px-4 py-3.5 text-ink whitespace-nowrap ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                      } ${col.className || ''}`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Card View (< md) */}
      <div className="flex flex-col gap-3 md:hidden">
        {data.map((item) => (
          <Card
            key={keyExtractor(item)}
            padding="sm"
            onClick={onRowClick ? () => onRowClick(item) : undefined}
            className={`flex flex-col gap-2 ${onRowClick ? 'cursor-pointer active:bg-background' : ''}`}
          >
            {columns
              .filter((col) => !col.hideOnMobile)
              .map((col) => {
                const content = col.render
                  ? col.render(item)
                  : (item as Record<string, unknown>)[col.key] !== undefined
                    ? String((item as Record<string, unknown>)[col.key])
                    : null;

                return (
                  <div
                    key={col.key}
                    className="flex items-center justify-between gap-2 py-1 text-xs sm:text-sm border-b border-hairline/60 last:border-b-0"
                  >
                    <span className="font-semibold text-muted uppercase text-[11px] tracking-wider">
                      {col.header}
                    </span>
                    <span className="text-ink font-medium text-right">{content}</span>
                  </div>
                );
              })}
          </Card>
        ))}
      </div>
    </div>
  );
}
