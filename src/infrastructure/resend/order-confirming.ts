import * as Sentry from "@sentry/nextjs";
import { render } from "@react-email/components";
import { OrderConfirmingEmail } from "@/emails/order-confirming";
import type { OrderNumber } from "@/domain/value-objects/order-number";
import { getResend } from "./client";

type LineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

type SendOrderConfirmingEmailParams = {
  to: string;
  orderId: string;
  orderNumber: OrderNumber;
  orderedAt: Date;
  lineItems: LineItem[];
  fixedTotal: number;
};

export async function sendOrderConfirmingEmail({
  to,
  orderId,
  orderNumber,
  orderedAt,
  lineItems,
  fixedTotal,
}: SendOrderConfirmingEmailParams): Promise<void> {
  const myPageUrl = `${process.env.NEXT_PUBLIC_APP_URL!}/orders/${orderId}`;
  const html = await render(
    OrderConfirmingEmail({
      orderNumber: orderNumber.display(),
      orderedAt,
      lineItems,
      fixedTotal,
      myPageUrl,
    })
  );

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? to,
    subject: `【EQ×Mart】ご注文を受け付けました（注文番号 ${orderNumber.display()}）`,
    html,
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { email: "order-confirming" },
      extra: { orderId, to },
    });
    console.error("[注文受付メール] 送信失敗:", error);
  }
}
