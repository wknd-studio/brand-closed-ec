import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function Radio({ className, label, ...props }: RadioProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="radio"
        className={cn(
          "h-4 w-4 border-neutral-300 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        {...props}
      />
      {label}
    </label>
  );
}
