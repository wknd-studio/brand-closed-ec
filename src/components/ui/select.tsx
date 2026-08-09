import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { resolveInputAriaInvalid } from "@/components/ui/input";

type SelectOption = { value: string; label: string };

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  options: SelectOption[];
  error?: string;
};

export function Select({ className, options, error, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={resolveInputAriaInvalid(error)}
      className={cn(
        "rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger",
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
