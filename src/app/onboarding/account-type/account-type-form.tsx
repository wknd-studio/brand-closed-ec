"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { selectAccountType, type SelectAccountTypeResult } from "./actions";

export default function AccountTypeForm() {
  const router = useRouter();
  const [state, action, isPending] = useActionState<
    SelectAccountTypeResult | null,
    FormData
  >(selectAccountType, null);

  useEffect(() => {
    if (state) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form action={action} className="w-full max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">ご利用の種別を選択してください</h1>
      <div className="grid gap-3">
        <label className="flex cursor-pointer items-center gap-3 rounded border p-4 hover:bg-gray-50">
          <input
            type="radio"
            name="accountType"
            value="individual"
            defaultChecked
            className="h-4 w-4"
          />
          <div>
            <p className="font-medium">個人として登録</p>
            <p className="text-sm text-gray-500">
              個人会員としてプランを選択します
            </p>
          </div>
        </label>
        <label className="flex cursor-pointer items-center gap-3 rounded border p-4 hover:bg-gray-50">
          <input
            type="radio"
            name="accountType"
            value="organization"
            className="h-4 w-4"
          />
          <div>
            <p className="font-medium">法人として登録</p>
            <p className="text-sm text-gray-500">
              法人組織を作成し、代表者として管理します
            </p>
          </div>
        </label>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
      >
        {isPending ? "処理中..." : "次へ"}
      </button>
    </form>
  );
}
