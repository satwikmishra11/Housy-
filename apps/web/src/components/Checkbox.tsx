import React, { useId } from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, errorMessage, id, className = '', disabled, checked, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <label
          htmlFor={checkboxId}
          className={`flex items-start gap-3 min-h-[44px] py-2 cursor-pointer select-none ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <div className="relative flex items-center justify-center mt-0.5">
            <input
              ref={ref}
              type="checkbox"
              id={checkboxId}
              disabled={disabled}
              checked={checked}
              className="peer sr-only"
              {...props}
            />
            <div
              className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 ${
                checked
                  ? 'bg-accent border-accent text-white'
                  : 'bg-surface border-hairline hover:border-muted'
              }`}
            >
              {checked && <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />}
            </div>
          </div>
          <div className="flex flex-col text-sm">
            <span className="font-medium text-ink leading-tight">{label}</span>
            {description && <span className="text-xs text-muted mt-0.5">{description}</span>}
          </div>
        </label>
        {errorMessage && (
          <p role="alert" className="text-xs text-danger font-medium -mt-1 pl-8">
            {errorMessage}
          </p>
        )}
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';
