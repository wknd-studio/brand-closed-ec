"use client";

import { useState } from "react";
import Link from "next/link";
import AddressSelector from "./address-selector";
import type { Database } from "@/types/database.types";

type Address = Database["public"]["Tables"]["addresses"]["Row"];

type Props = {
  shippingAddresses: Address[];
  billingAddresses: Address[];
  hasOutOfStock: boolean;
  fixedTotal: number;
};

function defaultId(addresses: Address[]): string {
  return (addresses.find((a) => a.is_default) ?? addresses[0])?.id ?? "";
}

export default function CheckoutForm({
  shippingAddresses,
  billingAddresses,
  hasOutOfStock,
  fixedTotal,
}: Props) {
  const [shippingId, setShippingId] = useState(defaultId(shippingAddresses));
  const [billingId, setBillingId] = useState(defaultId(billingAddresses));

  const canOrder =
    !hasOutOfStock && shippingId !== "" && billingId !== "" && fixedTotal >= 0;

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-lg border p-5">
        <AddressSelector
          shippingAddresses={shippingAddresses}
          billingAddresses={billingAddresses}
          onSelect={(s, b) => {
            setShippingId(s);
            setBillingId(b);
          }}
        />
      </section>

      {hasOutOfStock && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          在庫切れの商品が含まれています。カートから削除してから注文してください。
        </p>
      )}

      {(shippingId === "" || billingId === "") && (
        <p className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
          お届け先・請求先住所を登録・選択してください。
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          disabled={!canOrder}
          className="w-full rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          注文を確定する
        </button>
        <Link
          href="/shop"
          className="text-center text-sm text-gray-400 hover:text-gray-700"
        >
          ショッピングを続ける
        </Link>
      </div>
    </div>
  );
}
