"use client";

import { useTransition } from "react";
import { setDefaultAddress } from "./actions";
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

  const filtered = addresses.filter((a) => a.type === type);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-gray-700">{label}</h2>
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400">登録済みの住所がありません</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((addr) => (
            <li
              key={addr.id}
              className="flex items-start justify-between rounded-lg border p-4"
            >
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
              {!addr.is_default && (
                <button
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await setDefaultAddress(addr.id, type);
                    })
                  }
                  className="ml-4 flex-shrink-0 text-xs text-gray-400 hover:text-gray-900 disabled:opacity-40"
                >
                  デフォルトに設定
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
