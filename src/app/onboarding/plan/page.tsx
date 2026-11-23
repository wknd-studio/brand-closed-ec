import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import LegalLinksNote from "@/app/legal/legal-links-note";
import LegalNoticeText from "@/app/legal/legal-notice-text";
import {
  MEMBERSHIP_TERMS,
  type LegalNoticeValue,
} from "@/app/legal/legal-notice";
import { PLANS } from "@/app/home-presenter";
import PlanSelector, { type PlanFee } from "./plan-selector";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";

// 料金はトップページのプラン比較表と同じ値を出す
const PLAN_FEES = Object.fromEntries(
  PLANS.map(({ id, monthlyFee, initialFee }) => [
    id,
    { monthlyFee, initialFee },
  ])
) as Record<MemberRankValue, PlanFee>;

/**
 * 入会（月額プランの申込み）の最終確認画面に出す、対価・支払い・契約期間・解約の条件
 * （特定商取引法第12条の6。#724）。この画面の確定ボタンのあと Stripe Checkout へ進む
 */
function MembershipTerms() {
  const rows: { label: string; value: LegalNoticeValue }[] = [
    { label: "月額・初期費用", value: MEMBERSHIP_TERMS.price },
    { label: "お支払い方法", value: MEMBERSHIP_TERMS.paymentMethod },
    { label: "お支払い時期", value: MEMBERSHIP_TERMS.paymentTiming },
    { label: "契約期間", value: MEMBERSHIP_TERMS.contractPeriod },
    { label: "解約（退会）", value: MEMBERSHIP_TERMS.cancellation },
  ];
  return (
    <section aria-labelledby="membership-terms-heading" className="space-y-3">
      <h2
        id="membership-terms-heading"
        className="text-sm font-medium text-gray-700"
      >
        お申し込みの条件
      </h2>
      <dl className="divide-y rounded-lg border text-sm">
        {rows.map(({ label, value }) => (
          <div
            key={label}
            className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr]"
          >
            <dt className="text-gray-500">{label}</dt>
            <dd>
              <LegalNoticeText value={value} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function OnboardingPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ accountType?: string }>;
}) {
  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  const { accountType } = await searchParams;

  // member_typeが確定するのはこの画面の送信時（それ以前はusersの行がまだ
  // 無く、member_type='corporate'はcompany_name必須のCHECK制約があるため
  // 会社名の入力前には保存できない）。そのため個人/法人の選択は
  // クエリパラメータだけで引き継いでおり、クエリが欠けたまま表示すると
  // 「法人として登録」を選んだ会員でも法人情報の入力欄が消え、個人として
  // 登録されてしまう。欠落・不正な場合は種別選択をやり直させる
  if (accountType !== "individual" && accountType !== "corporate") {
    redirect("/onboarding/account-type");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">プランを選択してください</h1>
        <PlanSelector
          isCorporate={accountType === "corporate"}
          fees={PLAN_FEES}
        >
          <MembershipTerms />
        </PlanSelector>
        <LegalLinksNote action="お申し込み" />
      </div>
    </main>
  );
}
