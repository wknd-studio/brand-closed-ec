import { render } from "@react-email/components";
import { DeliveryNotificationEmail } from "./templates/delivery-notification";
import { getResend } from "./index";

type Params = {
  orderId: string;
  memberEmail: string;
};

export async function sendDeliveryNotificationEmail({
  orderId,
  memberEmail,
}: Params): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const myPageUrl = `${baseUrl}/orders/${orderId}`;

  const html = await render(DeliveryNotificationEmail({ orderId, myPageUrl }));

  const resend = getResend();
  const to = process.env.RESEND_TEST_TO;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: to ?? memberEmail,
    subject: `【配送完了】注文番号: ${orderId}`,
    html,
  });

  if (error) console.error("[配送完了通知メール] 送信失敗:", error);
}
