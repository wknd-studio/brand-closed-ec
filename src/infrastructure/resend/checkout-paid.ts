import * as Sentry from "@sentry/nextjs";
import { render } from "@react-email/components";
import { CheckoutPaidMemberEmail } from "@/emails/checkout-paid-member";
import { getResend } from "./client";

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

export async function sendCheckoutPaidEmail({
  orderId,
  memberEmail,
  lineItems,
}: Params): Promise<void> {
  const myPageUrl = `${process.env.NEXT_PUBLIC_APP_URL!}/orders/${orderId}`;
  const html = await render(
    CheckoutPaidMemberEmail({ orderId, lineItems, myPageUrl })
  );

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? memberEmail,
    subject: `【注文確定・入金確認】注文番号: ${orderId}`,
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
