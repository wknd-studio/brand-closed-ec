"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart/context";
import type { CartItem } from "@/lib/cart/types";

type Props = {
  item: Omit<CartItem, "quantity">;
  isOutOfStock: boolean;
};

export default function AddToCartButton({ item, isOutOfStock }: Props) {
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  function handleDecrement() {
    setQuantity((q) => Math.max(1, q - 1));
  }

  function handleIncrement() {
    setQuantity((q) => q + 1);
  }

  function handleAdd() {
    setErrorMessage(null);
    setAdded(false);
    const result = addToCart(item, quantity);
    if (result.error) {
      setErrorMessage(result.error);
    } else {
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">数量</span>
        <div className="flex items-center rounded-lg border">
          <button
            onClick={handleDecrement}
            disabled={quantity <= 1}
            className="flex h-9 w-9 items-center justify-center text-gray-600 disabled:opacity-30 hover:bg-gray-50"
            aria-label="数量を減らす"
          >
            −
          </button>
          <span className="w-10 text-center text-sm tabular-nums">
            {quantity}
          </span>
          <button
            onClick={handleIncrement}
            disabled={isOutOfStock}
            className="flex h-9 w-9 items-center justify-center text-gray-600 disabled:opacity-30 hover:bg-gray-50"
            aria-label="数量を増やす"
          >
            ＋
          </button>
        </div>
      </div>

      <button
        onClick={handleAdd}
        disabled={isOutOfStock}
        className="w-full rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isOutOfStock
          ? "在庫切れ"
          : added
            ? "カートに追加しました ✓"
            : "カートに追加"}
      </button>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
    </div>
  );
}
