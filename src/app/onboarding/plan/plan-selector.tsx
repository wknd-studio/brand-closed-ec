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
  organizationId,
}: {
  organizationId?: string;
}) {
  const { session } = useClerk();
  const router = useRouter();
  const [state, action, isPending] = useActionState<
    SelectPlanResult | null,
    FormData
  >(selectPlan, null);

  useEffect(() => {
    if (state && "redirectTo" in state) {
      // DB が正なので即遷移。session.reload() はバックグラウンドで JWT を更新し
      // 以降のリクエストで DB クエリをスキップする高速パスを有効化する。
      router.push(state.redirectTo);
      session?.reload();
    }
  }, [state, session, router]);

  return (
    <form action={action} className="space-y-4">
      {organizationId && (
        <input type="hidden" name="organizationId" value={organizationId} />
      )}
      {!organizationId && (
        <div className="space-y-4 rounded border p-4">
          <p className="text-sm font-medium">ご本人情報</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">姓</label>
              <input
                name="lastName"
                required
                className="mt-1 w-full rounded border p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">名</label>
              <input
                name="firstName"
                required
                className="mt-1 w-full rounded border p-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">電話番号</label>
            <input
              name="phoneNumber"
              required
              placeholder="09012345678"
              className="mt-1 w-full rounded border p-2"
            />
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
      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
