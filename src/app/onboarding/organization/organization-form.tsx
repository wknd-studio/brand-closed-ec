"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createOrganizationAction,
  type CreateOrganizationFormResult,
} from "./actions";

async function fetchAddressByZipcode(zipcode: string): Promise<{
  prefecture: string;
  city: string;
  address_line1: string;
} | null> {
  try {
    const res = await fetch(
      `https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zipcode}`
    );
    const data = await res.json();
    const result = data?.results?.[0];
    if (!result) return null;
    return {
      prefecture: result.address1,
      city: result.address2,
      address_line1: result.address3,
    };
  } catch {
    return null;
  }
}

export default function OrganizationForm() {
  const router = useRouter();
  const [state, action, isPending] = useActionState<
    CreateOrganizationFormResult | null,
    FormData
  >(createOrganizationAction, null);
  const [prefecture, setPrefecture] = useState("");
  const [city, setCity] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [zipcodeLoading, setZipcodeLoading] = useState(false);

  useEffect(() => {
    if (state && "redirectTo" in state) {
      router.push(state.redirectTo);
    }
  }, [state, router]);

  async function handleZipcodeChange(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 7) return;
    setZipcodeLoading(true);
    const result = await fetchAddressByZipcode(digits);
    setZipcodeLoading(false);
    if (result) {
      setPrefecture(result.prefecture);
      setCity(result.city);
      setAddressLine1(result.address_line1);
    }
  }

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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium">代表者名（姓）</label>
          <input
            name="representativeLastName"
            required
            className="mt-1 w-full rounded border p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">代表者名（名）</label>
          <input
            name="representativeFirstName"
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
          placeholder="0312345678"
          className="mt-1 w-full rounded border p-2"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium">郵便番号</label>
          <div className="relative">
            <input
              name="postalCode"
              required
              placeholder="1000001"
              onChange={(e) => handleZipcodeChange(e.target.value)}
              className="mt-1 w-full rounded border p-2"
            />
            {zipcodeLoading && (
              <span className="absolute right-3 top-3 text-xs text-gray-400">
                検索中…
              </span>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">都道府県</label>
          <input
            name="prefecture"
            value={prefecture}
            onChange={(e) => setPrefecture(e.target.value)}
            required
            className="mt-1 w-full rounded border p-2"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium">市区町村</label>
        <input
          name="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required
          className="mt-1 w-full rounded border p-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">番地</label>
        <input
          name="addressLine1"
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
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
