import * as Sentry from "@sentry/nextjs";
import { render } from "@react-email/components";
import { LimitExceededMemberEmail } from "@/emails/limit-exceeded-member";
import { getResend } from "./client";

type Params = {
  to: string;
  orderId: string;
};

export async function sendLimitExceededEmail({
  to,
  orderId,
}: Params): Promise<void> {
  const myPageUrl = `${process.env.NEXT_PUBLIC_APP_URL!}/orders/${orderId}`;
  const html = await render(LimitExceededMemberEmail({ orderId, myPageUrl }));

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? to,
    subject: `【EQ×Mart】ご注文を保留しています（注文番号 ${orderId}）`,
    html,
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { email: "limit-exceeded" },
      extra: { orderId, to },
    });
    console.error("[上限超過メール] 送信失敗:", error);
  }
}
