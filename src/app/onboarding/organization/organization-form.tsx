"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createOrganizationAction,
  type CreateOrganizationFormResult,
} from "./actions";

export default function OrganizationForm() {
  const router = useRouter();
  const [state, action, isPending] = useActionState<
    CreateOrganizationFormResult | null,
    FormData
  >(createOrganizationAction, null);

  useEffect(() => {
    if (state && "redirectTo" in state) {
      router.push(state.redirectTo);
    }
  }, [state, router]);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">会社名</label>
        <input
          name="organizationName"
          required
          className="mt-1 w-full rounded border p-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">代表者名</label>
        <input
          name="representativeName"
          required
          className="mt-1 w-full rounded border p-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">電話番号</label>
        <input
          name="phoneNumber"
          required
          className="mt-1 w-full rounded border p-2"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium">郵便番号</label>
          <input
            name="postalCode"
            required
            className="mt-1 w-full rounded border p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">都道府県</label>
          <input
            name="prefecture"
            required
            className="mt-1 w-full rounded border p-2"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium">市区町村</label>
        <input
          name="city"
          required
          className="mt-1 w-full rounded border p-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">番地</label>
        <input
          name="addressLine1"
          required
          className="mt-1 w-full rounded border p-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">建物名等（任意）</label>
        <input name="addressLine2" className="mt-1 w-full rounded border p-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">
          適格請求書発行事業者登録番号
        </label>
        <input
          name="invoiceRegistrationNumber"
          required
          placeholder="T1234567890123"
          pattern="^T\d{13}$"
          className="mt-1 w-full rounded border p-2"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
      >
        {isPending ? "処理中..." : "組織を作成する"}
      </button>
      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
