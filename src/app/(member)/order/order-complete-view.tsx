import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";
import { cn } from "@/lib/cn";
import type { OrderCompleteView as View } from "./order-complete-presenter";

/** 注文完了の画面（/order/complete・/order/invoice-complete で共通の見た目） */
export default function OrderCompleteView({ view }: { view: View }) {
  return (
    <div className="pt-[clamp(20px,5vw,48px)] pb-20">
      <Container className="max-w-[720px]">
        <Card className="flex flex-col gap-6 rounded-3xl p-[clamp(24px,5vw,44px)]">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-primary-light to-primary text-white">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <Eyebrow withLine>{view.eyebrow}</Eyebrow>
            <Heading as="h1" level="compact">
              ご注文ありがとうございます
            </Heading>
            <p className="text-sm tabular-nums text-secondary">
              注文番号{" "}
              <span className="font-semibold tracking-[0.04em] text-neutral-900">
                {view.orderNumber}
              </span>
              ・{view.orderDate}
            </p>
          </div>

          {view.invoiceNotice && (
            <Alert tone="info" role="status">
              <p>{view.invoiceNotice}</p>
            </Alert>
          )}

          <section
            aria-labelledby="order-next-steps-heading"
            className="flex flex-col gap-3"
          >
            <h2
              id="order-next-steps-heading"
              className="text-[0.9375rem] font-semibold"
            >
              このあとの流れ
            </h2>
            <ol className="flex flex-col">
              {view.steps.map((step, i) => (
                <li key={step.title} className="flex gap-3.5">
                  <span className="flex flex-col items-center">
                    <span
                      className={cn(
                        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-bold",
                        step.done
                          ? "bg-primary text-white"
                          : "border-[1.5px] border-neutral-300 bg-white text-neutral-700"
                      )}
                    >
                      {step.done ? (
                        <>
                          <span aria-hidden="true">✓</span>
                          <span className="sr-only">完了</span>
                        </>
                      ) : (
                        i + 1
                      )}
                    </span>
                    {i < view.steps.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="min-h-3 w-0.5 flex-1 bg-neutral-200"
                      />
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5 pb-4">
                    <span className="text-sm font-semibold">{step.title}</span>
                    <span className="text-[0.8125rem] leading-[1.7] text-neutral-700">
                      {step.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section
            aria-labelledby="order-items-heading"
            className="flex flex-col gap-1"
          >
            <h2
              id="order-items-heading"
              className="mb-1.5 text-[0.9375rem] font-semibold"
            >
              ご注文の内容
            </h2>
            <ul className="border-t border-neutral-200">
              {view.items.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between gap-3 border-b border-neutral-100 py-3 text-sm"
                >
                  <span className="flex flex-col gap-0.5">
                    <span>{item.name}</span>
                    <span className="text-xs tabular-nums text-secondary">
                      {item.detail}
                    </span>
                  </span>
                  <span className="font-semibold whitespace-nowrap tabular-nums">
                    {item.lineTotal}
                  </span>
                </li>
              ))}
            </ul>
            {view.total && (
              <div className="flex items-baseline justify-between pt-2.5">
                <span className="text-sm font-semibold">
                  {view.total.label}
                </span>
                <span className="text-[1.375rem] font-bold tabular-nums">
                  {view.total.amount}
                </span>
              </div>
            )}
          </section>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/orders"
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "max-w-[280px] flex-[1_1_200px]"
              )}
            >
              注文履歴を見る
            </Link>
            <Link
              href="/shop"
              className={cn(buttonVariants(), "max-w-[280px] flex-[1_1_200px]")}
            >
              ショッピングを続ける
            </Link>
          </div>
        </Card>
      </Container>
    </div>
  );
}
