"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import AddressSelector from "./address-selector";
import PaymentMethodButton from "@/app/(member)/settings/payment-method-button";
import { placeOrder } from "./actions";
import { useCart } from "@/components/cart/cart-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LimitMeter } from "@/components/ui/limit-meter";
import { NumberedSection } from "@/components/ui/numbered-section";
import {
  SummaryList,
  SummaryPanel,
  SummaryRow,
} from "@/components/ui/summary-panel";
import {
  monthlyLimitStatus,
  sumCartFixedTotal,
} from "@/domain/services/cart-limit";

type AddressDto = {
  id: string;
  isDefault: boolean;
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
};

// 金額のまとめ。額は要相談・権限外の商品を除いた固定価格の額
type CheckoutSummary = {
  hasAtOrder: boolean;
  hasAfterOrder: boolean;
  atOrderTotal: number;
  afterOrderTotal: number;
  negotiableCount: number;
  fixedTotal: number;
};

type Props = {
  shippingAddresses: AddressDto[];
  billingAddresses: AddressDto[];
  hasOutOfStock: boolean;
  hasNotAccessible: boolean;
  summary: CheckoutSummary;
  // 注文後の仕入れ枠の残りの計算に使う明細（権限外の商品を除く。価格はサーバー側の最新の値）
  limitLines: {
    productId: string;
    unitPrice: number | null;
    quantity: number;
  }[];
  // 月額費用の支払い失敗中は、注文ボタンの代わりにお支払い方法の更新（Billing Portal、#216）へ案内する
  paymentFailed: boolean;
  openBillingPortal: () => Promise<{ success: true } | { error: string }>;
  // 「2 ご注文の商品」「3 お支払い・お届け・キャンセルについて」（サーバー側で組み立てる）
  children: ReactNode;
};

function defaultId(addresses: AddressDto[]): string {
  return (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? "";
}

function yen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export default function CheckoutForm({
  shippingAddresses,
  billingAddresses,
  hasOutOfStock,
  hasNotAccessible,
  summary,
  limitLines,
  paymentFailed,
  openBillingPortal,
  children,
}: Props) {
  const [shippingId, setShippingId] = useState(defaultId(shippingAddresses));
  const [billingId, setBillingId] = useState(defaultId(billingAddresses));
  const [isPending, setIsPending] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // 仕入れ枠の金額は、ヘッダーの仕入れ枠と同じ useCart・cart-limit の値から取る
  const { confirmedAmount, monthlyLimit } = useCart();
  const orderAmount = sumCartFixedTotal(limitLines);
  const limitStatus = monthlyLimitStatus({
    lines: limitLines,
    confirmedAmount,
    monthlyLimit,
  });

  const hasNoAddress = shippingId === "" || billingId === "";
  const blockReasons = [
    hasOutOfStock && "在庫切れの商品をカートから削除すると、注文できます。",
    hasNotAccessible &&
      "現在のランクでは購入できない商品をカートから削除すると、注文できます。",
    hasNoAddress && "お届け先・請求先の住所を選ぶと、注文できます。",
  ].filter((reason): reason is string => Boolean(reason));
  const canOrder = blockReasons.length === 0 && summary.fixedTotal >= 0;

  async function handleOrder() {
    setOrderError(null);
    setIsPending(true);
    const result = await placeOrder(shippingId, billingId);
    setIsPending(false);
    if (result && "error" in result) setOrderError(result.error);
  }

  return (
    <>
      {hasOutOfStock && (
        <Alert tone="danger" role="alert">
          <p>
            在庫切れの商品が含まれています。カートから削除してから注文してください。
          </p>
        </Alert>
      )}
      {hasNotAccessible && (
        <Alert tone="danger" role="alert">
          <p>
            現在のランクでは購入できない商品が含まれています。カートから削除してから注文してください。
          </p>
        </Alert>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <NumberedSection
            id="checkout-address-heading"
            number={1}
            title="お届け先・請求先"
          >
            <AddressSelector
              shippingAddresses={shippingAddresses}
              billingAddresses={billingAddresses}
              onSelect={(s, b) => {
                setShippingId(s);
                setBillingId(b);
              }}
            />
          </NumberedSection>
          {children}
        </div>

        <SummaryPanel aria-label="お支払い金額">
          <SummaryList>
            {summary.hasAtOrder && (
              <SummaryRow label="クレジットカード（注文時）">
                {yen(summary.atOrderTotal)}
              </SummaryRow>
            )}
            {summary.hasAfterOrder && (
              <SummaryRow label="請求書（注文後に請求）">
                {yen(summary.afterOrderTotal)}
              </SummaryRow>
            )}
            {summary.negotiableCount > 0 && (
              <SummaryRow label="価格要相談">
                {summary.negotiableCount}点（後日ご連絡）
              </SummaryRow>
            )}
            <SummaryRow label="合計" variant="total">
              {yen(summary.fixedTotal)}
            </SummaryRow>
          </SummaryList>

          <div className="flex flex-col gap-1.5 rounded-lg bg-neutral-50 px-3 py-2.5">
            <span className="text-xs text-secondary">注文を確定したあと</span>
            <LimitMeter
              monthlyLimit={monthlyLimit}
              confirmedAmount={confirmedAmount}
              cartAmount={orderAmount}
              used={confirmedAmount + orderAmount}
              remaining={limitStatus.isUnlimited ? null : limitStatus.remaining}
            />
          </div>

          {orderError && (
            <Alert tone="danger" role="alert">
              <p>{orderError}</p>
            </Alert>
          )}

          {paymentFailed ? (
            <Alert
              tone="warning"
              role="status"
              title="お支払い方法の更新が必要です"
            >
              <p>
                月額費用のお支払いが確認できないため、ご注文いただけません。お支払い方法を更新すると、そのまま注文できます。
              </p>
              <PaymentMethodButton action={openBillingPortal} />
            </Alert>
          ) : (
            <>
              <Button
                onClick={handleOrder}
                disabled={!canOrder || isPending}
                className="w-full"
              >
                {isPending ? "処理中..." : "注文を確定する"}
              </Button>
              {blockReasons.map((reason) => (
                <p key={reason} className="text-xs leading-[1.7] text-danger">
                  {reason}
                </p>
              ))}
            </>
          )}

          <p className="flex items-start gap-2 text-xs leading-[1.7] text-secondary">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              className="mt-[3px] shrink-0"
            >
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            {summary.hasAtOrder
              ? `確定すると、クレジットカードの商品（${yen(summary.atOrderTotal)}）は Stripe の決済画面でお支払いいただきます。`
              : "確定すると、運営者が内容を確認したあと、請求書をお送りします。"}
          </p>
          <Link
            href="/shop"
            className="self-center text-[0.8125rem] text-neutral-700 underline hover:text-primary"
          >
            ショッピングを続ける
          </Link>
        </SummaryPanel>
      </div>
    </>
  );
}
