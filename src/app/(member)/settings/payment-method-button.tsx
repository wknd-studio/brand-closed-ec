"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  // 成功すると Billing Portal へリダイレクトするため、戻り値は失敗のときだけ届く
  action: () => Promise<{ success: true } | { error: string }>;
  label?: string;
};

export default function PaymentMethodButton({
  action,
  label = "お支払い方法を変更する",
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
        variant="secondary"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "処理中..." : label}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
