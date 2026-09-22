import { describe, it, expect, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { markInvoiceOrderAsPaid } from "@/use-cases/mark-invoice-order-as-paid";
import {
  makeOrderRepo,
  makeUserRepo,
  makeNotificationService,
  makeOrder,
  makeOrderItem,
  makeSettlement,
} from "./helpers";

const invoiceSettlement = (overrides?: Parameters<typeof makeSettlement>[0]) =>
  makeSettlement({
    flow: "invoice",
    status: "invoice_sent",
    stripeCheckoutSessionId: null,
    stripeInvoiceId: "inv_1",
    ...overrides,
  });

const afterOrderItem = () => makeOrderItem({ paymentTiming: "after_order" });

describe("markInvoiceOrderAsPaid", () => {
  it("決済単位をpaidにし、全明細が支払い済みなら注文もpaidにしてsendInvoicePaidを呼ぶ", async () => {
    const order = makeOrder({
      items: [afterOrderItem()],
      settlements: [invoiceSettlement()],
    });
    const orderRepo = makeOrderRepo(order);
    const notificationService = makeNotificationService();

    await markInvoiceOrderAsPaid(
      { stripeInvoiceId: "inv_1" },
      { orderRepo, userRepo: makeUserRepo(), notificationService }
    );

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.settlements[0]?.status).toBe("paid");
    expect(saved?.settlements[0]?.paidAt).toBeInstanceOf(Date);
    expect(saved?.status.value).toBe("paid");
    expect(notificationService.sendInvoicePaid).toHaveBeenCalled();
  });

  it("他の請求がまだ未払いの注文は、この決済単位がpaidでも注文はprocessingのまま", async () => {
    const order = makeOrder({
      items: [
        afterOrderItem(),
        makeOrderItem({
          paymentTiming: "after_order",
          settlementId: "settlement-2",
        }),
      ],
      settlements: [
        invoiceSettlement(),
        invoiceSettlement({
          id: "settlement-2",
          stripeInvoiceId: "inv_2",
        }),
      ],
    });
    const orderRepo = makeOrderRepo(order);

    await markInvoiceOrderAsPaid(
      { stripeInvoiceId: "inv_1" },
      {
        orderRepo,
        userRepo: makeUserRepo(),
        notificationService: makeNotificationService(),
      }
    );

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.status.value).toBe("processing");
  });

  it("すでにpaid済みの決済単位は何もしない（Webhook再配信の冪等性）", async () => {
    const order = makeOrder({
      status: "paid",
      items: [afterOrderItem()],
      settlements: [invoiceSettlement({ status: "paid", paidAt: new Date() })],
    });
    const orderRepo = makeOrderRepo(order);
    const notificationService = makeNotificationService();

    await markInvoiceOrderAsPaid(
      { stripeInvoiceId: "inv_1" },
      { orderRepo, userRepo: makeUserRepo(), notificationService }
    );

    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(notificationService.sendInvoicePaid).not.toHaveBeenCalled();
  });

  it("該当する注文が無いInvoice（サブスクリプション請求等）は無視する", async () => {
    const orderRepo = makeOrderRepo();
    const notificationService = makeNotificationService();

    await markInvoiceOrderAsPaid(
      { stripeInvoiceId: "inv_subscription" },
      { orderRepo, userRepo: makeUserRepo(), notificationService }
    );

    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(notificationService.sendInvoicePaid).not.toHaveBeenCalled();
  });

  // issue #270: 運営者が未払い決済単位をキャンセルした後、Stripeが遅延Webhookを
  // 再送すると発生しうる
  it("キャンセル済みの決済単位への入金は例外を投げず、Sentryに記録して正常終了する（Webhookに200を返しStripeのリトライを止めるため）", async () => {
    const order = makeOrder({
      status: "cancelled",
      items: [afterOrderItem()],
      settlements: [
        invoiceSettlement({ status: "cancelled", cancelledAt: new Date() }),
      ],
    });
    const orderRepo = makeOrderRepo(order);
    const notificationService = makeNotificationService();

    await expect(
      markInvoiceOrderAsPaid(
        { stripeInvoiceId: "inv_1" },
        { orderRepo, userRepo: makeUserRepo(), notificationService }
      )
    ).resolves.toBeUndefined();

    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(notificationService.sendInvoicePaid).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ useCase: "markInvoiceOrderAsPaid" }),
      })
    );
  });
});
