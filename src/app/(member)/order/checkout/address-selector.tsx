"use client";

import { useState } from "react";
import AddressForm from "@/app/(member)/settings/address-form";
import type { Database } from "@/types/database.types";

type Address = Database["public"]["Tables"]["addresses"]["Row"];

type Props = {
  shippingAddresses: Address[];
  billingAddresses: Address[];
  onSelect: (shippingId: string, billingId: string) => void;
};

function defaultId(addresses: Address[]): string {
  return (addresses.find((a) => a.is_default) ?? addresses[0])?.id ?? "";
}

function AddressOption({ address }: { address: Address }) {
  return (
    <span className="text-sm text-gray-700">
      {address.recipient_last_name} {address.recipient_first_name}〒
      {address.postal_code} {address.prefecture}
      {address.city}
      {address.address_line1}
    </span>
  );
}

export default function AddressSelector({
  shippingAddresses,
  billingAddresses,
  onSelect,
}: Props) {
  const [shippingId, setShippingId] = useState(defaultId(shippingAddresses));
  const [billingId, setBillingId] = useState(defaultId(billingAddresses));
  const [sameAsShipping, setSameAsShipping] = useState(false);
  const [showShippingForm, setShowShippingForm] = useState(false);
  const [showBillingForm, setShowBillingForm] = useState(false);

  function handleShippingChange(id: string) {
    setShippingId(id);
    onSelect(id, sameAsShipping ? id : billingId);
  }

  function handleBillingChange(id: string) {
    setBillingId(id);
    onSelect(shippingId, id);
  }

  function handleSameAsShipping(checked: boolean) {
    setSameAsShipping(checked);
    onSelect(shippingId, checked ? shippingId : billingId);
  }

  return (
    <div className="space-y-6">
      {/* お届け先 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">お届け先住所</h3>
          <button
            type="button"
            onClick={() => setShowShippingForm(true)}
            className="text-xs text-gray-400 hover:text-gray-700"
          >
            ＋ 新規登録
          </button>
        </div>
        {shippingAddresses.length === 0 ? (
          <p className="text-sm text-gray-400">
            住所が登録されていません。下のフォームから追加してください。
          </p>
        ) : (
          <ul className="space-y-2">
            {shippingAddresses.map((addr) => (
              <li key={addr.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-gray-900">
                  <input
                    type="radio"
                    name="shipping_address"
                    value={addr.id}
                    checked={shippingId === addr.id}
                    onChange={() => handleShippingChange(addr.id)}
                    className="mt-0.5 accent-gray-900"
                  />
                  <AddressOption address={addr} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 請求先 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">請求先住所</h3>
          {!sameAsShipping && (
            <button
              type="button"
              onClick={() => setShowBillingForm(true)}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              ＋ 新規登録
            </button>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={sameAsShipping}
            onChange={(e) => handleSameAsShipping(e.target.checked)}
            className="accent-gray-900"
          />
          <span className="text-sm text-gray-600">お届け先と同じ</span>
        </label>

        {!sameAsShipping && (
          <>
            {billingAddresses.length === 0 ? (
              <p className="text-sm text-gray-400">
                住所が登録されていません。下のフォームから追加してください。
              </p>
            ) : (
              <ul className="space-y-2">
                {billingAddresses.map((addr) => (
                  <li key={addr.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-gray-900">
                      <input
                        type="radio"
                        name="billing_address"
                        value={addr.id}
                        checked={billingId === addr.id}
                        onChange={() => handleBillingChange(addr.id)}
                        className="mt-0.5 accent-gray-900"
                      />
                      <AddressOption address={addr} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {showShippingForm && (
        <AddressForm
          mode="create"
          type="shipping"
          onClose={() => setShowShippingForm(false)}
        />
      )}
      {showBillingForm && !sameAsShipping && (
        <AddressForm
          mode="create"
          type="billing"
          onClose={() => setShowBillingForm(false)}
        />
      )}
    </div>
  );
}
