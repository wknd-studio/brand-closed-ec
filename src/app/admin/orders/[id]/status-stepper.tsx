"use client";

import { useState, useTransition } from "react";
import { advanceOrderStatus, cancelOrder } from "./actions";

type Step = {
  key: string;
  label: string;
  description: string;
  actionLabel?: string;
  isAutomatic?: boolean;
};

const CHECKOUT_STEPS: Step[] = [
  {
    key: "pending_payment",
    label: "決済待ち",
    description:
      "会員がStripeの決済ページから支払いを完了するのを待っています。支払いが完了すると自動的に次のステップへ進みます。",
    isAutomatic: true,
  },
  {
    key: "paid",
    label: "入金確認済み",
    description: "仕入れ先への手配を開始してください",
    actionLabel: "手配を開始する",
  },
  {
    key: "sourcing",
    label: "手配中",
    description: "仕入れ先への発注が完了したら次に進めてください",
    actionLabel: "発注完了にする",
  },
  {
    key: "ordered",
    label: "発注完了",
    description: "商品が到着して発送準備が整ったら次に進めてください",
    actionLabel: "発送準備中にする",
  },
  {
    key: "preparing",
    label: "発送準備中",
    description: "追跡番号を入力して発送してください",
    actionLabel: "発送済みにする",
  },
  {
    key: "shipping",
    label: "配送中",
    description: "会員への配達が完了したら次に進めてください",
    actionLabel: "配達完了にする",
  },
  {
    key: "delivered",
    label: "配送完了",
    description: "全ての対応が完了しました",
  },
];

const INVOICE_STEPS: Step[] = [
  {
    key: "confirming",
    label: "注文確認中",
    description:
      "要相談商品の価格が未確定です。下の「Invoice発行」フォームで単価を入力し、請求書を会員に送付してください。",
  },
  {
    key: "invoice_sent",
    label: "請求書送付済み",
    description:
      "Stripe Invoiceを送付済みです。会員が支払いを完了すると自動的に「入金確認済み」へ進みます（支払い期限：Invoice発行から7日間）。",
    isAutomatic: true,
  },
  {
    key: "paid",
    label: "入金確認済み",
    description: "仕入れ先への手配を開始してください",
    actionLabel: "手配を開始する",
  },
  {
    key: "sourcing",
    label: "手配中",
    description: "仕入れ先への発注が完了したら次に進めてください",
    actionLabel: "発注完了にする",
  },
  {
    key: "ordered",
    label: "発注完了",
    description: "商品が到着して発送準備が整ったら次に進めてください",
    actionLabel: "発送準備中にする",
  },
  {
    key: "preparing",
    label: "発送準備中",
    description: "追跡番号を入力して発送してください",
    actionLabel: "発送済みにする",
  },
  {
    key: "shipping",
    label: "配送中",
    description: "会員への配達が完了したら次に進めてください",
    actionLabel: "配達完了にする",
  },
  {
    key: "delivered",
    label: "配送完了",
    description: "全ての対応が完了しました",
  },
];

type Props = {
  orderId: string;
  currentStatus: string;
  paymentFlow: string;
};

export default function StatusStepper({
  orderId,
  currentStatus,
  paymentFlow,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  const steps = paymentFlow === "invoice" ? INVOICE_STEPS : CHECKOUT_STEPS;
  const currentIndex = steps.findIndex((s) => s.key === currentStatus);
  const currentStep = steps[currentIndex];
  const isCompleted = currentStatus === "delivered";
  const isCancelled = currentStatus === "cancelled";
  const canAdvance =
    !isCompleted &&
    !isCancelled &&
    currentIndex !== -1 &&
    !!currentStep?.actionLabel;
  const canCancel = !isCompleted && !isCancelled;

  const NEEDS_REFUND_WARNING = new Set([
    "paid",
    "sourcing",
    "ordered",
    "preparing",
    "shipping",
  ]);

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
    <div className="space-y-5">
      {/* ステッパー */}
      <div className="flex items-start overflow-x-auto pb-1">
        {steps.map((step, i) => {
          const isDone = i < currentIndex;
          const isCurrent = i === currentIndex;
          return (
            <div key={step.key} className="flex flex-1 items-start min-w-0">
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isDone
                      ? "bg-green-500 text-white"
                      : isCurrent
                        ? step.isAutomatic
                          ? "bg-amber-400 text-white ring-2 ring-amber-300 ring-offset-1"
                          : "bg-blue-600 text-white ring-2 ring-blue-300 ring-offset-1"
                        : "bg-gray-200 text-gray-400"
                  }`}
                >
                  {isDone ? "✓" : step.isAutomatic && isCurrent ? "⏳" : i + 1}
                </div>
                <span
                  className={`text-center text-xs leading-tight px-0.5 ${
                    isCurrent
                      ? step.isAutomatic
                        ? "font-semibold text-amber-600"
                        : "font-semibold text-blue-600"
                      : isDone
                        ? "text-gray-500"
                        : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`mt-4 h-0.5 flex-1 ${isDone ? "bg-green-500" : "bg-gray-200"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 現在のステップの状態説明 */}
      {currentStep && (
        <div
          className={`rounded-lg border px-5 py-4 ${
            isCompleted
              ? "border-green-200 bg-green-50"
              : currentStep.isAutomatic
                ? "border-amber-200 bg-amber-50"
                : "border-blue-200 bg-blue-50"
          }`}
        >
          <p
            className={`font-semibold text-sm ${
              isCompleted
                ? "text-green-700"
                : currentStep.isAutomatic
                  ? "text-amber-700"
                  : "text-blue-700"
            }`}
          >
            現在：{currentStep.label}
          </p>
          <p
            className={`mt-1 text-sm ${
              isCompleted
                ? "text-green-600"
                : currentStep.isAutomatic
                  ? "text-amber-600"
                  : "text-blue-600"
            }`}
          >
            {currentStep.description}
          </p>
          {currentStep.isAutomatic && (
            <p className="mt-2 text-xs text-amber-500">
              ※ このステップは自動で処理されます（運営者の操作は不要です）
            </p>
          )}
        </div>
      )}

      {/* confirming: Invoice発行フォームへの誘導 */}
      {currentStatus === "confirming" && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-300 bg-white px-4 py-4 shadow-sm">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-base font-bold text-white">
            ↓
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">
              次のアクション
            </p>
            <p className="mt-0.5 text-sm text-gray-600">
              このページ下部の「Invoice発行」フォームで要相談商品の単価を入力し、請求書を発行してください
            </p>
          </div>
        </div>
      )}

      {/* invoice_sent: Stripeダッシュボードへの案内 */}
      {currentStatus === "invoice_sent" && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
          <p className="font-medium text-gray-700">支払いを確認する場合</p>
          <p className="mt-1">
            Stripe ダッシュボードの「請求書」から支払い状況を確認できます。
          </p>
        </div>
      )}

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

      {/* ステータスを進めるボタン（キャンセルも並列表示） */}
      {canAdvance && (
        <div className="flex gap-3">
          <button
            onClick={handleAdvance}
            disabled={isPending}
            className="flex-1 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "処理中..." : `${currentStep?.actionLabel} →`}
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

      {/* 自動処理ステップ・confirming: キャンセルボタンのみ表示 */}
      {!canAdvance && canCancel && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCancel(true)}
            disabled={isPending}
            className="rounded-lg border border-red-300 px-4 py-3 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            注文をキャンセル
          </button>
        </div>
      )}

      {/* キャンセル確認ダイアログ */}
      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="font-semibold">注文をキャンセルしますか？</h3>

            {NEEDS_REFUND_WARNING.has(currentStatus) && (
              <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
                入金済みの注文です。必要に応じて Stripe
                ダッシュボードから返金処理を行ってください。
              </p>
            )}

            {currentStatus === "invoice_sent" && (
              <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
                未払いのStripe Invoiceが送付済みです。キャンセル後、Stripe
                ダッシュボードから Invoice を無効化してください。
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
