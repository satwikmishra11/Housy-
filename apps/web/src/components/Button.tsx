import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-xl transition-colors duration-150 select-none disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 min-h-[44px]';

    const variantStyles: Record<ButtonVariant, string> = {
      primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-hover/90 shadow-subtle',
      secondary: 'bg-accent-soft text-accent hover:bg-accent-soft/80 active:bg-accent-soft/90',
      outline:
        'border border-hairline bg-surface text-ink hover:bg-background active:bg-hairline/40 shadow-subtle',
      ghost: 'bg-transparent text-ink hover:bg-hairline/30 active:bg-hairline/50',
      danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/95 shadow-subtle',
    };

    const sizeStyles: Record<ButtonSize, string> = {
      sm: 'px-3 py-2 text-xs gap-1.5 min-w-[44px]',
      md: 'px-4 py-2.5 text-sm gap-2 min-w-[44px]',
      lg: 'px-6 py-3 text-base gap-2.5 min-w-[48px]',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" aria-hidden="true" />
        ) : (
          leftIcon
        )}
        <span>{children}</span>
        {!isLoading && rightIcon}
      </button>
    );
  },
);

Button.displayName = 'Button';

