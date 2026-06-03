"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueInvoice } from "./actions";

type NegotiableItem = {
  id: string;
  product_name_snapshot: string;
  quantity: number;
};

type Props = {
  orderId: string;
  negotiableItems: NegotiableItem[];
};

export default function InvoiceForm({ orderId, negotiableItems }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await issueInvoice(orderId, formData);
      if (result && "error" in result) {
        setError(result.error);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-sm font-medium text-gray-700">Invoice発行</h2>

      <div className="space-y-3">
        {negotiableItems.map((item) => (
          <div key={item.id} className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium">
                {item.product_name_snapshot}
              </p>
              <p className="text-xs text-gray-500">数量：{item.quantity}</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">¥</span>
              <input
                type="number"
                name={`price_${item.id}`}
                min="1"
                step="1"
                required
                placeholder="価格を入力"
                className="w-32 rounded border px-2 py-1 text-sm tabular-nums"
              />
              <span className="text-xs text-gray-500">× {item.quantity}</span>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "処理中..." : "Stripe Invoice を発行・送付する"}
      </button>
    </form>
  );
}
