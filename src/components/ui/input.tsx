import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function resolveInputAriaInvalid(error?: string): true | undefined {
  return error ? true : undefined;
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type?: "text" | "email" | "tel" | "password";
  error?: string;
};

export function Input({
  className,
  error,
  type = "text",
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={resolveInputAriaInvalid(error)}
      className={cn(
        "rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  );
}
