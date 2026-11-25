import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const alertVariants = cva(
  "flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm outline-none",
  {
    variants: {
      tone: {
        success: "border-success/25 bg-success/5 text-success",
        danger: "border-danger/25 bg-danger/5 text-danger",
        warning: "border-warning/25 bg-warning/5 text-warning",
        // 請求書払いの案内
        info: "border-info/25 bg-info/5 text-info",
        neutral: "border-neutral-200 bg-neutral-50 text-neutral-700",
      },
    },
  }
);

type AlertTone = NonNullable<VariantProps<typeof alertVariants>["tone"]>;

type AlertProps = Omit<ComponentProps<"div">, "role" | "title"> & {
  tone: AlertTone;
  // 操作の結果を知らせるものは status、エラーは alert（読み上げが今の読み上げを遮る）
  role: "status" | "alert";
  title?: ReactNode;
  // 右側に置くリンク・ボタン（例:「カートを見る」）
  action?: ReactNode;
};

export function Alert({
  tone,
  title,
  action,
  className,
  children,
  ...props
}: AlertProps) {
  return (
    <div className={cn(alertVariants({ tone }), className)} {...props}>
      <AlertIcon tone={tone} className="mt-px size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
      {action && <div className="shrink-0 font-semibold">{action}</div>}
    </div>
  );
}

const ICON_PATHS: Record<AlertTone, ReactNode> = {
  success: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  danger: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.5 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.5v.5" />
    </>
  ),
  info: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  neutral: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
};

function AlertIcon({
  tone,
  className,
}: {
  tone: AlertTone;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {ICON_PATHS[tone]}
    </svg>
  );
}
