import * as Sentry from "@sentry/nextjs";
import { render } from "@react-email/components";
import { WithdrawnEmail } from "@/emails/withdrawn";
import { getResend } from "./client";

type Params = {
  to: string;
  withdrawnAt: Date;
  subscriptionCancelled: boolean;
};

export async function sendWithdrawnEmail({ to, ...withdrawal }: Params) {
  const html = await render(WithdrawnEmail(withdrawal));

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? to,
    subject: "【EQ×Mart】退会の手続きが完了しました",
    html,
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { email: "withdrawn" },
      extra: { to },
    });
    console.error("[退会の完了のメール] 送信失敗:", error);
  }
}
