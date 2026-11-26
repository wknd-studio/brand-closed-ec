"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { useLimitAmounts } from "@/components/cart-header-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { LimitMeter } from "@/components/ui/limit-meter";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { sumCartFixedTotal } from "@/domain/services/cart-limit";
import { cn } from "@/lib/cn";
import { groupCartItemsByPaymentTiming, type CartItem } from "@/lib/cart/types";

function yen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

type ItemRowProps = {
  item: CartItem;
  error?: string;
  onChangeQuantity: (item: CartItem, quantity: number) => void;
  onRemove: (item: CartItem) => void;
};

function CartItemRow({
  item,
  error,
  onChangeQuantity,
  onRemove,
}: ItemRowProps) {
  return (
    <li className="flex gap-3 border-b border-neutral-100 py-3.5">
      <span
        data-thumbnail
        className="relative aspect-[4/5] w-[52px] shrink-0 self-start overflow-hidden rounded-md bg-neutral-100"
      >
        {item.thumbnail && (
          <Image
            src={item.thumbnail}
            alt=""
            fill
            className="object-cover"
            sizes="52px"
          />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex justify-between gap-2">
          <span className="text-sm leading-snug font-medium">
            {item.productName}
          </span>
          <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
            {item.unitPrice !== null
              ? yen(item.unitPrice * item.quantity)
              : "要相談"}
          </span>
        </div>
        <span className="text-xs text-neutral-600 tabular-nums">
          {item.unitPrice !== null
            ? `${yen(item.unitPrice)} / 点`
            : "価格要相談"}
        </span>
        <div className="flex items-center justify-between">
          <QuantityStepper
            size="sm"
            label={`${item.productName}の数量`}
            value={item.quantity}
            // 在庫切れの商品は増やせない（減らす・削除はできる）
            max={
              item.availability === "out_of_stock" ? item.quantity : undefined
            }
            onChange={(quantity) => onChangeQuantity(item, quantity)}
          />
          <button
            type="button"
            onClick={() => onRemove(item)}
            aria-label={`${item.productName}をカートから削除`}
            className="h-10 cursor-pointer px-2.5 text-[0.8125rem] text-neutral-700 underline hover:text-danger"
          >
            削除
          </button>
        </div>
        {error && (
          <Alert tone="danger" role="alert" className="px-3 py-2 text-xs">
            {error}
          </Alert>
        )}
      </div>
    </li>
  );
}

function calcGroupSubtotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + (item.unitPrice ?? 0) * item.quantity,
    0
  );
}

type ItemGroupProps = {
  badge: { label: string; tone: "primary" | "info" };
  title: string;
  items: CartItem[];
  errors: Record<string, string>;
} & Omit<ItemRowProps, "item" | "error">;

function CartItemGroup({
  badge,
  title,
  items,
  errors,
  ...rowProps
}: ItemGroupProps) {
  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 pt-3.5 pb-2">
        <h3 className="m-0 inline-flex items-center gap-2 text-[0.8125rem] font-semibold">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {title}
        </h3>
        <span className="text-xs text-neutral-700 tabular-nums">
          小計 {yen(calcGroupSubtotal(items))}
        </span>
      </div>
      <CartItemList items={items} errors={errors} {...rowProps} />
    </section>
  );
}

function CartItemList({
  items,
  errors,
  ...rowProps
}: {
  items: CartItem[];
  errors: Record<string, string>;
} & Omit<ItemRowProps, "item" | "error">) {
  return (
    <ul className="m-0 list-none p-0">
      {items.map((item) => (
        <CartItemRow
          key={item.productId}
          item={item}
          error={errors[item.productId]}
          {...rowProps}
        />
      ))}
    </ul>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 7h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 7z" />
      <path d="M9 7V6a3 3 0 0 1 6 0v1" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function CartSidebar() {
  const {
    cart,
    isOpen,
    closeCart,
    monthlyLimit,
    updateItemQuantity,
    removeFromCart,
    emptyCart,
  } = useCart();
  const limitAmounts = useLimitAmounts();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const titleId = useId();
  const confirmTitleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const items = cart.items;
  const groups = groupCartItemsByPaymentTiming(items);

  // 開いたら閉じるボタンにフォーカスを移し、閉じたら開く前の場所へ戻す。Esc で閉じる（確認が出ていれば確認を閉じる）
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => previous?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showClearConfirm) setShowClearConfirm(false);
      else closeCart();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, showClearConfirm, closeCart]);

  const rowProps = {
    errors,
    onChangeQuantity: (item: CartItem, quantity: number) => {
      const result = updateItemQuantity(item.productId, quantity);
      setErrors((prev) => ({ ...prev, [item.productId]: result.error ?? "" }));
    },
    onRemove: (item: CartItem) => removeFromCart(item.productId),
  };

  return (
    <>
      {/* オーバーレイ */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-neutral-900/45"
          onClick={closeCart}
          aria-hidden="true"
        />
      )}

      {/* すべて削除 確認モーダル */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-neutral-900/40">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
          >
            <p id={confirmTitleId} className="m-0 text-sm font-semibold">
              カートをすべて削除しますか？
            </p>
            <p className="mt-1 mb-0 text-xs text-neutral-600">
              この操作は元に戻せません。
            </p>
            <div className="mt-5 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => setShowClearConfirm(false)}
              >
                キャンセル
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                onClick={() => {
                  emptyCart();
                  setErrors({});
                  setShowClearConfirm(false);
                }}
              >
                削除する
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ドロワー。パソコン幅は右から440px、スマホ幅は全面 */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={!isOpen}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white text-neutral-900 shadow-[-20px_0_40px_-20px_color-mix(in_srgb,var(--color-neutral-900)_40%,transparent)] transition-transform duration-300 sm:w-[440px]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 py-4 pr-4 pl-5">
          <h2
            id={titleId}
            className="m-0 flex items-baseline gap-2 font-display text-xl font-semibold"
          >
            カート
            {items.length > 0 && (
              <span className="font-sans text-[0.8125rem] font-normal text-neutral-600">
                {items.length}種類
              </span>
            )}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeCart}
            aria-label="カートを閉じる"
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <CloseIcon />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-8 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
              <BagIcon />
            </span>
            <p className="m-0 text-base font-semibold">カートは空です</p>
            <p className="m-0 text-[0.8125rem] text-neutral-700">
              気になる商品を、カートに追加してください。
            </p>
            <Link
              href="/shop"
              onClick={closeCart}
              className={buttonVariants({ size: "md" })}
            >
              ショップを見る
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-5 pt-1 pb-4">
              {groups ? (
                <>
                  <CartItemGroup
                    badge={{ label: "カード", tone: "primary" }}
                    title="注文時に支払う商品"
                    items={groups.atOrder}
                    {...rowProps}
                  />
                  <CartItemGroup
                    badge={{ label: "請求書", tone: "info" }}
                    title="注文後に請求される商品"
                    items={groups.afterOrder}
                    {...rowProps}
                  />
                </>
              ) : (
                <CartItemList items={items} {...rowProps} />
              )}
            </div>

            <div
              data-cart-footer
              className="flex flex-col gap-3.5 border-t border-neutral-200 bg-white px-5 pt-4 pb-5"
            >
              {/* 会員の情報が無いとき（上限0）は出さない。無制限（null）は出す */}
              {monthlyLimit !== 0 && (
                <div
                  role="group"
                  aria-label="今月の仕入れ枠"
                  className="rounded-xl bg-neutral-50 px-3.5 py-3"
                >
                  <LimitMeter {...limitAmounts} cartBreakdown />
                </div>
              )}

              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">合計</span>
                <span className="text-2xl font-bold tabular-nums">
                  {yen(sumCartFixedTotal(items))}
                </span>
              </div>
              <span className="-mt-2 text-xs text-neutral-600">
                価格要相談の商品は、合計に含まれません
              </span>

              <Link
                href="/order/checkout"
                onClick={closeCart}
                className={cn(buttonVariants({ size: "md" }), "w-full gap-2")}
              >
                注文手続きへ
                <ArrowIcon />
              </Link>
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="h-10 cursor-pointer self-center px-3 text-[0.8125rem] text-neutral-700 underline hover:text-danger"
              >
                カートを空にする
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
