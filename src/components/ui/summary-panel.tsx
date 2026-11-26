import { cva } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type SummaryPanelProps = Omit<ComponentProps<"aside">, "aria-label"> & {
  // 読み上げで区別するための名前（例:「お申し込み内容」「お支払い金額」）
  "aria-label": string;
};

/**
 * 申込み・注文の画面の右側に置く、金額のまとめと確定ボタンの枠（ゴールドの枠）。
 * パソコン幅では画面に固定し、スマホ幅（折り返したとき）は本文の下に並ぶ。
 * 親は flex-wrap の行にし、本文の列は flex-[999_1_560px] にする
 */
export function SummaryPanel({ className, ...props }: SummaryPanelProps) {
  return (
    <aside
      className={cn(
        "sticky top-6 flex min-w-0 flex-[1_1_300px] flex-col gap-[18px] rounded-3xl border-[1.5px] border-primary bg-white p-6 shadow-[0_18px_40px_-24px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]",
        className
      )}
      {...props}
    />
  );
}

/** まとめの金額の一覧。中に SummaryRow を並べる */
export function SummaryList({ className, ...props }: ComponentProps<"dl">) {
  return (
    <dl
      className={cn(
        "flex flex-col gap-2 text-[0.8125rem] tabular-nums",
        className
      )}
      {...props}
    />
  );
}

const rowVariants = cva("flex justify-between gap-2", {
  variants: {
    variant: {
      default: "[&>dt]:text-neutral-700",
      // 罫線の下の合計（本日のお支払い・合計）
      total:
        "mt-1 items-baseline border-t border-neutral-200 pt-2.5 [&>dd]:text-2xl [&>dd]:font-bold [&>dt]:font-semibold",
      // 合計の下に添える補足（2ヶ月目以降の月額等）
      note: "text-xs text-secondary",
    },
  },
  defaultVariants: { variant: "default" },
});

export function SummaryRow({
  label,
  variant,
  className,
  children,
}: {
  label: ReactNode;
  variant?: "default" | "total" | "note";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(rowVariants({ variant }), className)}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
