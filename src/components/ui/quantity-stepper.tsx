import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const stepperButtonVariants = cva(
  "inline-flex items-center justify-center rounded-full text-neutral-900 transition-colors hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-35",
  {
    variants: {
      // 押せる範囲。md は商品詳細（Button の md と同じ高さ）、sm はカート
      size: {
        md: "h-13 w-12 text-xl",
        sm: "h-10 w-10 text-[1.0625rem]",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

type QuantityStepperProps = VariantProps<typeof stepperButtonVariants> & {
  // 数量の group の読み上げ名（例:「レザートートバッグの数量」）
  label: string;
  value: number;
  onChange: (value: number) => void;
  // これ以上は減らせない数量
  min?: number;
  // 送信中など、増やす・減らすの両方を押せなくする
  disabled?: boolean;
  className?: string;
};

export function QuantityStepper({
  label,
  value,
  onChange,
  min = 1,
  disabled = false,
  size,
  className,
}: QuantityStepperProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center rounded-full border border-neutral-300 bg-white",
        className
      )}
    >
      <button
        type="button"
        aria-label="数量を減らす"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className={stepperButtonVariants({ size })}
      >
        <span aria-hidden="true">−</span>
      </button>
      <span
        aria-live="polite"
        className={cn(
          "text-center font-semibold tabular-nums",
          size === "sm" ? "min-w-6 text-sm" : "min-w-8 text-base"
        )}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="数量を増やす"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className={stepperButtonVariants({ size })}
      >
        <span aria-hidden="true">＋</span>
      </button>
    </div>
  );
}
