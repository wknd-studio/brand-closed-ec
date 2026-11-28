import * as Sentry from "@sentry/nextjs";
import { render } from "@react-email/components";
import { CheckoutPaidMemberEmail } from "@/emails/checkout-paid-member";
import type { OrderNumber } from "@/domain/value-objects/order-number";
import { getResend } from "./client";

type LineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

type Params = {
  orderId: string;
  orderNumber: OrderNumber;
  orderedAt: Date;
  memberEmail: string;
  lineItems: LineItem[];
  fixedTotal: number;
};

export async function sendCheckoutPaidEmail({
  orderId,
  orderNumber,
  orderedAt,
  memberEmail,
  lineItems,
  fixedTotal,
}: Params): Promise<void> {
  const myPageUrl = `${process.env.NEXT_PUBLIC_APP_URL!}/orders/${orderId}`;
  const html = await render(
    CheckoutPaidMemberEmail({
      orderNumber: orderNumber.display(),
      orderedAt,
      lineItems,
      fixedTotal,
      myPageUrl,
    })
  );

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? memberEmail,
    subject: `【EQ×Mart】お支払いが完了しました（注文番号 ${orderNumber.display()}）`,
    html,
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { email: "checkout-paid-member" },
      extra: { orderId, memberEmail },
    });
    console.error("[Checkout入金メール/会員] 送信失敗:", error);
  }
}
