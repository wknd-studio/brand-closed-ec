"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import type { ReturnableItemDto } from "@/queries/member-order-query-service";
import type { ReturnRequestFormResult } from "./actions";

type Props = {
  items: ReturnableItemDto[];
  reasonOptions: { kind: string; label: string }[];
  action: (formData: FormData) => Promise<ReturnRequestFormResult>;
};

export function ReturnRequestForm({ items, reasonOptions, action }: Props) {
  const [result, setResult] = useState<ReturnRequestFormResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      const next = await action(formData);
      setResult(next);
      if ("success" in next) form.reset();
    });
  }

  const succeeded = result !== null && "success" in result;
  // 申請後の再描画で申請できる明細が無くなっても、受け付けたことは出し続ける
  if (items.length === 0 && !succeeded) return null;

  return (
    <section aria-labelledby="return-request" className="rounded-lg border p-5">
      <h2 id="return-request" className="text-sm font-medium text-gray-700">
        返品・返金の申請
      </h2>
      {succeeded && (
        <p role="status" className="mt-1 text-sm text-secondary">
          返品・返金の申請を受け付けました。運営で内容を確認のうえ、ご連絡します
        </p>
      )}
      {items.length > 0 && (
        <>
          <p className="mb-3 mt-1 text-xs text-gray-500">
            不良品・誤配送などの場合に、返品する商品と数量を選んで申請してください。お客様のご都合によるキャンセル・返品は原則お受けできません
          </p>
          <ReturnRequestFields
            items={items}
            reasonOptions={reasonOptions}
            error={result && "error" in result ? result.error : null}
            pending={pending}
            onSubmit={handleSubmit}
          />
        </>
      )}
    </section>
  );
}

function ReturnRequestFields({
  items,
  reasonOptions,
  error,
  pending,
  onSubmit,
}: Omit<Props, "action"> & {
  error: string | null;
  pending: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ul className="divide-y">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-4 py-2"
          >
            <FormField label={item.productNameSnapshot} className="w-full">
              {(field) => (
                <Select
                  {...field}
                  name={`quantity:${item.id}`}
                  defaultValue="0"
                  className="w-24"
                  options={Array.from(
                    { length: item.returnableQuantity + 1 },
                    (_, n) => ({ value: String(n), label: `${n}点` })
                  )}
                />
              )}
            </FormField>
          </li>
        ))}
      </ul>

      <FormField label="理由" required>
        {(field) => (
          <Select
            {...field}
            name="reason_kind"
            required
            defaultValue=""
            className="w-full"
            options={[
              { value: "", label: "選んでください" },
              ...reasonOptions.map((o) => ({ value: o.kind, label: o.label })),
            ]}
          />
        )}
      </FormField>

      <FormField
        label="詳しい理由"
        hint="「その他」を選んだ場合は必ずご記入ください"
      >
        {(field) => (
          <textarea
            id={field.id}
            aria-describedby={field["aria-describedby"]}
            name="reason_detail"
            rows={3}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        )}
      </FormField>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "送信中…" : "返品・返金を申請する"}
      </Button>
    </form>
  );
}
