import * as Sentry from "@sentry/nextjs";
import { render } from "@react-email/components";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { WelcomeEmail } from "@/emails/welcome";
import { getResend } from "./client";

type Params = {
  to: string;
  rank: MemberRankValue;
  monthlyLimit: number | null;
  initialFee: number;
  monthlyFee: number;
  nextPaymentAt: Date;
  withdrawableFrom: Date;
};

export async function sendWelcomeEmail({ to, ...membership }: Params) {
  const shopUrl = `${process.env.NEXT_PUBLIC_APP_URL!}/shop`;
  const html = await render(WelcomeEmail({ ...membership, shopUrl }));

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: process.env.RESEND_TEST_TO ?? to,
    subject: "【EQ×Mart】ご入会ありがとうございます",
    html,
  });

  if (error) {
    Sentry.captureException(error, {
      tags: { email: "welcome" },
      extra: { to, rank: membership.rank },
    });
    console.error("[入会の完了のメール] 送信失敗:", error);
  }
}
