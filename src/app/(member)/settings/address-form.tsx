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
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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

const TYPE_LABELS = {
  shipping: "お届け先住所",
  billing: "請求先住所",
} as const;

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
  const title =
    props.mode === "create" ? `${TYPE_LABELS[props.type]}を追加` : "住所を編集";

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
    <form
      onSubmit={handleSubmit}
      aria-label={title}
      className="flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-primary bg-[color-mix(in_srgb,var(--color-primary)_5%,white)] p-[18px]"
    >
      <p className="text-sm font-semibold">{title}</p>

      {props.mode === "create" && (
        <input type="hidden" name="type" value={props.type} />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="姓" required error={fieldErrors?.recipientLastName}>
          {(field) => (
            <Input
              name="recipient_last_name"
              defaultValue={addr?.recipientLastName ?? ""}
              required
              className="w-full"
              {...field}
            />
          )}
        </FormField>
        <FormField label="名" required error={fieldErrors?.recipientFirstName}>
          {(field) => (
            <Input
              name="recipient_first_name"
              defaultValue={addr?.recipientFirstName ?? ""}
              required
              className="w-full"
              {...field}
            />
          )}
        </FormField>

        <FormField label="郵便番号" required error={fieldErrors?.postalCode}>
          {(field) => (
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
                className="w-full"
                {...field}
              />
              {zipcodeLoading && (
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-neutral-600">
                  検索中…
                </span>
              )}
            </div>
          )}
        </FormField>

        <FormField label="都道府県" required error={fieldErrors?.prefecture}>
          {(field) => (
            <Select
              name="prefecture"
              value={prefecture}
              onChange={(e) => setPrefecture(e.target.value)}
              required
              className="w-full"
              options={PREFECTURE_OPTIONS}
              {...field}
            />
          )}
        </FormField>

        <FormField
          label="市区町村"
          required
          error={fieldErrors?.city}
          className="sm:col-span-2"
        >
          {(field) => (
            <Input
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              className="w-full"
              {...field}
            />
          )}
        </FormField>

        <FormField
          label="番地・建物名"
          required
          error={fieldErrors?.addressLine1}
          className="sm:col-span-2"
        >
          {(field) => (
            <Input
              name="address_line1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              required
              className="w-full"
              {...field}
            />
          )}
        </FormField>

        <FormField label="建物名・部屋番号（任意）" className="sm:col-span-2">
          {(field) => (
            <Input
              name="address_line2"
              defaultValue={addr?.addressLine2 ?? ""}
              className="w-full"
              {...field}
            />
          )}
        </FormField>

        <FormField label="電話番号" required error={fieldErrors?.phoneNumber}>
          {(field) => (
            <Input
              type="tel"
              name="phone_number"
              defaultValue={addr?.phoneNumber ?? ""}
              required
              // domain の PhoneNumber と同じ形式（ハイフンをすべて除いて0始まりの10〜11桁。tests/unit/address-form.test.tsx で一致を確かめる）
              pattern="-*0(?:-*\d){9,10}-*"
              title="0から始まる10〜11桁の数字（例: 090-1234-5678）"
              placeholder="09012345678"
              className="w-full"
              {...field}
            />
          )}
        </FormField>
      </div>

      {formError && (
        <p role="alert" className="text-xs text-danger">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "保存中..." : "保存する"}
        </Button>
        <button
          type="button"
          onClick={props.onClose}
          className="h-10 px-4 text-sm text-neutral-700 underline underline-offset-4 hover:text-neutral-900"
        >
          やめる
        </button>
      </div>
    </form>
  );
}
