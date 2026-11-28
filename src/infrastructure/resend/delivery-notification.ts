import * as Sentry from "@sentry/nextjs";
import { render } from "@react-email/components";
import { DeliveryNotificationEmail } from "@/emails/delivery-notification";
import type { OrderNumber } from "@/domain/value-objects/order-number";
import { getResend } from "./client";

type Params = {
  orderId: string;
  orderNumber: OrderNumber;
  memberEmail: string;
};

export async function sendDeliveryNotificationEmail({
  orderId,
  orderNumber,
  memberEmail,
}: Params): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const myPageUrl = `${baseUrl}/orders/${orderId}`;

  const html = await render(
    DeliveryNotificationEmail({ orderNumber: orderNumber.display(), myPageUrl })
  );

  const resend = getResend();
  const to = process.env.RESEND_TEST_TO;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: to ?? memberEmail,
    subject: `【EQ×Mart】お届けが完了しました（注文番号 ${orderNumber.display()}）`,
    html,
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { email: "delivery-notification" },
      extra: { orderId, memberEmail },
    });
    console.error("[配送完了通知メール] 送信失敗:", error);
  }
}
