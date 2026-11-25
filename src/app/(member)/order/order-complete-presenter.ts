import { PAYMENT_TIMING } from "@/app/legal/legal-notice";
import type { CompletedOrderItemDto } from "@/queries/member-order-query-service";

export type OrderCompleteStep = {
  title: string;
  body: string;
  // 済んだステップ（チェックの印を出す）
  done: boolean;
};

export type OrderCompleteView = {
  orderNumber: string;
  orderDate: string;
  eyebrow: string;
  // 請求書払いの商品があるときの案内。カードのみなら null
  invoiceNotice: string | null;
  steps: OrderCompleteStep[];
  items: { id: string; name: string; detail: string; lineTotal: string }[];
  // 固定価格の商品が無ければ null
  total: { label: string; amount: string } | null;
};

function yen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function fixedTotalOf(items: CompletedOrderItemDto[]): number {
  return items.reduce(
    (sum, i) =>
      i.isNegotiable || i.unitPriceSnapshot === null
        ? sum
        : sum + i.unitPriceSnapshot * i.quantity,
    0
  );
}

// 支払い期限は注文の最終確認画面・特定商取引法に基づく表記と同じ出どころから出す
const INVOICE_DUE = `${PAYMENT_TIMING.afterOrder.text}にお支払いください。`;

/**
 * 注文完了の画面（カードのみ・請求書のみ・両方）に出す文言と明細。
 * atOrderItems はカード（Checkout）で払った商品、afterOrderItems は請求書払いの商品
 */
export function presentOrderComplete({
  orderId,
  createdAt,
  atOrderItems,
  afterOrderItems,
}: {
  orderId: string;
  createdAt: string;
  atOrderItems: CompletedOrderItemDto[];
  afterOrderItems: CompletedOrderItemDto[];
}): OrderCompleteView {
  const hasCard = atOrderItems.length > 0;
  const hasInvoice = afterOrderItems.length > 0;
  const invoiceTotal = fixedTotalOf(afterOrderItems);

  const steps: OrderCompleteStep[] = hasCard
    ? [
        {
          title: "お支払い",
          body: hasInvoice
            ? "クレジットカードの商品のお支払いが完了しました。"
            : "お支払いが完了しました。",
          done: true,
        },
        {
          title: "仕入れ先へ発注",
          body: "運営者が仕入れ先へ発注します。",
          done: false,
        },
        {
          title: "発送",
          body: "入荷しだい発送します。発送の状況は注文履歴で確かめられます。",
          done: false,
        },
      ]
    : [
        {
          title: "ご注文の受付",
          body: "ご注文を受け付けました。",
          done: true,
        },
        {
          title: "請求書の送付",
          body: `運営者が内容を確認したあと、請求書をお送りします。${INVOICE_DUE}`,
          done: false,
        },
        {
          title: "発送",
          body: "仕入れ先から入荷しだい発送します。",
          done: false,
        },
      ];

  const invoiceNames = afterOrderItems
    .map((i) => i.productNameSnapshot)
    .join("・");
  const invoiceNotice = !hasInvoice
    ? null
    : hasCard
      ? `請求書払いの商品（${invoiceNames}${invoiceTotal > 0 ? `・${yen(invoiceTotal)}` : ""}）は、運営者が内容を確認したあと、請求書をお送りします。`
      : `運営者が内容を確認したあと、請求書をお送りします。${INVOICE_DUE}`;

  const toItem = (item: CompletedOrderItemDto, payment: string) => {
    const isNegotiable = item.isNegotiable || item.unitPriceSnapshot === null;
    return {
      id: item.id,
      name: item.productNameSnapshot,
      detail: isNegotiable
        ? `価格要相談 × ${item.quantity}`
        : `${yen(item.unitPriceSnapshot!)} × ${item.quantity}・${payment}`,
      lineTotal: isNegotiable
        ? "要相談"
        : yen(item.unitPriceSnapshot! * item.quantity),
    };
  };

  const allItems = [...atOrderItems, ...afterOrderItems];
  const hasFixed = allItems.some(
    (i) => !i.isNegotiable && i.unitPriceSnapshot !== null
  );
  const hasNegotiable = allItems.some(
    (i) => i.isNegotiable || i.unitPriceSnapshot === null
  );

  return {
    orderNumber: orderId.slice(0, 8).toUpperCase(),
    orderDate: new Date(createdAt).toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    eyebrow: hasCard ? "THANK YOU" : "ORDER RECEIVED",
    invoiceNotice,
    steps,
    items: [
      ...atOrderItems.map((i) => toItem(i, "カード")),
      ...afterOrderItems.map((i) => toItem(i, "請求書")),
    ],
    total: hasFixed
      ? {
          label: hasNegotiable ? "合計（価格要相談を除く）" : "合計",
          amount: yen(fixedTotalOf(allItems)),
        }
      : null,
  };
}
