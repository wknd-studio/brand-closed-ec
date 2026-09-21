"use client";

import { useState, useTransition } from "react";
import { cancelOrder } from "./actions";

type Props = { orderId: string };

export default function CancelOrderButton({ orderId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState("");

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrder(orderId, reason);
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setShowDialog(true)}
          disabled={isPending}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          注文をキャンセル
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="font-semibold">注文をキャンセルしますか？</h3>
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              未払いの決済単位もキャンセルされます。送付済みのStripe
              Invoiceがある場合は、Stripeダッシュボードから無効化してください。
            </p>
            <div className="space-y-1">
              <label className="text-sm text-gray-600">キャンセル理由</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="例：顧客都合によるキャンセル"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDialog(false)}
                disabled={isPending}
                className="flex-1 rounded border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                戻る
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="flex-1 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "処理中..." : "キャンセルする"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
