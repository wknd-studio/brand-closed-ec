import * as Sentry from "@sentry/nextjs";
import { render } from "@react-email/components";
import { OrderOperatorNotificationEmail } from "./templates/order-operator-notification";
import { getResend } from "./index";

type LineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

type SendOrderOperatorNotificationParams = {
  orderId: string;
  customerEmail: string;
  lineItems: LineItem[];
};

export async function sendOrderOperatorNotification({
  orderId,
  customerEmail,
  lineItems,
}: SendOrderOperatorNotificationParams): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const adminOrderUrl = `${baseUrl}/admin/orders/${orderId}`;

  const html = await render(
    OrderOperatorNotificationEmail({
      orderId,
      customerEmail,
      lineItems,
      adminOrderUrl,
    })
  );

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? process.env.RESEND_ADMIN_EMAIL!,
    subject: `【新規注文】${customerEmail} より注文が入りました`,
    html,
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { email: "order-operator-notification" },
      extra: { orderId, customerEmail },
    });
    console.error("[運営者通知メール] 送信失敗:", error);
  }
}
