import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  count = 1,
  className = '',
  style,
  ...props
}) => {
  const variantStyles = {
    text: 'rounded-md h-4 w-full',
    circular: 'rounded-full',
    rectangular: 'rounded-xl w-full',
  };

  const elements = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      aria-hidden="true"
      className={`animate-pulse bg-hairline/60 ${variantStyles[variant]} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      {...props}
    />
  ));

  if (count === 1) {
    return elements[0] ?? null;
  }

  return <div className="flex flex-col gap-2 w-full">{elements}</div>;
};
