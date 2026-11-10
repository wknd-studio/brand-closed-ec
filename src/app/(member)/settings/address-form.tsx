"use client";

import {
  startTransition,
  useActionState,
  useState,
  type FormEvent,
} from "react";
import {
  createAddressAction,
  updateAddressAction,
  type AddressFormResult,
} from "./actions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { RequiredAddressField } from "@/domain/errors/missing-required-address-fields-error";

type AddressDto = {
  id: string;
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
};

type Props =
  | { mode: "create"; type: "shipping" | "billing"; onClose: () => void }
  | { mode: "edit"; address: AddressDto; onClose: () => void };

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

const PREFECTURE_OPTIONS = [
  { value: "", label: "選択してください" },
  ...PREFECTURES.map((p) => ({ value: p, label: p })),
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
    // eslint-disable-next-line no-restricted-syntax -- 郵便番号の検索は補助で、失敗しても住所を手で入力できる
  } catch {
    return null;
  }
}

function FieldError({
  field,
  fieldErrors,
}: {
  field: RequiredAddressField;
  fieldErrors: Partial<Record<RequiredAddressField, string>> | undefined;
}) {
  const message = fieldErrors?.[field];
  if (!message) return null;
  return (
    <p id={`address-${field}-error`} className="mt-1 text-xs text-danger">
      {message}
    </p>
  );
}

export default function AddressForm(props: Props) {
  const addr = props.mode === "edit" ? props.address : null;
  const [state, action, isPending] = useActionState<
    AddressFormResult | null,
    FormData
  >(async (_, formData) => {
    const result =
      props.mode === "create"
        ? await createAddressAction(formData)
        : await updateAddressAction(props.address.id, formData);
    if ("success" in result) props.onClose();
    return result;
  }, null);

  const fieldErrors =
    state && "fieldErrors" in state ? state.fieldErrors : undefined;
  const formError = state && "error" in state ? state.error : null;

  // <form action> に関数を渡すと、React 19 は送信後にフォームをリセットし、制御された select（都道府県）は
  // state の値に戻らない。失敗しても入力を残すため、onSubmit から action を呼んでリセットさせない
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => action(formData));
  }

  const [prefecture, setPrefecture] = useState(addr?.prefecture ?? "");
  const [city, setCity] = useState(addr?.city ?? "");
  const [addressLine1, setAddressLine1] = useState(addr?.addressLine1 ?? "");
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

  function describedBy(field: RequiredAddressField) {
    return fieldErrors?.[field] ? `address-${field}-error` : undefined;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-5 text-sm font-semibold">
          {props.mode === "create" ? "住所を追加" : "住所を編集"}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-3">
          {props.mode === "create" && (
            <input type="hidden" name="type" value={props.type} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">姓</label>
              <Input
                name="recipient_last_name"
                defaultValue={addr?.recipientLastName ?? ""}
                required
                error={fieldErrors?.recipientLastName}
                aria-describedby={describedBy("recipientLastName")}
                className="w-full"
              />
              <FieldError field="recipientLastName" fieldErrors={fieldErrors} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">名</label>
              <Input
                name="recipient_first_name"
                defaultValue={addr?.recipientFirstName ?? ""}
                required
                error={fieldErrors?.recipientFirstName}
                aria-describedby={describedBy("recipientFirstName")}
                className="w-full"
              />
              <FieldError
                field="recipientFirstName"
                fieldErrors={fieldErrors}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">郵便番号</label>
            <div className="relative">
              <Input
                name="postal_code"
                defaultValue={addr?.postalCode ?? ""}
                required
                // domain の InvalidPostalCodeError と同じ形式（tests/unit/address-form.test.tsx で一致を確かめる）
                pattern="\d{3}-?\d{4}"
                title="7桁の数字（例: 150-0001）"
                placeholder="1500001"
                onChange={(e) => handleZipcodeChange(e.target.value)}
                error={fieldErrors?.postalCode}
                aria-describedby={describedBy("postalCode")}
                className="w-full"
              />
              {zipcodeLoading && (
                <span className="absolute right-3 top-2 text-xs text-gray-400">
                  検索中…
                </span>
              )}
            </div>
            <FieldError field="postalCode" fieldErrors={fieldErrors} />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">都道府県</label>
            <Select
              name="prefecture"
              value={prefecture}
              onChange={(e) => setPrefecture(e.target.value)}
              required
              error={fieldErrors?.prefecture}
              aria-describedby={describedBy("prefecture")}
              className="w-full"
              options={PREFECTURE_OPTIONS}
            />
            <FieldError field="prefecture" fieldErrors={fieldErrors} />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">市区町村</label>
            <Input
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              error={fieldErrors?.city}
              aria-describedby={describedBy("city")}
              className="w-full"
            />
            <FieldError field="city" fieldErrors={fieldErrors} />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">
              番地・建物名
            </label>
            <Input
              name="address_line1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              required
              error={fieldErrors?.addressLine1}
              aria-describedby={describedBy("addressLine1")}
              className="w-full"
            />
            <FieldError field="addressLine1" fieldErrors={fieldErrors} />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">
              建物名・部屋番号（任意）
            </label>
            <Input
              name="address_line2"
              defaultValue={addr?.addressLine2 ?? ""}
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">電話番号</label>
            <Input
              type="tel"
              name="phone_number"
              defaultValue={addr?.phoneNumber ?? ""}
              required
              // domain の PhoneNumber と同じ形式（ハイフンをすべて除いて0始まりの10〜11桁。tests/unit/address-form.test.tsx で一致を確かめる）
              pattern="-*0(?:-*\d){9,10}-*"
              title="0から始まる10〜11桁の数字（例: 090-1234-5678）"
              placeholder="09012345678"
              error={fieldErrors?.phoneNumber}
              aria-describedby={describedBy("phoneNumber")}
              className="w-full"
            />
            <FieldError field="phoneNumber" fieldErrors={fieldErrors} />
          </div>

          {formError && <p className="text-xs text-danger">{formError}</p>}

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
