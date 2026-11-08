import * as Sentry from "@sentry/nextjs";
import { render } from "@react-email/components";
import { LimitExceededMemberEmail } from "./templates/limit-exceeded-member";
import { getResend } from "./index";

type Params = {
  to: string;
  orderId: string;
};

export async function sendLimitExceededEmail({
  to,
  orderId,
}: Params): Promise<void> {
  const html = await render(LimitExceededMemberEmail({ orderId }));

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? to,
    subject: `【月次仕入れ上限超過】注文番号: ${orderId}`,
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
