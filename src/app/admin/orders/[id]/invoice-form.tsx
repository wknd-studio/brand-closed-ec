"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueInvoice } from "./actions";

type NegotiableItem = {
  id: string;
  product_name_snapshot: string;
  quantity: number;
};

type ConfirmItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

type Props = {
  orderId: string;
  negotiableItems: NegotiableItem[];
};

export default function InvoiceForm({ orderId, negotiableItems }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmItems, setConfirmItems] = useState<ConfirmItem[] | null>(null);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    const items: ConfirmItem[] = negotiableItems.map((item) => ({
      id: item.id,
      productName: item.product_name_snapshot,
      quantity: item.quantity,
      unitPrice: Number(formData.get(`price_${item.id}`)),
    }));

    setConfirmItems(items);
    setPendingFormData(formData);
  }

  function handleConfirm() {
    if (!pendingFormData) return;
    startTransition(async () => {
      const result = await issueInvoice(orderId, pendingFormData);
      if (result && "error" in result) {
        setError(result.error);
        setConfirmItems(null);
        router.refresh();
      }
    });
  }

  function handleCancel() {
    setConfirmItems(null);
    setPendingFormData(null);
  }

  return (
    <>
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

      {/* 確認ダイアログ */}
      {confirmItems && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-lg">
            <h3 className="font-semibold">請求内容を確認してください</h3>
            <p className="text-xs text-gray-500">
              以下の内容でStripe
              Invoiceを発行・送付します。送付後の取り消しはできません。
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-500">
                  <th className="pb-1 text-left">商品名</th>
                  <th className="pb-1 text-right">数量</th>
                  <th className="pb-1 text-right">単価</th>
                  <th className="pb-1 text-right">小計</th>
                </tr>
              </thead>
              <tbody>
                {confirmItems.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-1.5">{item.productName}</td>
                    <td className="py-1.5 text-right">{item.quantity}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      ¥{item.unitPrice.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      ¥{(item.unitPrice * item.quantity).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-2 text-right font-medium">
                    合計
                  </td>
                  <td className="pt-2 text-right font-bold tabular-nums">
                    ¥
                    {confirmItems
                      .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
                      .toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="flex-1 rounded border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                戻って修正する
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "発行中..." : "発行・送付する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
