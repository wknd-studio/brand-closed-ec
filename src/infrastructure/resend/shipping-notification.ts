import * as Sentry from "@sentry/nextjs";
import { render } from "@react-email/components";
import { ShippingNotificationEmail } from "@/emails/shipping-notification";
import type { OrderNumber } from "@/domain/value-objects/order-number";
import { getResend } from "./client";

type Params = {
  orderId: string;
  orderNumber: OrderNumber;
  memberEmail: string;
};

export async function sendShippingNotificationEmail({
  orderId,
  orderNumber,
  memberEmail,
}: Params): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const myPageUrl = `${baseUrl}/orders/${orderId}`;

  const html = await render(
    ShippingNotificationEmail({ orderNumber: orderNumber.display(), myPageUrl })
  );

  const resend = getResend();
  const to = process.env.RESEND_TEST_TO;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: to ?? memberEmail,
    subject: `【EQ×Mart】商品を発送しました（注文番号 ${orderNumber.display()}）`,
    html,
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { email: "shipping-notification" },
      extra: { orderId, memberEmail },
    });
    console.error("[発送通知メール] 送信失敗:", error);
  }
}
