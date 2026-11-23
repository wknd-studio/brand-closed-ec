"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTACT } from "@/app/legal/legal-notice";
import {
  PaymentResultIcon,
  PaymentResultText,
  PaymentResultTitle,
} from "@/app/onboarding/payment/payment-result";
import { Eyebrow } from "@/components/ui/eyebrow";
import { isOnboardingCompleted } from "./actions";
import { pollOnboardingStatus } from "./poll-onboarding-status";

export default function OnboardingStatusPoller() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(
    () =>
      pollOnboardingStatus({
        check: isOnboardingCompleted,
        onCompleted: () => router.replace("/shop"),
        onTimeout: () => setTimedOut(true),
      }),
    [router]
  );

  // 確定前・タイムアウト後とも、プラン選択や決済画面へ戻る導線は出さない。
  // 決済は完了しているため、再決済するとサブスクリプションが2本でき二重課金になる
  if (timedOut) {
    return (
      <>
        <PaymentResultIcon kind="clock" />
        <PaymentResultTitle>
          アカウントの準備に
          <br />
          時間がかかっています
        </PaymentResultTitle>
        <div className="flex w-full items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--color-success)_25%,white)] bg-[color-mix(in_srgb,var(--color-success)_6%,white)] px-4 py-3.5 text-left text-sm leading-[1.7] text-green-900">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-success"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          <span>
            <strong>お支払いは完了しています。</strong>
            もう一度お支払いいただく必要はありません。
          </span>
        </div>
        <PaymentResultText>
          しばらくしてから、もう一度ログインしてください。
          <br />
          それでもご利用いただけない場合は、
          <a
            href={`mailto:${CONTACT.email.text}`}
            className="underline hover:text-primary"
          >
            お問い合わせ
          </a>
          ください。
        </PaymentResultText>
      </>
    );
  }

  return (
    <>
      <PaymentResultIcon kind="check" />
      <Eyebrow withLine>THANK YOU</Eyebrow>
      <PaymentResultTitle>お支払いが完了しました</PaymentResultTitle>
      <div
        role="status"
        className="flex w-full flex-col items-center gap-3.5 rounded-xl bg-neutral-50 px-5 py-[18px]"
      >
        <span className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
            className="animate-spin text-primary motion-reduce:animate-none"
          >
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
          アカウントを準備しています
        </span>
        <span className="text-[13px] leading-[1.8] text-neutral-700">
          完了すると、自動でショップへ進みます。
          <br />
          このままお待ちください。
        </span>
      </div>
    </>
  );
}
