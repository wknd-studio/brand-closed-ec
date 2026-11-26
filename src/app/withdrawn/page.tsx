import { OnboardingHeader } from "@/app/onboarding/onboarding-header";
import { SignOutToTopButton } from "./sign-out-to-top-button";

export default function WithdrawnPage() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      {/* 退会済みでログアウトの導線は「トップへ戻る」にまとめるため、ロゴだけにする */}
      <OnboardingHeader withSignOut={false} />
      <main className="flex flex-1 justify-center px-4 pt-14 pb-18">
        <div className="flex w-full max-w-[480px] flex-col items-center gap-4 self-start rounded-3xl border border-neutral-200 bg-white p-[clamp(28px,5vw,44px)] text-center">
          <span className="inline-flex size-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <h1 className="font-display text-[26px] leading-normal font-semibold">
            退会が完了しました
          </h1>
          <p className="text-sm leading-[1.8] text-neutral-700">
            ご利用いただきありがとうございました。
            <br />
            サブスクリプションは解約済みです。
          </p>
          <SignOutToTopButton />
        </div>
      </main>
    </div>
  );
}
