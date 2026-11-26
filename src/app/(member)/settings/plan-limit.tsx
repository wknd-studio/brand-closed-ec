"use client";

import { useLimitAmounts } from "@/components/cart-header-controls";
import { LimitMeter } from "@/components/ui/limit-meter";

// 今月の仕入れ枠の内訳。ヘッダーと同じ値（会員の画面の共通レイアウトの CartProvider）を出す
export default function PlanLimit() {
  return <LimitMeter {...useLimitAmounts()} variant="detail" />;
}
