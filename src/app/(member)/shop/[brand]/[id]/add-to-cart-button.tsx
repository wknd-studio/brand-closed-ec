"use client";

import { useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { monthlyLimitStatus } from "@/domain/services/cart-limit";
import type { CartItem } from "@/lib/cart/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/ui/quantity-stepper";

type Props = {
  item: Omit<CartItem, "quantity">;
  isOutOfStock: boolean;
};

type Result =
  | { kind: "added" }
  | { kind: "overLimit"; error: string; remaining: number | null };

export default function AddToCartButton({ item, isOutOfStock }: Props) {
  const { cart, confirmedAmount, monthlyLimit, addToCart, openCart } =
    useCart();
  const [quantity, setQuantity] = useState(1);
  const [result, setResult] = useState<Result | null>(null);

  function handleAdd() {
    const { error } = addToCart(item, quantity);
    if (error) {
      // 追加できなかったため、カートは押す前のまま。残りは押す前のカートで出す
      const status = monthlyLimitStatus({
        lines: cart.items,
        confirmedAmount,
        monthlyLimit,
      });
      setResult({
        kind: "overLimit",
        error,
        remaining: status.isUnlimited ? null : Math.max(0, status.remaining),
      });
    } else {
      setResult({ kind: "added" });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper
          label={`${item.productName}の数量`}
          value={quantity}
          onChange={setQuantity}
          disabled={isOutOfStock}
        />
        <Button
          onClick={handleAdd}
          disabled={isOutOfStock}
          className="flex-[1_1_220px] disabled:bg-none disabled:bg-neutral-200 disabled:text-neutral-700 disabled:opacity-100 disabled:shadow-none"
        >
          {isOutOfStock ? "在庫切れのため注文できません" : "カートに追加"}
        </Button>
      </div>

      {result?.kind === "added" && (
        <Alert
          tone="success"
          role="status"
          action={
            <button
              type="button"
              onClick={openCart}
              className="underline-offset-2 hover:underline"
            >
              カートを見る
            </button>
          }
        >
          <p className="font-semibold">カートに追加しました</p>
        </Alert>
      )}
      {result?.kind === "overLimit" && (
        <Alert tone="danger" role="alert">
          <p className="leading-relaxed">{result.error}</p>
          {result.remaining !== null && (
            <p className="text-[0.8125rem] leading-relaxed">
              今月の残りは ¥{result.remaining.toLocaleString()}{" "}
              です。数量を減らすか、来月にご注文ください。
            </p>
          )}
        </Alert>
      )}
    </div>
  );
}
