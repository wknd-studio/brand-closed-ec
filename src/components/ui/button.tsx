import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full font-semibold transition-shadow active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-br from-primary-light to-primary text-primary-foreground shadow-[0_10px_24px_-8px_color-mix(in_srgb,var(--color-primary)_45%,transparent)] hover:shadow-[0_14px_30px_-8px_color-mix(in_srgb,var(--color-primary)_55%,transparent)]",
        secondary:
          "border border-neutral-200 bg-transparent text-neutral-900 transition-colors hover:border-primary hover:text-primary",
        danger: "bg-danger text-white hover:opacity-90",
      },
      size: {
        md: "h-13 px-[30px] text-[0.92rem] tracking-[0.03em]",
        sm: "h-10 px-5 text-[0.85rem] tracking-[0.04em]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
