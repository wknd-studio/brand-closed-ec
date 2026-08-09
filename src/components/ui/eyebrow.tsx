import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type EyebrowProps = HTMLAttributes<HTMLSpanElement> & {
  withLine?: boolean;
};

export function Eyebrow({
  className,
  children,
  withLine = false,
  ...props
}: EyebrowProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[0.76rem] tracking-[0.14em] text-primary",
        className
      )}
      {...props}
    >
      {withLine && <span className="h-px w-[22px] bg-primary" />}
      {children}
    </span>
  );
}
