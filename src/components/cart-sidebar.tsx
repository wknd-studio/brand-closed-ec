"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart/context";
import { calcCartFixedTotal } from "@/lib/cart/cookie";

export default function CartSidebar() {
  const {
    cart,
    isOpen,
    closeCart,
    monthlyLimit,
    totalUsed,
    updateItemQuantity,
  } = useCart();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const items = cart.items;
  const cartFixedTotal = calcCartFixedTotal(cart);
  const remaining = monthlyLimit - totalUsed;

  return (
    <>
      {/* オーバーレイ */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={closeCart}
          aria-hidden="true"
        />
      )}

      {/* ドロワー */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="カート"
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold">
            カート
            {items.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                {items.length}種類
              </span>
            )}
          </h2>
          <button
            onClick={closeCart}
            className="text-gray-400 hover:text-gray-600"
            aria-label="カートを閉じる"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* コンテンツ */}
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
              />
            </svg>
            <p className="text-sm">カートに商品が入っていません</p>
          </div>
        ) : (
          <>
            {/* アイテムリスト */}
            <ul className="flex-1 divide-y overflow-y-auto">
              {items.map((item) => (
                <li key={item.productId} className="flex gap-4 px-6 py-4">
                  {/* サムネイル */}
                  <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                    {item.thumbnail ? (
                      <Image
                        src={item.thumbnail}
                        alt={item.productName}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-6 w-6"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* 商品情報 */}
                  <div className="flex flex-1 flex-col gap-1">
                    <p className="text-sm font-medium leading-snug">
                      {item.productName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.unitPrice !== null
                        ? `¥${item.unitPrice.toLocaleString()}`
                        : "価格要相談"}
                    </p>
                    {/* 数量変更 */}
                    <div className="flex items-center gap-1 pt-1">
                      <button
                        onClick={() => {
                          setErrors((prev) => ({
                            ...prev,
                            [item.productId]: "",
                          }));
                          updateItemQuantity(item.productId, item.quantity - 1);
                        }}
                        disabled={item.quantity <= 1}
                        className="flex h-6 w-6 items-center justify-center rounded border text-gray-600 disabled:opacity-30 hover:bg-gray-50"
                        aria-label="数量を減らす"
                      >
                        −
                      </button>
                      <span className="w-7 text-center text-sm tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => {
                          const result = updateItemQuantity(
                            item.productId,
                            item.quantity + 1
                          );
                          setErrors((prev) => ({
                            ...prev,
                            [item.productId]: result.error ?? "",
                          }));
                        }}
                        disabled={item.availability === "out_of_stock"}
                        className="flex h-6 w-6 items-center justify-center rounded border text-gray-600 disabled:opacity-30 hover:bg-gray-50"
                        aria-label="数量を増やす"
                      >
                        ＋
                      </button>
                    </div>
                    {errors[item.productId] && (
                      <p className="text-xs text-red-600">
                        {errors[item.productId]}
                      </p>
                    )}
                  </div>

                  {/* 小計 */}
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {item.unitPrice !== null
                        ? `¥${(item.unitPrice * item.quantity).toLocaleString()}`
                        : "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {/* フッター */}
            <div className="border-t px-6 py-5 space-y-4">
              {/* 月間仕入れ残量 */}
              {monthlyLimit > 0 && (
                <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between text-gray-500">
                    <span>月間仕入れ残量</span>
                    {monthlyLimit === Number.MAX_SAFE_INTEGER ? (
                      <span className="font-medium text-gray-900">無制限</span>
                    ) : (
                      <span
                        className={`font-medium tabular-nums ${remaining < 0 ? "text-red-600" : "text-gray-900"}`}
                      >
                        ¥{remaining.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 合計 */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">合計（固定価格）</span>
                <span className="text-lg font-bold tabular-nums">
                  ¥{cartFixedTotal.toLocaleString()}
                </span>
              </div>
              {items.some((i) => i.unitPrice === null) && (
                <p className="text-xs text-gray-400">
                  ※ 価格要相談の商品は合計に含まれません
                </p>
              )}

              {/* 発注ボタン */}
              <Link
                href="/order/checkout"
                onClick={closeCart}
                className="block w-full rounded-lg bg-gray-900 px-6 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-gray-700"
              >
                注文手続きへ
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
