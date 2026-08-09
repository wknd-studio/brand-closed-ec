import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Container({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mx-auto max-w-[1080px] px-[clamp(20px,5vw,48px)]",
        className
      )}
      {...props}
    />
  );
}
