"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { selectPlan, type SelectPlanResult } from "./actions";
import { PlanSection } from "./plan-section";
import { todayPayment } from "./today-payment";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { RequiredProfileField } from "@/domain/errors/missing-required-profile-fields-error";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";

// トップページの料金表（PLANS）の1行。金額は3桁区切りの表示用の値（税込）
export type SelectablePlan = {
  id: MemberRankValue;
  label: string;
  name: string;
  description: string;
  monthlyFee: string;
  initialFee: string;
  monthlyLimit: string;
};

// エラーのまとめに並べる順（画面の上からの順）
const INDIVIDUAL_FIELDS: RequiredProfileField[] = [
  "lastName",
  "firstName",
  "phoneNumber",
];
const CORPORATE_FIELDS: RequiredProfileField[] = [
  "companyName",
  "invoiceRegistrationNumber",
  ...INDIVIDUAL_FIELDS,
];

export default function PlanSelector({
  isCorporate,
  plans,
  planNote,
  minimumPeriod,
  legalNote,
  children,
}: {
  isCorporate: boolean;
  plans: SelectablePlan[];
  // プランの一覧の下に出す、個別契約のお問い合わせへの案内
  planNote: ReactNode;
  // 申込内容のまとめに出す最低利用期間
  minimumPeriod: ReactNode;
  // 確定ボタンの下に出す、規約・表記へのリンク
  legalNote: ReactNode;
  // 申込みの条件（特定商取引法第12条の6。#724）
  children: ReactNode;
}) {
  const { session } = useClerk();
  const router = useRouter();
  const [state, action, isPending] = useActionState<
    SelectPlanResult | null,
    FormData
  >(selectPlan, null);

  const failed = state && "values" in state ? state : null;
  const values = failed?.values;
  const fieldErrors = failed?.fieldErrors;

  const [planId, setPlanId] = useState(values?.plan);
  const selectedPlan = plans.find(({ id }) => id === planId);

  // ブラウザが戻る・再読み込みで radio の選択を復元したときは onChange が呼ばれないため、
  // 表示した時点で選ばれているプランをまとめに反映する
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const checked = formRef.current?.querySelector<HTMLInputElement>(
      'input[name="plan"]:checked'
    );
    if (checked) setPlanId(checked.value);
  }, []);

  const errorSummaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 確定ボタンが画面の下にあっても、エラーのまとめが見えるようにする
    if (failed) errorSummaryRef.current?.focus();
  }, [failed]);

  useEffect(() => {
    if (state && "redirectTo" in state) {
      // DB が正なので即遷移。session.reload() はClerkのセッション（JWT）を
      // 最新の状態に揃えるためにバックグラウンドで行う
      router.push(state.redirectTo);
      session?.reload();
    }
  }, [state, session, router]);

  const errorFields = (isCorporate ? CORPORATE_FIELDS : INDIVIDUAL_FIELDS)
    .map((field) => ({ field, message: fieldErrors?.[field] }))
    .filter((e): e is { field: RequiredProfileField; message: string } =>
      Boolean(e.message)
    );

  // 入力欄へのリンクは、移るだけでなくその入力欄にフォーカスを当てる
  function focusField(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    document.getElementById(id)?.focus();
  }

  return (
    <>
      {(errorFields.length > 0 || failed?.error) && (
        <Alert ref={errorSummaryRef} tone="danger" role="alert" tabIndex={-1}>
          {errorFields.length > 0 && <p>入力内容をご確認ください。</p>}
          {errorFields.length > 0 && (
            <ul className="flex flex-col gap-1">
              {errorFields.map(({ field, message }) => (
                <li key={field}>
                  <a
                    href={`#${field}`}
                    onClick={(event) => focusField(event, field)}
                    className="underline"
                  >
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {failed?.error && <p>{failed.error}</p>}
        </Alert>
      )}
      <form
        ref={formRef}
        action={action}
        className="flex flex-wrap items-start gap-6"
      >
        {isCorporate && (
          <input type="hidden" name="accountType" value="corporate" />
        )}
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <PlanSection id="plan-heading" number={1} title="プランを選ぶ">
            <p className="-mt-3.5 text-[0.8125rem] leading-[1.7] text-secondary">
              月間の仕入れ上限に合わせてお選びください。上限までは、対象商品を卸価格で購入できます。
            </p>
            <fieldset>
              <legend className="sr-only">プラン</legend>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                {plans.map((plan) => (
                  <label
                    key={plan.id}
                    className="flex cursor-pointer flex-col gap-2 rounded-2xl border-[1.5px] border-neutral-200 bg-white p-4 has-checked:border-primary has-checked:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-primary)_7%,white),white_55%)] has-checked:shadow-[0_10px_24px_-14px_color-mix(in_srgb,var(--color-primary)_50%,transparent)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-[0.6875rem] tracking-[0.12em] text-secondary">
                        {plan.label}
                      </span>
                      <input
                        type="radio"
                        name="plan"
                        value={plan.id}
                        required
                        defaultChecked={values?.plan === plan.id}
                        onChange={() => setPlanId(plan.id)}
                        className="size-[18px] accent-primary focus-visible:outline-none"
                      />
                    </span>
                    <span className="font-display text-[1.0625rem] font-semibold">
                      {plan.name}
                    </span>
                    <span className="min-h-[3.2em] text-xs leading-[1.6] text-secondary">
                      {plan.description}
                    </span>
                    <span className="text-[1.375rem] font-bold tabular-nums">
                      <span className="text-[0.8125rem] font-medium">¥</span>
                      {plan.monthlyFee}
                      <span className="text-xs font-normal text-secondary">
                        {" "}
                        / 月
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-secondary">
                      初期費用 ¥{plan.initialFee}
                    </span>
                    <span className="flex flex-col gap-0.5 rounded-lg bg-neutral-50 px-2.5 py-2">
                      <span className="text-[0.6875rem] text-secondary">
                        月間仕入れ上限
                      </span>
                      <span className="text-sm font-semibold tabular-nums">
                        ¥{plan.monthlyLimit}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {planNote}
          </PlanSection>

          <PlanSection
            id="profile-heading"
            number={2}
            title={isCorporate ? "法人とご担当者の情報" : "お客様情報"}
          >
            {isCorporate && (
              <div className="flex flex-col gap-4">
                <SubHeading>法人情報</SubHeading>
                <FormField
                  id="companyName"
                  label="会社名"
                  required
                  error={fieldErrors?.companyName}
                >
                  {(field) => (
                    <Input
                      name="companyName"
                      required
                      autoComplete="organization"
                      defaultValue={values?.companyName}
                      className="h-11 w-full rounded-lg text-base"
                      {...field}
                    />
                  )}
                </FormField>
                <FormField
                  id="invoiceRegistrationNumber"
                  label="適格請求書発行事業者登録番号"
                  required
                  hint="「T」と13桁の数字"
                  error={fieldErrors?.invoiceRegistrationNumber}
                >
                  {(field) => (
                    <Input
                      name="invoiceRegistrationNumber"
                      required
                      placeholder="T1234567890123"
                      defaultValue={values?.invoiceRegistrationNumber}
                      className="h-11 w-full max-w-80 rounded-lg text-base"
                      {...field}
                    />
                  )}
                </FormField>
                <div className="h-px bg-neutral-200" />
                <SubHeading>ご担当者</SubHeading>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                id="lastName"
                label="姓"
                required
                error={fieldErrors?.lastName}
              >
                {(field) => (
                  <Input
                    name="lastName"
                    required
                    autoComplete="family-name"
                    defaultValue={values?.lastName}
                    className="h-11 w-full min-w-0 rounded-lg text-base"
                    {...field}
                  />
                )}
              </FormField>
              <FormField
                id="firstName"
                label="名"
                required
                error={fieldErrors?.firstName}
              >
                {(field) => (
                  <Input
                    name="firstName"
                    required
                    autoComplete="given-name"
                    defaultValue={values?.firstName}
                    className="h-11 w-full min-w-0 rounded-lg text-base"
                    {...field}
                  />
                )}
              </FormField>
            </div>
            <FormField
              id="phoneNumber"
              label="電話番号"
              required
              hint="ハイフンはあってもなくてもかまいません"
              error={fieldErrors?.phoneNumber}
            >
              {(field) => (
                <Input
                  type="tel"
                  name="phoneNumber"
                  required
                  autoComplete="tel"
                  placeholder="090-1234-5678"
                  defaultValue={values?.phoneNumber}
                  className="h-11 w-full max-w-80 rounded-lg text-base"
                  {...field}
                />
              )}
            </FormField>
          </PlanSection>

          {children}
        </div>

        <aside
          aria-label="お申し込み内容"
          className="sticky top-6 flex min-w-0 flex-[1_1_300px] flex-col gap-[18px] rounded-3xl border-[1.5px] border-primary bg-white p-6 shadow-[0_18px_40px_-24px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]"
        >
          <PaymentSummary plan={selectedPlan} minimumPeriod={minimumPeriod} />
          <Button type="submit" disabled={isPending} className="w-full gap-2">
            {isPending ? "処理中..." : "お支払いへ進む"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Button>
          <p className="flex items-start gap-2 text-xs leading-[1.7] text-secondary">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              className="mt-[3px] shrink-0"
            >
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            Stripe の決済画面で、クレジットカードでお支払いいただきます。
          </p>
          {legalNote}
        </aside>
      </form>
    </>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-[0.08em] text-secondary">
      {children}
    </p>
  );
}

// 選んだプランの、本日のお支払いと2ヶ月目以降の月額
function PaymentSummary({
  plan,
  minimumPeriod,
}: {
  plan: SelectablePlan | undefined;
  minimumPeriod: ReactNode;
}) {
  if (!plan) {
    return (
      <p className="text-sm leading-[1.7] text-secondary">
        プランを選ぶと、本日のお支払いの金額をここに表示します。
      </p>
    );
  }
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-secondary">選択中のプラン</span>
        <span className="font-display text-xl font-semibold">
          {plan.label}（{plan.name}）
        </span>
        <span className="text-xs tabular-nums text-secondary">
          月間仕入れ上限 ¥{plan.monthlyLimit}
        </span>
      </div>
      <div className="h-px bg-neutral-200" />
      <dl className="flex flex-col gap-2 text-[0.8125rem] tabular-nums">
        <div className="flex justify-between">
          <dt className="text-neutral-700">初期費用</dt>
          <dd>¥{plan.initialFee}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-700">初月の月額</dt>
          <dd>¥{plan.monthlyFee}</dd>
        </div>
        <div className="mt-1 flex items-baseline justify-between border-t border-neutral-200 pt-2.5">
          <dt className="font-semibold">本日のお支払い</dt>
          <dd className="text-2xl font-bold">¥{todayPayment(plan)}</dd>
        </div>
        <div className="flex justify-between text-xs text-secondary">
          <dt>2ヶ月目以降</dt>
          <dd>毎月 ¥{plan.monthlyFee}</dd>
        </div>
      </dl>
      <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-xs leading-[1.7] text-neutral-700">
        {minimumPeriod}
      </p>
    </>
  );
}
