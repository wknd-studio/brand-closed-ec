import * as Sentry from "@sentry/nextjs";
import { render } from "@react-email/components";
import { CheckoutPaidMemberEmail } from "@/emails/checkout-paid-member";
import { CheckoutPaidOperatorEmail } from "@/emails/checkout-paid-operator";
import { getResend } from "./client";

type LineItem = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  isNegotiable: boolean;
};

type Params = {
  orderId: string;
  orderedAt: Date;
  memberEmail: string;
  lineItems: LineItem[];
  fixedTotal: number;
};

export async function sendCheckoutPaidEmails({
  orderId,
  orderedAt,
  memberEmail,
  lineItems,
  fixedTotal,
}: Params): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const myPageUrl = `${baseUrl}/orders/${orderId}`;
  const adminOrderUrl = `${baseUrl}/admin/orders/${orderId}`;

  const [memberHtml, operatorHtml] = await Promise.all([
    render(
      CheckoutPaidMemberEmail({
        orderId,
        orderedAt,
        lineItems,
        fixedTotal,
        myPageUrl,
      })
    ),
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
        subject: `【EQ×Mart】お支払いが完了しました（注文番号 ${orderId}）`,
        html: memberHtml,
      })
      .then(({ error }) => {
        if (error) {
          Sentry.captureException(error, {
            tags: { email: "checkout-paid-member" },
            extra: { orderId, memberEmail },
          });
          console.error("[Checkout入金メール/会員] 送信失敗:", error);
        }
      }),
    resend.emails
      .send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: to ?? process.env.RESEND_ADMIN_EMAIL!,
        subject: `【入金確認・手配依頼】${memberEmail} より入金がありました`,
        html: operatorHtml,
      })
      .then(({ error }) => {
        if (error) {
          Sentry.captureException(error, {
            tags: { email: "checkout-paid-operator" },
            extra: { orderId, memberEmail },
          });
          console.error("[Checkout入金メール/運営者] 送信失敗:", error);
        }
      }),
  ]);
}
