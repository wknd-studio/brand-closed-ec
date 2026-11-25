"use client";

import { useState } from "react";
import AddressForm from "@/app/(member)/settings/address-form";
import { Badge } from "@/components/ui/badge";
import { ChoiceCard } from "@/components/ui/choice-card";

type AddressDto = {
  id: string;
  isDefault: boolean;
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
};

type Props = {
  shippingAddresses: AddressDto[];
  billingAddresses: AddressDto[];
  onSelect: (shippingId: string, billingId: string) => void;
};

function defaultId(addresses: AddressDto[]): string {
  return (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? "";
}

// 郵便番号は7桁の数字で持っているため、表示のときだけハイフンを入れる
function formatPostalCode(postalCode: string): string {
  return /^\d{7}$/.test(postalCode)
    ? `${postalCode.slice(0, 3)}-${postalCode.slice(3)}`
    : postalCode;
}

function AddressList({
  name,
  title,
  addresses,
  selectedId,
  onChange,
  onAdd,
}: {
  name: string;
  title: string;
  addresses: AddressDto[];
  selectedId: string;
  onChange: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${name}-heading`} className="text-[0.8125rem] font-semibold">
          {title}
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="text-[0.8125rem] text-neutral-700 underline hover:text-primary"
        >
          ＋ 新規登録
        </button>
      </div>
      {addresses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-5 text-[0.8125rem] leading-[1.7] text-neutral-700">
          住所が登録されていません。「＋ 新規登録」から追加してください。
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-labelledby={`${name}-heading`}
          className="flex flex-col gap-2.5"
        >
          {addresses.map((addr) => (
            <ChoiceCard
              key={addr.id}
              className="flex-row items-start gap-3 rounded-xl px-4 py-3.5"
            >
              <input
                type="radio"
                name={name}
                value={addr.id}
                checked={selectedId === addr.id}
                onChange={() => onChange(addr.id)}
                className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-none"
              />
              <span className="flex flex-col gap-[3px] text-sm leading-[1.6]">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {addr.recipientLastName} {addr.recipientFirstName}
                  {addr.isDefault && <Badge>いつもの住所</Badge>}
                </span>
                <span className="text-neutral-700">
                  〒{formatPostalCode(addr.postalCode)} {addr.prefecture}
                  {addr.city}
                  {addr.addressLine1}
                </span>
              </span>
            </ChoiceCard>
          ))}
        </div>
      )}
    </div>
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
    <div className="flex flex-col gap-4">
      <AddressList
        name="shipping_address"
        title="お届け先"
        addresses={shippingAddresses}
        selectedId={shippingId}
        onChange={handleShippingChange}
        onAdd={() => setShowShippingForm(true)}
      />
      {showShippingForm && (
        <AddressForm
          mode="create"
          type="shipping"
          onClose={() => setShowShippingForm(false)}
        />
      )}

      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 border-t border-neutral-100 pt-2 text-sm">
        <input
          type="checkbox"
          checked={sameAsShipping}
          onChange={(e) => handleSameAsShipping(e.target.checked)}
          className="size-5 accent-primary"
        />
        請求先はお届け先と同じ
      </label>

      {!sameAsShipping && (
        <>
          <AddressList
            name="billing_address"
            title="請求先"
            addresses={billingAddresses}
            selectedId={billingId}
            onChange={handleBillingChange}
            onAdd={() => setShowBillingForm(true)}
          />
          {showBillingForm && (
            <AddressForm
              mode="create"
              type="billing"
              onClose={() => setShowBillingForm(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
