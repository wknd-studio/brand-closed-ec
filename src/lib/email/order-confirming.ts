import { render } from "@react-email/components";
import { OrderConfirmingEmail } from "./templates/order-confirming";
import { getResend } from "./index";

type LineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

type SendOrderConfirmingEmailParams = {
  to: string;
  orderId: string;
  lineItems: LineItem[];
};

export async function sendOrderConfirmingEmail({
  to,
  orderId,
  lineItems,
}: SendOrderConfirmingEmailParams): Promise<void> {
  const html = await render(OrderConfirmingEmail({ orderId, lineItems }));

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? to,
    subject: `【ご注文受付】注文番号: ${orderId}`,
    html,
  });

  if (error) {
    console.error("[注文受付メール] 送信失敗:", error);
  }
}
