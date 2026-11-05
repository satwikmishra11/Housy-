import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      helperText,
      errorMessage,
      options,
      children,
      id,
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const hasError = Boolean(errorMessage);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold text-ink uppercase tracking-wider">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={
              hasError ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined
            }
            className={`w-full min-h-[44px] appearance-none rounded-xl border bg-surface pl-3.5 pr-10 py-2.5 text-sm text-ink transition-colors duration-150 disabled:bg-background disabled:text-muted disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
              hasError
                ? 'border-danger focus-visible:ring-danger'
                : 'border-hairline hover:border-muted/50 focus-visible:border-accent focus-visible:ring-accent'
            } ${className}`}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <div className="absolute right-3.5 flex items-center pointer-events-none text-muted">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
        {hasError ? (
          <p id={`${selectId}-error`} role="alert" className="text-xs text-danger font-medium mt-0.5">
            {errorMessage}
          </p>
        ) : helperText ? (
          <p id={`${selectId}-helper`} className="text-xs text-muted mt-0.5">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);

Select.displayName = 'Select';
