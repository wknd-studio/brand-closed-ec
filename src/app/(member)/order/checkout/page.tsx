import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { memberOrderQueryService } from "@/composition/member-order-query";
import { parseCart, COOKIE_NAME } from "@/lib/cart/cookie";
import { catalogQueryService } from "@/composition/catalog-query";
import {
  selectNotAccessibleProductIds,
  sumCheckoutFixedTotal,
} from "@/domain/services/checkout-access";
import LegalLinksNote from "@/app/legal/legal-links-note";
import LegalNoticeText from "@/app/legal/legal-notice-text";
import {
  CANCELLATION_POLICY,
  DELIVERY_TIMING,
  PAYMENT_METHOD,
  PAYMENT_TIMING,
  type LegalNoticeValue,
} from "@/app/legal/legal-notice";
import { openBillingPortalAction } from "@/app/(member)/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";
import { NumberedSection } from "@/components/ui/numbered-section";
import BackToCartButton from "./back-to-cart-button";
import CheckoutForm from "./checkout-form";

type LineItem = {
  productId: string;
  productName: string;
  thumbnail: string | null;
  quantity: number;
  unitPrice: number | null;
  isOutOfStock: boolean;
  isNotAccessible: boolean;
};

function yen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function LineItemList({ items }: { items: LineItem[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li
          key={item.productId}
          className="flex items-center gap-3 border-b border-neutral-100 py-3"
        >
          <div className="relative h-[60px] w-12 shrink-0 overflow-hidden rounded-md bg-neutral-100">
            {item.thumbnail && (
              <Image
                src={item.thumbnail}
                alt={item.productName}
                fill
                className="object-cover"
                sizes="48px"
              />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
            <p className="text-sm font-medium">{item.productName}</p>
            <p className="text-xs tabular-nums text-secondary">
              {`${
                item.isNotAccessible
                  ? "—"
                  : item.unitPrice !== null
                    ? yen(item.unitPrice)
                    : "価格要相談"
              } × ${item.quantity}`}
            </p>
            {item.isOutOfStock && <Badge tone="danger">在庫切れ</Badge>}
            {item.isNotAccessible && (
              <Badge tone="danger">現在のランクでは購入できません</Badge>
            )}
          </div>
          <p className="text-sm font-semibold whitespace-nowrap tabular-nums">
            {item.isNotAccessible
              ? "—"
              : item.unitPrice !== null
                ? yen(item.unitPrice * item.quantity)
                : "要相談"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function LineItemGroup({
  title,
  badge,
  subtotal,
  items,
}: {
  title: string;
  badge: ReactNode;
  subtotal: number;
  items: LineItem[];
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 pt-3 pb-2">
        <h3 className="inline-flex items-center gap-2 text-[0.8125rem] font-semibold">
          {badge}
          {title}
        </h3>
        <span className="text-xs tabular-nums text-secondary">
          小計 {yen(subtotal)}
        </span>
      </div>
      <LineItemList items={items} />
    </div>
  );
}

/**
 * 注文の最終確認画面に出す、支払い・引渡し・キャンセルの条件（特定商取引法第12条の6。#695）。
 * 数量・価格は注文内容に、確定ボタンは CheckoutForm に出す
 */
function OrderTerms({
  hasAtOrder,
  hasAfterOrder,
}: {
  hasAtOrder: boolean;
  hasAfterOrder: boolean;
}) {
  const paymentTimings = [
    ...(hasAtOrder ? (["atOrder"] as const) : []),
    ...(hasAfterOrder ? (["afterOrder"] as const) : []),
  ];
  const rows: { label: string; values: LegalNoticeValue[] }[] = [
    {
      label: "お支払い方法",
      values: paymentTimings.map((t) => PAYMENT_METHOD[t]),
    },
    {
      label: "お支払い時期",
      values: paymentTimings.map((t) => PAYMENT_TIMING[t]),
    },
    { label: "お届け時期", values: [DELIVERY_TIMING] },
    { label: "キャンセル・返品", values: [CANCELLATION_POLICY] },
  ];
  return (
    <NumberedSection
      id="order-terms-heading"
      number={3}
      title="お支払い・お届け・キャンセルについて"
    >
      <dl className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 text-[0.8125rem] leading-[1.75]">
        {rows.map(({ label, values }) => (
          <div key={label} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
            <dt className="flex-[0_0_8.5rem] text-secondary">{label}</dt>
            <dd className="min-w-0 flex-[1_1_260px]">
              {values.map((value) => (
                <p key={value.text}>
                  <LegalNoticeText value={value} />
                </p>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <LegalLinksNote action="ご注文" />
    </NumberedSection>
  );
}

export default async function CheckoutPage() {
  const [{ userId }, cookieStore] = await Promise.all([auth(), cookies()]);

  const cart = parseCart(cookieStore.get(COOKIE_NAME)?.value);
  if (cart.items.length === 0) redirect("/shop");

  const checkout = await (
    await memberOrderQueryService()
  ).findCheckout(userId!);
  if (!checkout) redirect("/shop");
  const { rank, shippingAddresses, billingAddresses, paymentFailed } = checkout;

  const products = await catalogQueryService().findCheckoutProducts({
    rank,
    productIds: cart.items.map((i) => i.productId),
  });

  const notAccessibleIds = selectNotAccessibleProductIds(
    cart.items.map((i) => i.productId),
    products
  );

  const lineItems = cart.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return {
      ...item,
      unitPrice: product?.unitPrice ?? null,
      isOutOfStock: product?.isOutOfStock ?? false,
      isNotAccessible: notAccessibleIds.includes(item.productId),
      productName: product?.name ?? item.productName,
      thumbnail: product?.thumbnail ?? item.thumbnail,
      // 表示用のグループ分けはサーバー側の最新payment_timingを根拠にする
      // （unitPriceと同様、カートCookieの値は表示のキャッシュとしてのみ扱う）
      paymentTiming: product?.paymentTiming ?? "at_order",
    };
  });

  const hasOutOfStock = lineItems.some((i) => i.isOutOfStock);
  const hasNotAccessible = notAccessibleIds.length > 0;
  const atOrderItems = lineItems.filter((i) => i.paymentTiming === "at_order");
  const afterOrderItems = lineItems.filter(
    (i) => i.paymentTiming === "after_order"
  );
  const atOrderTotal = sumCheckoutFixedTotal(atOrderItems);
  const afterOrderTotal = sumCheckoutFixedTotal(afterOrderItems);
  const accessibleItems = lineItems.filter((i) => !i.isNotAccessible);

  return (
    <div className="pt-8 pb-20">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <BackToCartButton />
          <Eyebrow withLine>CHECKOUT</Eyebrow>
          <Heading as="h1" level="compact">
            ご注文内容の確認
          </Heading>
          <p className="text-sm leading-[1.8] text-secondary">
            お届け先と注文内容を確かめて、「注文を確定する」を押してください。
          </p>
        </div>

        <CheckoutForm
          shippingAddresses={shippingAddresses}
          billingAddresses={billingAddresses}
          hasOutOfStock={hasOutOfStock}
          hasNotAccessible={hasNotAccessible}
          summary={{
            hasAtOrder: atOrderItems.length > 0,
            hasAfterOrder: afterOrderItems.length > 0,
            atOrderTotal,
            afterOrderTotal,
            negotiableCount: accessibleItems.filter((i) => i.unitPrice === null)
              .length,
            fixedTotal: sumCheckoutFixedTotal(lineItems),
          }}
          limitLines={accessibleItems.map(
            ({ productId, unitPrice, quantity }) => ({
              productId,
              unitPrice,
              quantity,
            })
          )}
          paymentFailed={paymentFailed}
          openBillingPortal={openBillingPortalAction}
        >
          <NumberedSection
            id="checkout-items-heading"
            number={2}
            title="ご注文の商品"
          >
            <div className="-mt-3 flex flex-col">
              {atOrderItems.length > 0 && (
                <LineItemGroup
                  title="注文時に支払う商品"
                  badge={<Badge tone="primary">カード</Badge>}
                  subtotal={atOrderTotal}
                  items={atOrderItems}
                />
              )}
              {afterOrderItems.length > 0 && (
                <LineItemGroup
                  title="注文後に請求される商品"
                  badge={<Badge tone="info">請求書</Badge>}
                  subtotal={afterOrderTotal}
                  items={afterOrderItems}
                />
              )}
            </div>
          </NumberedSection>
          <OrderTerms
            hasAtOrder={atOrderItems.length > 0}
            hasAfterOrder={afterOrderItems.length > 0}
          />
        </CheckoutForm>
      </Container>
    </div>
  );
}
