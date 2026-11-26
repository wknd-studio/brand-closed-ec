import { cva, type VariantProps } from "class-variance-authority";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function resolveInputAriaInvalid(error?: string): true | undefined {
  return error ? true : undefined;
}

export const inputVariants = cva(
  "border border-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger",
  {
    variants: {
      shape: {
        default: "rounded-md px-3 py-2 text-sm",
        // 検索欄。高さは Button の md（52px）とそろえる。左に検索のアイコンを重ねるときは、使う側で pl-11 等を足す
        pill: "h-13 rounded-full bg-white px-4 text-[0.9375rem] text-neutral-900 placeholder:text-neutral-500",
      },
    },
    defaultVariants: {
      shape: "default",
    },
  }
);

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> &
  VariantProps<typeof inputVariants> & {
    type?: "text" | "email" | "tel" | "password" | "search";
    error?: string;
  };

export function Input({
  className,
  error,
  shape,
  type = "text",
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={resolveInputAriaInvalid(error)}
      className={cn(inputVariants({ shape }), className)}
      {...props}
    />
  );
}
