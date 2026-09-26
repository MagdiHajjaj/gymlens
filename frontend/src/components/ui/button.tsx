import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ButtonHTMLAttributes } from 'react';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
const variants = cva('button', {
  variants: {
    variant: {
      default: 'button-primary',
      secondary: 'button-secondary',
      ghost: 'button-ghost',
      danger: 'button-danger',
    },
    size: { default: '', small: 'button-small', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(variants({ variant, size }), className)} {...props} />;
}
