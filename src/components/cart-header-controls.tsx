"use client";

import { useCart } from "@/components/cart/cart-provider";
import { LimitMeter } from "@/components/ui/limit-meter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  monthlyLimitStatus,
  sumCartFixedTotal,
} from "@/domain/services/cart-limit";
import { cn } from "@/lib/cn";

// 仕入れ枠の金額は、カートの上限チェックと同じ cart-limit の計算から取る
function useLimitAmounts() {
  const { cart, confirmedAmount, monthlyLimit } = useCart();
  const status = monthlyLimitStatus({
    lines: cart.items,
    confirmedAmount,
    monthlyLimit,
  });
  return {
    monthlyLimit,
    confirmedAmount,
    cartAmount: sumCartFixedTotal(cart.items),
    remaining: status.isUnlimited ? null : status.remaining,
  };
}

/** パソコン幅の今月の仕入れ枠。押すと内訳を出す */
export function HeaderLimit({ planName }: { planName?: string }) {
  const amounts = useLimitAmounts();
  return (
    <Popover className="shrink-0">
      <PopoverTrigger className="flex w-60 cursor-pointer flex-col rounded-xl border border-neutral-200 bg-white px-3 py-[7px] text-left text-neutral-900 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <LimitMeter {...amounts} />
      </PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label="今月の仕入れ枠の内訳"
        className="w-[310px] p-[18px]"
      >
        <LimitMeter {...amounts} variant="detail" planName={planName} />
      </PopoverContent>
    </Popover>
  );
}

/** スマホ幅で、ヘッダーの下にいつも出す仕入れ枠の帯 */
export function HeaderLimitBand() {
  return (
    <div
      aria-label="今月の仕入れ枠"
      className="border-t border-neutral-100 bg-neutral-50 px-4 pt-2 pb-2.5"
    >
      <LimitMeter {...useLimitAmounts()} cartBreakdown />
    </div>
  );
}

/** カートを開くボタン（件数のバッジ付き） */
export function CartButton({ compact = false }: { compact?: boolean }) {
  const { cart, openCart } = useCart();
  const count = cart.items.length;
  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={
        count > 0 ? `カートを開く（${count}種類）` : "カートを開く（空）"
      }
      className={cn(
        "relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        !compact &&
          "border border-neutral-200 transition-colors hover:border-primary"
      )}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 7h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 7z" />
        <path d="M9 7V6a3 3 0 0 1 6 0v1" />
      </svg>
      {count > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute box-border inline-flex items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-primary-light to-primary font-bold text-primary-foreground",
            compact
              ? "top-1 right-0.5 h-[18px] min-w-[18px] px-1 text-[0.625rem]"
              : "-top-1 -right-1 h-5 min-w-5 px-[5px] text-[0.6875rem]"
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
