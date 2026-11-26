"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  // 成功すると Billing Portal へリダイレクトするため、戻り値は失敗のときだけ届く
  action: () => Promise<{ success: true } | { error: string }>;
  label?: string;
  // 支払い失敗中の案内（#379）では赤いボタンにする
  variant?: "secondary" | "danger";
  // Stripe の画面へ移ることを、外部へ移るアイコンで示す
  external?: boolean;
};

export default function PaymentMethodButton({
  action,
  label = "お支払い方法を変更する",
  variant = "secondary",
  external = false,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        className="gap-2 whitespace-nowrap"
      >
        {isPending ? "処理中..." : label}
        {external && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        )}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
