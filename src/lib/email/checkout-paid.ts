import { render } from "@react-email/components";
import { CheckoutPaidMemberEmail } from "./templates/checkout-paid-member";
import { CheckoutPaidOperatorEmail } from "./templates/checkout-paid-operator";
import { getResend } from "./index";

type LineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

type Params = {
  orderId: string;
  memberEmail: string;
  lineItems: LineItem[];
};

export async function sendCheckoutPaidEmails({
  orderId,
  memberEmail,
  lineItems,
}: Params): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const myPageUrl = `${baseUrl}/orders/${orderId}`;
  const adminOrderUrl = `${baseUrl}/admin/orders/${orderId}`;

  const [memberHtml, operatorHtml] = await Promise.all([
    render(CheckoutPaidMemberEmail({ orderId, lineItems, myPageUrl })),
    render(
      CheckoutPaidOperatorEmail({
        orderId,
        customerEmail: memberEmail,
        lineItems,
        adminOrderUrl,
      })
    ),
  ]);

  const resend = getResend();
  const to = process.env.RESEND_TEST_TO;

  await Promise.all([
    resend.emails
      .send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: to ?? memberEmail,
        subject: `【注文確定・入金確認】注文番号: ${orderId}`,
        html: memberHtml,
      })
      .then(({ error }) => {
        if (error) console.error("[Checkout入金メール/会員] 送信失敗:", error);
      }),
    resend.emails
      .send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: to ?? process.env.RESEND_ADMIN_EMAIL!,
        subject: `【入金確認・手配依頼】${memberEmail} より入金がありました`,
        html: operatorHtml,
      })
      .then(({ error }) => {
        if (error)
          console.error("[Checkout入金メール/運営者] 送信失敗:", error);
      }),
  ]);
}
