import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const cardVariants = cva("rounded-2xl border", {
  variants: {
    featured: {
      true: "border-primary bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-primary)_7%,white),white_55%)]",
      false: "border-neutral-200 bg-white",
    },
  },
  defaultVariants: {
    featured: false,
  },
});

type CardProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

export function Card({ className, featured, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ featured }), className)} {...props} />
  );
}
