import { cva, type VariantProps } from "class-variance-authority";
import type { ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const headingVariants = cva("font-display font-semibold", {
  variants: {
    level: {
      // ヒーローの見出し用。手動で<br/>を入れる前提のため balance は付けない
      display: "text-[clamp(2.1rem,4.6vw,3.4rem)] leading-[1.35]",
      section: "text-[clamp(1.5rem,3vw,2rem)] [text-wrap:balance]",
      compact: "text-[clamp(1.4rem,2.6vw,1.8rem)] [text-wrap:balance]",
    },
  },
  defaultVariants: {
    level: "section",
  },
});

type HeadingProps = HTMLAttributes<HTMLHeadingElement> &
  VariantProps<typeof headingVariants> & {
    as?: ElementType;
  };

export function Heading({
  className,
  level,
  as: Component = "h2",
  ...props
}: HeadingProps) {
  return (
    <Component
      className={cn(headingVariants({ level }), className)}
      {...props}
    />
  );
}
