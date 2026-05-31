"use client";

import { useCart } from "@/lib/cart/context";

export default function CartHeaderControls() {
  const { cart, totalUsed, monthlyLimit, openCart } = useCart();
  const cartCount = cart.items.length;
  const usageRate =
    monthlyLimit > 0 ? Math.min(totalUsed / monthlyLimit, 1) : 0;

  const barColor =
    usageRate >= 0.9
      ? "bg-red-500"
      : usageRate >= 0.7
        ? "bg-yellow-400"
        : "bg-green-500";

  return (
    <div className="flex items-center gap-3">
      {/* 月次使用率バー */}
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${usageRate * 100}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-gray-500">
          ¥{totalUsed.toLocaleString()}
          <span className="text-gray-400">
            {" "}
            / ¥{monthlyLimit.toLocaleString()}
          </span>
        </span>
      </div>

      {/* カートアイコン */}
      <button
        onClick={openCart}
        className="relative text-gray-500 hover:text-gray-900"
        aria-label="カートを開く"
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
            d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
          />
        </svg>
        {cartCount > 0 && (
          <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 text-[10px] font-medium text-white">
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        )}
      </button>
    </div>
  );
}
