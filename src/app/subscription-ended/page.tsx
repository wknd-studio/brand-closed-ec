import type { ReactNode } from "react";
import { CONTACT, type LegalNoticeValue } from "@/app/legal/legal-notice";
import LegalNoticeText from "@/app/legal/legal-notice-text";
import { Heading } from "@/components/ui/heading";
import { LogoHeader } from "@/components/ui/logo-header";
import { SignOutButton } from "./sign-out-button";

// Stripe 側でサブスクリプションが解約された会員の利用停止の案内（#380）。middleware が
// 利用停止の会員だけをここに通す。再開・退会は運営への連絡で手動対応する（docs/domain/membership.md）
export default function SubscriptionEndedPage() {
  return (
    <div className="flex flex-1 flex-col bg-neutral-50 text-neutral-900">
      <LogoHeader />
      <main className="flex flex-1 justify-center px-4 pt-12 pb-18">
        <div className="flex w-full max-w-[520px] flex-col gap-5 self-start rounded-3xl border border-neutral-200 bg-white p-[clamp(24px,5vw,44px)]">
          <div className="flex flex-col items-center gap-3.5 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M10 9v6M14 9v6" />
              </svg>
            </span>
            <Heading as="h1" level="compact">
              ご契約が終了しました
            </Heading>
            <p className="text-sm leading-[1.9] text-neutral-800">
              月額費用のお支払いが確認できなかったため、ご契約（サブスクリプション）が終了しました。現在、商品の閲覧・ご注文はできません。
            </p>
          </div>

          <section
            aria-labelledby="contact-heading"
            className="flex flex-col gap-3 rounded-2xl bg-neutral-50 p-[18px]"
          >
            <h2 id="contact-heading" className="text-sm font-semibold">
              ご利用の再開・退会をご希望の場合
            </h2>
            <p className="text-[13px] leading-[1.8] text-neutral-700">
              運営までご連絡ください。
            </p>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
              <ContactItem
                label="メール"
                icon={<MailIcon />}
                value={CONTACT.email}
              />
              <ContactItem
                label="電話"
                icon={<PhoneIcon />}
                value={CONTACT.phone}
              />
            </dl>
          </section>

          <SignOutButton />
        </div>
      </main>
    </div>
  );
}

function ContactItem({
  label,
  icon,
  value,
}: {
  label: string;
  icon: ReactNode;
  value: LegalNoticeValue;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5">
      <dt className="inline-flex items-center gap-1.5 text-xs text-neutral-700">
        {icon}
        {label}
      </dt>
      <dd className="text-sm font-semibold break-all">
        <LegalNoticeText value={value} />
      </dd>
    </div>
  );
}

function MailIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}
