"use client";

import { useState, useTransition } from "react";
import { createAddress, updateAddress } from "./actions";
import type { Database } from "@/types/database.types";

type Address = Database["public"]["Tables"]["addresses"]["Row"];
type AddressType = Database["public"]["Enums"]["address_type"];

type Props =
  | { mode: "create"; type: AddressType; onClose: () => void }
  | { mode: "edit"; address: Address; onClose: () => void };

const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

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

export default function AddressForm(props: Props) {
  const addr = props.mode === "edit" ? props.address : null;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [prefecture, setPrefecture] = useState(addr?.prefecture ?? "");
  const [city, setCity] = useState(addr?.city ?? "");
  const [addressLine1, setAddressLine1] = useState(addr?.address_line1 ?? "");
  const [zipcodeLoading, setZipcodeLoading] = useState(false);

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

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        props.mode === "create"
          ? await createAddress(formData)
          : await updateAddress(props.address.id, formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        props.onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-5 text-sm font-semibold">
          {props.mode === "create" ? "住所を追加" : "住所を編集"}
        </h3>

        <form action={handleSubmit} className="space-y-3">
          {props.mode === "create" && (
            <input type="hidden" name="type" value={props.type} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">姓</label>
              <input
                name="recipient_last_name"
                defaultValue={addr?.recipient_last_name ?? ""}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">名</label>
              <input
                name="recipient_first_name"
                defaultValue={addr?.recipient_first_name ?? ""}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">郵便番号</label>
            <div className="relative">
              <input
                name="postal_code"
                defaultValue={addr?.postal_code ?? ""}
                required
                placeholder="1500001"
                onChange={(e) => handleZipcodeChange(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              {zipcodeLoading && (
                <span className="absolute right-3 top-2 text-xs text-gray-400">
                  検索中…
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">都道府県</label>
            <select
              name="prefecture"
              value={prefecture}
              onChange={(e) => setPrefecture(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              <option value="">選択してください</option>
              {PREFECTURES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">市区町村</label>
            <input
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">
              番地・建物名
            </label>
            <input
              name="address_line1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">
              建物名・部屋番号（任意）
            </label>
            <input
              name="address_line2"
              defaultValue={addr?.address_line2 ?? ""}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">電話番号</label>
            <input
              name="phone_number"
              defaultValue={addr?.phone_number ?? ""}
              required
              placeholder="09012345678"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={props.onClose}
              className="flex-1 rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
            >
              {isPending ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
