"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart/context";

type OrderItem = {
  id: string;
  productNameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: number | null;
  isNegotiable: boolean;
};

type Props = {
  orderId: string;
  createdAt: string;
  items: OrderItem[];
};

export default function InvoiceCompleteClient({
  orderId,
  createdAt,
  items,
}: Props) {
  const { emptyCart } = useCart();

  useEffect(() => {
    emptyCart();
  }, [emptyCart]);

  const orderNumber = orderId.slice(0, 8).toUpperCase();
  const fixedTotal = items.reduce((sum, i) => {
    if (i.unitPriceSnapshot === null) return sum;
    return sum + i.unitPriceSnapshot * i.quantity;
  }, 0);
  const hasNegotiable = items.some((i) => i.isNegotiable);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="space-y-8">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-blue-600">注文受付完了</p>
          <h1 className="text-2xl font-bold">ご注文ありがとうございます</h1>
          <p className="text-sm text-gray-500">
            注文番号：{orderNumber}
            <span className="ml-2 text-xs text-gray-400">
              {new Date(createdAt).toLocaleDateString("ja-JP")}
            </span>
          </p>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-800">
          請求書の送付をお待ちください。内容を確認後、メールにてご連絡いたします。
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-gray-700">注文内容</h2>
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {item.productNameSnapshot}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.isNegotiable
                      ? "価格要相談"
                      : item.unitPriceSnapshot !== null
                        ? `¥${item.unitPriceSnapshot.toLocaleString()}`
                        : "—"}{" "}
                    × {item.quantity}
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums">
                  {item.isNegotiable
                    ? "—"
                    : item.unitPriceSnapshot !== null
                      ? `¥${(item.unitPriceSnapshot * item.quantity).toLocaleString()}`
                      : "—"}
                </p>
              </li>
            ))}
          </ul>

          {fixedTotal > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
              <span className="text-sm text-gray-600">小計（固定価格）</span>
              <span className="text-lg font-bold tabular-nums">
                ¥{fixedTotal.toLocaleString()}
              </span>
            </div>
          )}
          {hasNegotiable && (
            <p className="text-xs text-gray-400">
              ※ 価格要相談の商品は請求書発行時に金額が確定します
            </p>
          )}
        </section>

        <Link
          href="/shop"
          className="block rounded-lg border px-6 py-3 text-center text-sm hover:bg-gray-50"
        >
          ショッピングを続ける
        </Link>
      </div>
    </main>
  );
}
