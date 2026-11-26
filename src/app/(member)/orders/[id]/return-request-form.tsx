"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
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
    <section
      aria-labelledby="return-request"
      className={cn(
        cardVariants(),
        "flex flex-col gap-4 rounded-3xl p-[clamp(20px,4vw,28px)]"
      )}
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="return-request" className="text-[17px] font-semibold">
          返品・返金の申請
        </h2>
        <p className="text-[13px] leading-[1.8] text-neutral-700">
          不良品・誤配送などの場合に、返品する商品と数量を選んで申請してください。お客様のご都合によるキャンセル・返品は、原則お受けできません。
        </p>
      </div>
      {succeeded && (
        <Alert tone="success" role="status">
          返品・返金の申請を受け付けました。運営で内容を確認のうえ、ご連絡します。
        </Alert>
      )}
      {items.length > 0 && (
        <ReturnRequestFields
          items={items}
          reasonOptions={reasonOptions}
          error={result && "error" in result ? result.error : null}
          pending={pending}
          onSubmit={handleSubmit}
        />
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
    <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-semibold">
          返品する商品と数量
        </legend>
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-[10px] border border-neutral-200 px-3.5 py-2.5"
          >
            <span className="flex flex-col gap-0.5 text-sm">
              <label htmlFor={`quantity-${item.id}`}>
                {item.productNameSnapshot}
              </label>
              <span className="text-xs text-neutral-700">
                {item.returnableQuantity}点まで申請できます
              </span>
            </span>
            <Select
              id={`quantity-${item.id}`}
              name={`quantity:${item.id}`}
              defaultValue="0"
              className="w-24 shrink-0 bg-white"
              options={Array.from(
                { length: item.returnableQuantity + 1 },
                (_, n) => ({ value: String(n), label: `${n}点` })
              )}
            />
          </div>
        ))}
      </fieldset>

      <FormField label="理由" required className="max-w-[360px]">
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
            rows={4}
            className="w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        )}
      </FormField>

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "送信中…" : "返品・返金を申請する"}
        </Button>
      </div>
    </form>
  );
}
