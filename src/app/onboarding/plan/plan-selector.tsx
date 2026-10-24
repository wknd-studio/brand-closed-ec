"use client";

import { useActionState, useEffect } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { selectPlan, type SelectPlanResult } from "./actions";
import { RANK_ORDER } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";

// 表示ラベル・説明はdocs/archive/service-spec.mdの「プラン概要」表と一致させる。
// 対象プランの一覧自体はRANK_ORDER（enterpriseを除く）から動的に生成する。
const PLAN_LABELS: Record<
  MemberRankValue,
  { label: string; description: string }
> = {
  starter: {
    label: "STARTER",
    description: "入門プラン（副業・お試し層向け）",
  },
  basic: {
    label: "BASIC",
    description: "基本プラン（個人せどり・副業層向け）",
  },
  standard: {
    label: "STANDARD",
    description: "標準プラン（本業EC事業者・小規模セレクトショップ向け）",
  },
  pro: {
    label: "PRO",
    description: "上位プラン（中規模セレクトショップ・法人向け）",
  },
  advanced: {
    label: "ADVANCED",
    description: "上級プラン（中〜大規模法人向け）",
  },
  premium: {
    label: "PREMIUM",
    description: "最上位固定プラン（大規模法人・チェーン店向け）",
  },
  enterprise: { label: "ENTERPRISE", description: "個別契約プラン" },
};

const PLANS = RANK_ORDER.filter((rank) => rank !== "enterprise").map(
  (rank) => ({ id: rank, ...PLAN_LABELS[rank] })
);

export default function PlanSelector({
  isCorporate,
}: {
  isCorporate: boolean;
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

  useEffect(() => {
    if (state && "redirectTo" in state) {
      // DB が正なので即遷移。session.reload() はClerkのセッション（JWT）を
      // 最新の状態に揃えるためにバックグラウンドで行う
      router.push(state.redirectTo);
      session?.reload();
    }
  }, [state, session, router]);

  return (
    <form action={action} className="space-y-4">
      {isCorporate && (
        <input type="hidden" name="accountType" value="corporate" />
      )}
      <div className="space-y-4 rounded border p-4">
        <p className="text-sm font-medium">ご本人情報</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium">
              姓
            </label>
            <input
              id="lastName"
              name="lastName"
              required
              defaultValue={values?.lastName}
              aria-invalid={!!fieldErrors?.lastName}
              aria-describedby={
                fieldErrors?.lastName ? "lastName-error" : undefined
              }
              className="mt-1 w-full rounded border p-2"
            />
            {fieldErrors?.lastName && (
              <p id="lastName-error" className="mt-1 text-sm text-red-600">
                {fieldErrors.lastName}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium">
              名
            </label>
            <input
              id="firstName"
              name="firstName"
              required
              defaultValue={values?.firstName}
              aria-invalid={!!fieldErrors?.firstName}
              aria-describedby={
                fieldErrors?.firstName ? "firstName-error" : undefined
              }
              className="mt-1 w-full rounded border p-2"
            />
            {fieldErrors?.firstName && (
              <p id="firstName-error" className="mt-1 text-sm text-red-600">
                {fieldErrors.firstName}
              </p>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="phoneNumber" className="block text-sm font-medium">
            電話番号
          </label>
          <input
            id="phoneNumber"
            name="phoneNumber"
            required
            placeholder="09012345678"
            defaultValue={values?.phoneNumber}
            aria-invalid={!!fieldErrors?.phoneNumber}
            aria-describedby={
              fieldErrors?.phoneNumber ? "phoneNumber-error" : undefined
            }
            className="mt-1 w-full rounded border p-2"
          />
          {fieldErrors?.phoneNumber && (
            <p id="phoneNumber-error" className="mt-1 text-sm text-red-600">
              {fieldErrors.phoneNumber}
            </p>
          )}
        </div>
      </div>
      {isCorporate && (
        <div className="space-y-4 rounded border p-4">
          <p className="text-sm font-medium">法人情報</p>
          <div>
            <label htmlFor="companyName" className="block text-sm font-medium">
              会社名
            </label>
            <input
              id="companyName"
              name="companyName"
              required
              defaultValue={values?.companyName}
              aria-invalid={!!fieldErrors?.companyName}
              aria-describedby={
                fieldErrors?.companyName ? "companyName-error" : undefined
              }
              className="mt-1 w-full rounded border p-2"
            />
            {fieldErrors?.companyName && (
              <p id="companyName-error" className="mt-1 text-sm text-red-600">
                {fieldErrors.companyName}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="invoiceRegistrationNumber"
              className="block text-sm font-medium"
            >
              適格請求書発行事業者登録番号
            </label>
            <input
              id="invoiceRegistrationNumber"
              name="invoiceRegistrationNumber"
              required
              placeholder="T1234567890123"
              defaultValue={values?.invoiceRegistrationNumber}
              aria-invalid={!!fieldErrors?.invoiceRegistrationNumber}
              aria-describedby={
                fieldErrors?.invoiceRegistrationNumber
                  ? "invoiceRegistrationNumber-error"
                  : undefined
              }
              className="mt-1 w-full rounded border p-2"
            />
            {fieldErrors?.invoiceRegistrationNumber && (
              <p
                id="invoiceRegistrationNumber-error"
                className="mt-1 text-sm text-red-600"
              >
                {fieldErrors.invoiceRegistrationNumber}
              </p>
            )}
          </div>
        </div>
      )}
      <div className="grid gap-3">
        {PLANS.map((plan) => (
          <label
            key={plan.id}
            className="flex cursor-pointer items-center gap-3 rounded border p-4 hover:bg-gray-50"
          >
            <input
              type="radio"
              name="plan"
              value={plan.id}
              required
              defaultChecked={values?.plan === plan.id}
              className="h-4 w-4"
            />
            <div>
              <p className="font-medium">{plan.label}</p>
              <p className="text-sm text-gray-500">{plan.description}</p>
            </div>
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
      >
        {isPending ? "処理中..." : "このプランで始める"}
      </button>
      {failed?.error && <p className="text-sm text-red-600">{failed.error}</p>}
    </form>
  );
}
