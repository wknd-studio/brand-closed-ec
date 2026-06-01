"use client";

import { useState, useTransition } from "react";
import { setDefaultAddress, deleteAddress } from "./actions";
import AddressForm from "./address-form";
import type { Database } from "@/types/database.types";

type Address = Database["public"]["Tables"]["addresses"]["Row"];
type AddressType = Database["public"]["Enums"]["address_type"];

type Props = {
  addresses: Address[];
  type: AddressType;
  label: string;
};

export default function AddressList({ addresses, type, label }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
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
                      {addr.recipient_last_name} {addr.recipient_first_name}
                    </span>
                    {addr.is_default && (
                      <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        デフォルト
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500">
                    〒{addr.postal_code} {addr.prefecture}
                    {addr.city}
                    {addr.address_line1}
                    {addr.address_line2 ? ` ${addr.address_line2}` : ""}
                  </p>
                  <p className="text-gray-500">{addr.phone_number}</p>
                </div>

                <div className="ml-4 flex flex-shrink-0 flex-col items-end gap-1">
                  {!addr.is_default && (
                    <button
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await setDefaultAddress(addr.id, type);
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
                          await deleteAddress(addr.id);
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
