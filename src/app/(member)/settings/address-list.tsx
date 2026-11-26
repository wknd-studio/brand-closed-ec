"use client";

import { useState, useTransition } from "react";
import { setDefaultAddressAction, deleteAddressAction } from "./actions";
import AddressForm from "./address-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AddressDto = {
  id: string;
  type: string;
  isDefault: boolean;
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
};

type Props = {
  addresses: AddressDto[];
  type: "shipping" | "billing";
  label: string;
};

const textButtonClass =
  "h-9 px-3 text-[13px] text-neutral-900 underline underline-offset-4 hover:text-primary-strong disabled:opacity-40";

export default function AddressList({ addresses, type, label }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AddressDto | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filtered = addresses.filter((a) => a.type === type);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowAddForm(true)}
          className="gap-1.5"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          追加
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-600">登録済みの住所がありません</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((addr) => (
            <li
              key={addr.id}
              className="rounded-xl border border-neutral-200 px-4 py-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5 text-sm leading-[1.7]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {addr.recipientLastName} {addr.recipientFirstName}
                    </span>
                    {addr.isDefault && <Badge>いつもの住所</Badge>}
                  </div>
                  <p className="text-neutral-700">
                    〒{addr.postalCode} {addr.prefecture}
                    {addr.city}
                    {addr.addressLine1}
                    {addr.addressLine2 ? ` ${addr.addressLine2}` : ""}
                  </p>
                  <p className="text-neutral-700 tabular-nums">
                    {addr.phoneNumber}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1">
                  {!addr.isDefault && (
                    <button
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await setDefaultAddressAction(addr.id, type);
                        })
                      }
                      className={textButtonClass}
                    >
                      いつもの住所にする
                    </button>
                  )}
                  <button
                    onClick={() => setEditingAddress(addr)}
                    className={textButtonClass}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(addr.id)}
                    className="h-9 px-3 text-[13px] text-danger underline underline-offset-4 hover:opacity-80"
                  >
                    削除
                  </button>
                </div>
              </div>

              {deleteConfirmId === addr.id && (
                <Alert
                  tone="danger"
                  role="alert"
                  title="この住所を削除しますか？"
                  className="mt-3"
                >
                  <div className="mt-1 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      キャンセル
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await deleteAddressAction(addr.id);
                          setDeleteConfirmId(null);
                        })
                      }
                    >
                      削除する
                    </Button>
                  </div>
                </Alert>
              )}
            </li>
          ))}
        </ul>
      )}

      {showAddForm && (
        <AddressForm
          mode="create"
          type={type}
          onClose={() => setShowAddForm(false)}
        />
      )}
      {editingAddress && (
        <AddressForm
          // 別の住所の編集に切り替えたとき、入力欄を作り直す
          key={editingAddress.id}
          mode="edit"
          address={editingAddress}
          onClose={() => setEditingAddress(null)}
        />
      )}
    </div>
  );
}
