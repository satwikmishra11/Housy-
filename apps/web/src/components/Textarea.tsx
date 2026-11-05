import React, { useId } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      helperText,
      errorMessage,
      id,
      className = '',
      disabled,
      rows = 3,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const hasError = Boolean(errorMessage);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-xs font-semibold text-ink uppercase tracking-wider">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined
          }
          className={`w-full min-h-[44px] rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 transition-colors duration-150 disabled:bg-background disabled:text-muted disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 resize-y ${
            hasError
              ? 'border-danger focus-visible:ring-danger'
              : 'border-hairline hover:border-muted/50 focus-visible:border-accent focus-visible:ring-accent'
          } ${className}`}
          {...props}
        />
        {hasError ? (
          <p id={`${textareaId}-error`} role="alert" className="text-xs text-danger font-medium mt-0.5">
            {errorMessage}
          </p>
        ) : helperText ? (
          <p id={`${textareaId}-helper`} className="text-xs text-muted mt-0.5">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

