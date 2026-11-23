import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-neutral-100 text-neutral-700",
        primary:
          "bg-[color-mix(in_srgb,var(--color-primary)_14%,white)] text-primary-foreground",
        success:
          "bg-[color-mix(in_srgb,var(--color-success)_12%,white)] text-success",
        warning:
          "bg-[color-mix(in_srgb,var(--color-warning)_12%,white)] text-warning",
        danger:
          "bg-[color-mix(in_srgb,var(--color-danger)_12%,white)] text-danger",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
