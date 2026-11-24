"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChoiceCard } from "@/components/ui/choice-card";
import { selectAccountType, type SelectAccountTypeResult } from "./actions";

type AccountType = "individual" | "corporate";

const CHOICES: {
  value: AccountType;
  title: string;
  body: string;
  fields: string;
  nextLabel: string;
  icon: ReactNode;
}[] = [
  {
    value: "individual",
    title: "個人として登録",
    body: "個人事業主・副業など、個人の名義でご利用の方。",
    fields: "お名前・電話番号",
    nextLabel: "個人として次へ",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
      </>
    ),
  },
  {
    value: "corporate",
    title: "法人として登録",
    body: "会社の名義でご利用の方。",
    fields: "ご担当者のお名前・電話番号、会社名、適格請求書発行事業者登録番号",
    nextLabel: "法人として次へ",
    icon: (
      <>
        <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
        <path d="M15 10h4a1 1 0 0 1 1 1v10" />
        <path d="M8 8h3M8 12h3M8 16h3" />
        <path d="M2 21h20" />
      </>
    ),
  },
];

export default function AccountTypeForm() {
  const router = useRouter();
  const [state, action, isPending] = useActionState<
    SelectAccountTypeResult | null,
    FormData
  >(selectAccountType, null);
  const [picked, setPicked] = useState<AccountType>("individual");

  useEffect(() => {
    if (state) router.push(state.redirectTo);
  }, [state, router]);

  const nextLabel = CHOICES.find((c) => c.value === picked)?.nextLabel;

  return (
    <form action={action} className="flex flex-col gap-7">
      <fieldset>
        <legend className="sr-only">ご利用の種別</legend>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {CHOICES.map((choice) => (
            <ChoiceCard key={choice.value} className="gap-3 p-[22px]">
              <span className="flex items-start justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700 group-has-checked:bg-primary group-has-checked:text-white">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {choice.icon}
                  </svg>
                </span>
                {/* カード全体の文言ではなく種別の名前だけを読み上げさせ、説明は補足として結び付ける */}
                <input
                  type="radio"
                  name="accountType"
                  value={choice.value}
                  checked={picked === choice.value}
                  onChange={() => setPicked(choice.value)}
                  aria-labelledby={`account-type-${choice.value}-title`}
                  aria-describedby={`account-type-${choice.value}-body account-type-${choice.value}-fields`}
                  className="m-0 h-5 w-5 accent-primary focus-visible:outline-none"
                />
              </span>
              <span
                id={`account-type-${choice.value}-title`}
                className="font-display text-[19px] font-semibold"
              >
                {choice.title}
              </span>
              <span
                id={`account-type-${choice.value}-body`}
                className="text-[13px] leading-[1.7] text-neutral-700"
              >
                {choice.body}
              </span>
              <span
                id={`account-type-${choice.value}-fields`}
                className="border-t border-neutral-200 pt-3 text-xs leading-[1.7] text-secondary"
              >
                次の画面で入力する項目
                <br />
                {choice.fields}
              </span>
            </ChoiceCard>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-center">
        <Button
          type="submit"
          disabled={isPending}
          className="w-full max-w-[320px]"
        >
          {isPending ? "処理中..." : nextLabel}
        </Button>
      </div>
    </form>
  );
}
