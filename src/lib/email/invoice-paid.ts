import { render } from "@react-email/components";
import { InvoicePaidOperatorEmail } from "./templates/invoice-paid-operator";
import { getResend } from "./index";

type Params = {
  orderId: string;
  memberEmail: string;
};

export async function sendInvoicePaidEmail({
  orderId,
  memberEmail,
}: Params): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const adminOrderUrl = `${baseUrl}/admin/orders/${orderId}`;

  const html = await render(
    InvoicePaidOperatorEmail({
      orderId,
      customerEmail: memberEmail,
      adminOrderUrl,
    })
  );

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? process.env.RESEND_ADMIN_EMAIL!,
    subject: `【Invoice入金確認】${memberEmail} より入金がありました`,
    html,
  });

  if (error) console.error("[Invoice入金メール/運営者] 送信失敗:", error);
}
