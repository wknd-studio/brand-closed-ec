import { describe, it, expect, vi } from "vitest";
import { markCheckoutOrderAsPaid } from "@/use-cases/mark-checkout-order-as-paid";
import {
  makeOrderRepo,
  makeUserRepo,
  makeNotificationService,
  makeOrder,
} from "./helpers";

describe("markCheckoutOrderAsPaid", () => {
  it("ステータスをpaidに更新してsendCheckoutPaidを呼ぶ", async () => {
    const order = makeOrder({
      status: "pending_payment",
      stripeCheckoutSessionId: "sess_1",
    });
    const orderRepo = makeOrderRepo(order);
    vi.mocked(orderRepo.findByStripeCheckoutSessionId).mockResolvedValue(order);
    const notificationService = makeNotificationService();

    await markCheckoutOrderAsPaid(
      { stripeCheckoutSessionId: "sess_1" },
      { orderRepo, userRepo: makeUserRepo(), notificationService }
    );

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.status.value).toBe("paid");
    expect(notificationService.sendCheckoutPaid).toHaveBeenCalled();
  });

  it("すでにpaid済みの場合は何もしない（冪等）", async () => {
    const order = makeOrder({
      status: "paid",
      stripeCheckoutSessionId: "sess_1",
    });
    const orderRepo = makeOrderRepo(order);
    vi.mocked(orderRepo.findByStripeCheckoutSessionId).mockResolvedValue(order);
    const notificationService = makeNotificationService();

    await markCheckoutOrderAsPaid(
      { stripeCheckoutSessionId: "sess_1" },
      { orderRepo, userRepo: makeUserRepo(), notificationService }
    );

    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(notificationService.sendCheckoutPaid).not.toHaveBeenCalled();
  });
});
