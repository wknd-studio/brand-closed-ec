"use client";

import { useState, useTransition } from "react";
import { setDefaultAddressAction, deleteAddressAction } from "./actions";
import AddressForm from "./address-form";

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

export default function AddressList({ addresses, type, label }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AddressDto | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filtered = addresses.filter((a) => a.type === type);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">{label}</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          ＋ 追加
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400">登録済みの住所がありません</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((addr) => (
            <li key={addr.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {addr.recipientLastName} {addr.recipientFirstName}
                    </span>
                    {addr.isDefault && (
                      <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        デフォルト
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500">
                    〒{addr.postalCode} {addr.prefecture}
                    {addr.city}
                    {addr.addressLine1}
                    {addr.addressLine2 ? ` ${addr.addressLine2}` : ""}
                  </p>
                  <p className="text-gray-500">{addr.phoneNumber}</p>
                </div>

                <div className="ml-4 flex flex-shrink-0 flex-col items-end gap-1">
                  {!addr.isDefault && (
                    <button
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await setDefaultAddressAction(addr.id, type);
                        })
                      }
                      className="text-xs text-gray-400 hover:text-gray-900 disabled:opacity-40"
                    >
                      デフォルトに設定
                    </button>
                  )}
                  <button
                    onClick={() => setEditingAddress(addr)}
                    className="text-xs text-gray-400 hover:text-gray-900"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(addr.id)}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    削除
                  </button>
                </div>
              </div>

              {/* 削除確認 */}
              {deleteConfirmId === addr.id && (
                <div className="mt-3 rounded-lg bg-red-50 p-3">
                  <p className="text-xs text-red-700">
                    この住所を削除しますか？
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="rounded border px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      キャンセル
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await deleteAddressAction(addr.id);
                          setDeleteConfirmId(null);
                        })
                      }
                      className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
                    >
                      削除する
                    </button>
                  </div>
                </div>
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
          mode="edit"
          address={editingAddress}
          onClose={() => setEditingAddress(null)}
        />
      )}
    </section>
  );
}
