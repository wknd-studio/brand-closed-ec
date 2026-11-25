import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { settlementTimingOf } from "@/domain/services/order-flow-selector";
import type {
  ProductAvailability,
  ProductPaymentTiming,
} from "@/queries/catalog-query-service";
import LegalNoticeText from "@/app/legal/legal-notice-text";
import { PAYMENT_METHOD, PAYMENT_TIMING } from "@/app/legal/legal-notice";

/**
 * 商品詳細の在庫とお支払いの表。お支払いの文言は特商法の表記・注文の最終確認画面と同じ値を使い、
 * 商品ごとの支払い方法（paymentTiming）で出し分ける。要相談の商品は、注文の保存と同じく請求書払いになる
 */
export default function ProductTerms({
  availability,
  paymentTiming,
  isNegotiable,
}: {
  availability: ProductAvailability;
  paymentTiming: ProductPaymentTiming;
  isNegotiable: boolean;
}) {
  const isOutOfStock = availability === "out_of_stock";
  const timing =
    settlementTimingOf({ paymentTiming, isNegotiable }) === "after_order"
      ? "afterOrder"
      : "atOrder";

  return (
    <dl className="flex flex-col border-t border-neutral-200 text-sm">
      <Row label="在庫">
        <span
          className={cn(
            "inline-flex items-center gap-2 font-semibold",
            isOutOfStock ? "text-danger" : "text-success"
          )}
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-current" />
          {isOutOfStock ? "在庫切れ" : "取り扱い中"}
        </span>
      </Row>
      <Row label="お支払い方法">
        <span
          className={cn(
            "font-semibold",
            timing === "afterOrder" ? "text-info" : "text-neutral-900"
          )}
        >
          <LegalNoticeText value={PAYMENT_METHOD[timing]} />
        </span>
      </Row>
      <Row label="お支払い時期">
        <LegalNoticeText value={PAYMENT_TIMING[timing]} />
      </Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 border-b border-neutral-200 py-3">
      <dt className="w-26 shrink-0 text-secondary">{label}</dt>
      <dd className="min-w-0 leading-relaxed">{children}</dd>
    </div>
  );
}
