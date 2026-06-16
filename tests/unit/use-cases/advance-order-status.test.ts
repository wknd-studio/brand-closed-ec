import { describe, it, expect, vi } from "vitest";
import { advanceOrderStatus } from "@/use-cases/advance-order-status";
import {
  makeOrderRepo,
  makeUserRepo,
  makeNotificationService,
  makeOrder,
} from "./helpers";

describe("advanceOrderStatus", () => {
  it("ステータスを次に進めてsaveする", async () => {
    const order = makeOrder({ status: "paid" });
    const orderRepo = makeOrderRepo(order);

    await advanceOrderStatus(
      { orderId: order.id },
      {
        orderRepo,
        userRepo: makeUserRepo(),
        notificationService: makeNotificationService(),
      }
    );

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.status.value).toBe("sourcing");
  });

  it("shippingに進む際に発送通知メールを送信する", async () => {
    const order = makeOrder({ status: "preparing" });
    const orderRepo = makeOrderRepo(order);
    const notificationService = makeNotificationService();

    await advanceOrderStatus(
      { orderId: order.id },
      { orderRepo, userRepo: makeUserRepo(), notificationService }
    );

    expect(notificationService.sendShippingNotification).toHaveBeenCalledWith(
      order.id,
      expect.any(String)
    );
  });

  it("deliveredに進む際に配送完了メールを送信する", async () => {
    const order = makeOrder({ status: "shipping" });
    const orderRepo = makeOrderRepo(order);
    const notificationService = makeNotificationService();

    await advanceOrderStatus(
      { orderId: order.id },
      { orderRepo, userRepo: makeUserRepo(), notificationService }
    );

    expect(notificationService.sendDeliveryNotification).toHaveBeenCalledWith(
      order.id,
      expect.any(String)
    );
  });
});
