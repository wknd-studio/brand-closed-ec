"use client";

import { useCart } from "@/components/cart/cart-provider";

/** カートはページではなく横から出す枠のため、戻るときはその枠を開く */
export default function BackToCartButton() {
  const { openCart } = useCart();
  return (
    <button
      type="button"
      onClick={openCart}
      className="self-start text-[0.8125rem] text-secondary hover:text-primary"
    >
      ← カートに戻る
    </button>
  );
}
