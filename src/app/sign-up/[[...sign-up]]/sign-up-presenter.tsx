"use client";

import { useId } from "react";
import { SignUp, useSignUp } from "@clerk/nextjs";
import LegalLinksNote from "@/app/legal/legal-links-note";
import { OnboardingHeader } from "@/app/onboarding/onboarding-header";
import { clerkAppearance } from "@/components/auth/clerk-appearance";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

const signUpAppearance = {
  ...clerkAppearance,
  elements: {
    ...clerkAppearance.elements,
    // 共通の指定のうち!の無いもの（影・枠・余白）はClerkのスタイルに負け、
    // カードの中にClerkのカードが重なって見えるため、ここでは!を付けて打ち消す
    cardBox: cn(
      clerkAppearance.elements.cardBox,
      "!overflow-visible !rounded-none !border-none !shadow-none"
    ),
    card: cn(
      clerkAppearance.elements.card,
      "!overflow-visible !border-none !bg-transparent !p-0 !shadow-none"
    ),
    // 上のメールアドレス欄（自前のInput）と角丸を揃える
    formFieldInput: cn(clerkAppearance.elements.formFieldInput, "!rounded-md"),
    footer: cn(clerkAppearance.elements.footer, "!bg-none !bg-transparent"),
    // 見出し・説明文はカードの上部に自前で出すため、Clerkのものは隠す
    header: "!hidden",
    // サインアップ画面の「アカウントをお持ちの方はサインイン」リンクは、
    // 遷移先の/sign-inにticketパラメータが引き継がれ、Clerk側がサインアップへ
    // 自動的に引き戻してしまう(既知の挙動)ため非表示にする
    footerAction: "!hidden",
    formFieldCheckboxInput: "accent-primary",
  },
};

const FLOW_AFTER_SIGN_UP = [
  "個人・法人のどちらで使うかを選ぶ",
  "プランを選び、お客様情報を入力する",
  "クレジットカードでお支払い",
];

export function SignUpPresenter() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      <OnboardingHeader withSignOut={false} />
      <main className="flex flex-1 justify-center px-4 pt-14 pb-16">
        <div className="flex w-full max-w-[440px] flex-col gap-5">
          <Card className="flex flex-col gap-6 rounded-3xl p-[clamp(28px,5vw,40px)]">
            <div className="flex flex-col items-center gap-2.5 text-center">
              <Eyebrow withLine>INVITATION</Eyebrow>
              <Heading as="h1" level="compact">
                会員登録
              </Heading>
              <p className="text-sm leading-[1.8] text-secondary">
                招待を受けたメールアドレスで、
                <br />
                ログイン用のパスワードを設定してください。
              </p>
            </div>
            <InvitedEmailField />
            <SignUp appearance={signUpAppearance} />
            <FlowAfterSignUp />
          </Card>
          <div className="text-center">
            <LegalLinksNote action="ご登録" />
          </div>
        </div>
      </main>
    </div>
  );
}

// 招待（ticket）の流れでは、Clerkの登録フォームはメールアドレス欄を出さない
// （宛先は招待で決まっていて変更できない）。どの宛先で登録するのかが分かるよう、
// Clerkの登録の状態から読んで、変更できない欄として出す
function InvitedEmailField() {
  const { signUp } = useSignUp();
  const id = useId();
  const hintId = `${id}-hint`;
  const emailAddress = signUp?.emailAddress;
  if (!emailAddress) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        メールアドレス
      </label>
      <Input
        id={id}
        type="email"
        value={emailAddress}
        readOnly
        aria-describedby={hintId}
        className="border-neutral-200 bg-neutral-100 text-neutral-700"
      />
      <span id={hintId} className="text-xs text-secondary">
        招待メールの宛先が入っています（変更できません）
      </span>
    </div>
  );
}

function FlowAfterSignUp() {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-neutral-50 px-4 py-4">
      <span className="text-xs font-semibold text-neutral-700">
        このあとの流れ
      </span>
      <ol className="flex flex-col gap-2 text-[13px] text-neutral-700">
        {FLOW_AFTER_SIGN_UP.map((label, index) => (
          <li key={label} className="flex items-center gap-2.5">
            <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border border-neutral-300 text-[11px]">
              {index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}
