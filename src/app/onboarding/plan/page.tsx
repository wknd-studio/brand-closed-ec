import Link from "next/link";
import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import LegalLinksNote from "@/app/legal/legal-links-note";
import LegalNoticeText from "@/app/legal/legal-notice-text";
import {
  CONTACT,
  MEMBERSHIP_TERMS,
  type LegalNoticeValue,
} from "@/app/legal/legal-notice";
import { PLANS } from "@/app/home-presenter";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";
import { NumberedSection } from "@/components/ui/numbered-section";
import { Steps } from "@/components/ui/steps";
import {
  MemberRank,
  type MemberRankValue,
} from "@/domain/value-objects/member-rank";
import PlanSelector from "./plan-selector";

const SELF_SERVICE_RANKS: readonly MemberRankValue[] =
  MemberRank.selfServiceRanks();

// 料金・上限・説明はトップページの料金表と同じ出どころ（PLANS）から出す。
// 申込みで選べるのは、個別契約（ENTERPRISE）を除いたプラン
const SELECTABLE_PLANS = PLANS.filter(({ id }) =>
  SELF_SERVICE_RANKS.includes(id)
);
const ENTERPRISE = PLANS.find(({ id }) => !SELF_SERVICE_RANKS.includes(id));

const ACCOUNT_TYPE_LABELS = { individual: "個人", corporate: "法人" };

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
    <NumberedSection
      id="membership-terms-heading"
      number={3}
      title="お申し込みの条件"
    >
      <dl className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 text-[0.8125rem] leading-[1.75]">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
            <dt className="flex-[0_0_8.5rem] text-secondary">{label}</dt>
            <dd className="min-w-0 flex-[1_1_260px]">
              <LegalNoticeText value={value} />
            </dd>
          </div>
        ))}
      </dl>
    </NumberedSection>
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
    <main className="flex-1 pt-10 pb-[72px]">
      <Container className="flex flex-col gap-7">
        <Steps
          steps={["ご利用の種別", "プラン・お客様情報", "お支払い"]}
          current={1}
          className="mx-auto w-full max-w-[680px]"
        />
        <div className="flex flex-col gap-2.5">
          <Link
            href="/onboarding/account-type"
            className="self-start text-[0.8125rem] text-secondary hover:text-primary"
          >
            ← ご利用の種別に戻る（{ACCOUNT_TYPE_LABELS[accountType]}を選択中）
          </Link>
          <Eyebrow withLine>STEP 2 / 3</Eyebrow>
          <Heading as="h1" level="compact">
            プランとお客様情報
          </Heading>
          <p className="text-sm leading-[1.8] text-secondary">
            金額はすべて税込です。内容を確かめて「お支払いへ進む」を押すと、決済画面に移ります。
          </p>
        </div>
        <PlanSelector
          isCorporate={accountType === "corporate"}
          plans={SELECTABLE_PLANS}
          planNote={
            ENTERPRISE && (
              <p className="text-xs text-secondary">
                上限が{ENTERPRISE.monthlyLimit}の {ENTERPRISE.label}（
                {ENTERPRISE.name}）をご希望の場合は、
                <a
                  href={`mailto:${CONTACT.email.text}`}
                  className="text-neutral-900 underline hover:text-primary"
                >
                  お問い合わせ
                </a>
                ください。
              </p>
            )
          }
          minimumPeriod={
            <LegalNoticeText value={MEMBERSHIP_TERMS.minimumPeriodSummary} />
          }
          legalNote={<LegalLinksNote action="お申し込み" />}
        >
          <MembershipTerms />
        </PlanSelector>
      </Container>
    </main>
  );
}
