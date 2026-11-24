import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Steps } from "@/components/ui/steps";
import { cn } from "@/lib/cn";
import { ONBOARDING_STEPS } from "@/app/onboarding/onboarding-steps";

// 決済のあとの画面（確定待ち・キャンセル・準備失敗）の共通の形。
// ステップ表示の下のカードに、アイコン・見出し・説明・ボタンを中央寄せで並べる
export function PaymentResultLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 justify-center px-4 pt-10 pb-18">
      <div className="flex w-full max-w-[560px] flex-col gap-7">
        <Steps steps={ONBOARDING_STEPS} current={2} />
        <Card className="flex flex-col items-center gap-5 rounded-3xl p-[clamp(28px,5vw,44px)] text-center">
          {children}
        </Card>
      </div>
    </main>
  );
}

const ICONS = {
  // 決済が完了した
  check: {
    className: "bg-gradient-to-br from-primary-light to-primary text-white",
    path: (
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    ),
  },
  // 確定に時間がかかっている
  clock: {
    className: "bg-neutral-100 text-primary",
    path: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  // 決済されなかった（キャンセル）
  card: {
    className: "bg-neutral-100 text-neutral-700",
    path: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </>
    ),
  },
  // 失敗した
  alert: {
    className:
      "bg-[color-mix(in_srgb,var(--color-danger)_6%,white)] text-danger",
    path: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 16.5v.5" />
      </>
    ),
  },
} as const;

export function PaymentResultIcon({ kind }: { kind: keyof typeof ICONS }) {
  const icon = ICONS[kind];
  return (
    <span
      className={cn(
        "inline-flex size-16 items-center justify-center rounded-full",
        icon.className
      )}
    >
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {icon.path}
      </svg>
    </span>
  );
}

export function PaymentResultTitle({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" level="compact" className="leading-[1.5]">
      {children}
    </Heading>
  );
}

export function PaymentResultText({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-[1.8] text-neutral-700">{children}</p>;
}

// キャンセル・準備失敗では料金が発生していないため、種別の選択からやり直してもらう。
// /onboarding/plan は accountType クエリを必須とし、欠けていると種別の選択へ
// 送り返す（plan/page.tsx参照）ため、戻り先は種別の選択にする
export function RestartApplicationLink({ note }: { note: ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <Link
        href="/onboarding/account-type"
        className={cn(buttonVariants(), "w-full max-w-80")}
      >
        お申し込みをやり直す
      </Link>
      <span className="text-xs text-secondary">{note}</span>
    </div>
  );
}
