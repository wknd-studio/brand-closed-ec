import { describe, it, expect, vi } from "vitest";
import { markInvoiceOrderAsPaid } from "@/use-cases/mark-invoice-order-as-paid";
import {
  makeOrderRepo,
  makeUserRepo,
  makeNotificationService,
  makeOrder,
} from "./helpers";

describe("markInvoiceOrderAsPaid", () => {
  it("ステータスをpaidに更新してsendInvoicePaidを呼ぶ", async () => {
    const order = makeOrder({
      status: "invoice_sent",
      paymentFlow: "invoice",
      stripeInvoiceId: "inv_1",
    });
    const orderRepo = makeOrderRepo(order);
    vi.mocked(orderRepo.findByStripeInvoiceId).mockResolvedValue(order);
    const notificationService = makeNotificationService();

    await markInvoiceOrderAsPaid(
      { stripeInvoiceId: "inv_1" },
      { orderRepo, userRepo: makeUserRepo(), notificationService }
    );

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.status.value).toBe("paid");
    expect(notificationService.sendInvoicePaid).toHaveBeenCalled();
  });

  it("すでにpaid済みの場合は何もしない（冪等）", async () => {
    const order = makeOrder({
      status: "paid",
      paymentFlow: "invoice",
      stripeInvoiceId: "inv_1",
    });
    const orderRepo = makeOrderRepo(order);
    vi.mocked(orderRepo.findByStripeInvoiceId).mockResolvedValue(order);
    const notificationService = makeNotificationService();

    await markInvoiceOrderAsPaid(
      { stripeInvoiceId: "inv_1" },
      { orderRepo, userRepo: makeUserRepo(), notificationService }
    );

    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(notificationService.sendInvoicePaid).not.toHaveBeenCalled();
  });
});
