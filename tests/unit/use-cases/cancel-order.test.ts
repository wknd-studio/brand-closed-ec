import { describe, it, expect, vi } from "vitest";
import { cancelOrder } from "@/use-cases/cancel-order";
import { makeOrderRepo, makeOrder } from "./helpers";

describe("cancelOrder", () => {
  it("キャンセル可能な注文をcancelledに更新する", async () => {
    const order = makeOrder({ status: "confirming" });
    const orderRepo = makeOrderRepo(order);

    await cancelOrder({ orderId: order.id }, { orderRepo });

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.status.value).toBe("cancelled");
  });

  it("キャンセル不可の注文はエラーを投げる", async () => {
    const order = makeOrder({ status: "delivered" });
    const orderRepo = makeOrderRepo(order);

    await expect(
      cancelOrder({ orderId: order.id }, { orderRepo })
    ).rejects.toThrow();
  });
});
