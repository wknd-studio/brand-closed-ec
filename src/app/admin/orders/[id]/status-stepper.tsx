"use client";

import { useState, useTransition } from "react";
import { advanceOrderStatus, cancelOrder } from "./actions";

type Props = {
  orderId: string;
  currentStatus: string;
  isPaidOrLater: boolean;
};

const STEPS = [
  { key: "paid", label: "入金確認済み" },
  { key: "sourcing", label: "手配中" },
  { key: "ordered", label: "発注完了" },
  { key: "preparing", label: "発送準備中" },
  { key: "shipping", label: "配送中" },
  { key: "delivered", label: "配送完了" },
];

const NEXT_LABEL: Record<string, string> = {
  paid: "手配を開始する",
  sourcing: "発注完了にする",
  ordered: "発送準備中にする",
  preparing: "発送済みにする",
  shipping: "配達完了にする",
};

const PAID_OR_LATER = new Set([
  "paid",
  "sourcing",
  "ordered",
  "preparing",
  "shipping",
  "delivered",
]);

export default function StatusStepper({ orderId, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  const currentIndex = STEPS.findIndex((s) => s.key === currentStatus);
  const isCompleted = currentStatus === "delivered";
  const isCancelled = currentStatus === "cancelled";
  const canAdvance = !isCompleted && !isCancelled && currentIndex !== -1;
  const needsStripeRefundWarning = PAID_OR_LATER.has(currentStatus);

  function handleAdvance() {
    setError(null);
    const fd = new FormData();
    fd.set("tracking_number", trackingNumber);
    startTransition(async () => {
      const result = await advanceOrderStatus(orderId, fd);
      if (result && "error" in result) setError(result.error);
    });
  }

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrder(orderId, cancelReason);
      if (result && "error" in result) setError(result.error);
    });
  }

  if (isCancelled) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        この注文はキャンセル済みです
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ステッパー */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    isDone
                      ? "bg-green-500 text-white"
                      : isCurrent
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-400"
                  }`}
                >
                  {isDone ? "✓" : i + 1}
                </div>
                <span
                  className={`text-center text-xs ${
                    isCurrent ? "font-semibold text-blue-600" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mb-5 h-0.5 flex-1 ${isDone ? "bg-green-500" : "bg-gray-200"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 追跡番号入力（preparing → shipping のときのみ） */}
      {currentStatus === "preparing" && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            追跡番号
            <span className="ml-1 text-xs text-gray-400">
              （任意・DB保存は今後対応予定）
            </span>
          </label>
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="例：1234-5678-9012"
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* アクションボタン */}
      {canAdvance && (
        <div className="flex gap-3">
          <button
            onClick={handleAdvance}
            disabled={isPending}
            className="flex-1 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "処理中..." : `${NEXT_LABEL[currentStatus]} →`}
          </button>
          <button
            onClick={() => setShowCancel(true)}
            disabled={isPending}
            className="rounded-lg border border-red-300 px-4 py-3 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      )}

      {isCompleted && (
        <p className="text-center text-sm text-green-600 font-medium">
          この注文は配送完了しています
        </p>
      )}

      {/* キャンセル確認ダイアログ */}
      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="font-semibold">注文をキャンセルしますか？</h3>

            {needsStripeRefundWarning && (
              <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
                入金済みの注文です。必要に応じて Stripe
                ダッシュボードから返金処理を行ってください。
              </p>
            )}

            <div className="space-y-1">
              <label className="text-sm text-gray-600">キャンセル理由</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="例：顧客都合によるキャンセル"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancel(false)}
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
