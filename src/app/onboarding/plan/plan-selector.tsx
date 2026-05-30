"use client";

import { useActionState, useEffect } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { selectPlan, type SelectPlanResult } from "./actions";

const PLANS = [
  {
    id: "free",
    label: "Free",
    description: "無料で基本機能をご利用いただけます",
  },
  { id: "entry", label: "Entry", description: "エントリープラン" },
  { id: "standard", label: "Standard", description: "スタンダードプラン" },
  { id: "pro", label: "Pro", description: "プロプラン" },
] as const;

export default function PlanSelector() {
  const { session } = useClerk();
  const router = useRouter();
  const [state, action, isPending] = useActionState<
    SelectPlanResult | null,
    FormData
  >(selectPlan, null);

  useEffect(() => {
    if (state && "redirectTo" in state) {
      session?.reload().then(() => {
        router.push(state.redirectTo);
      });
    }
  }, [state, session, router]);

  return (
    <form action={action} className="space-y-4">
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
