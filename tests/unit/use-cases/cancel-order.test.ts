import { describe, it, expect, vi } from "vitest";
import { cancelOrder } from "@/use-cases/cancel-order";
import { makeOrderRepo, makeOrder, makeSettlement } from "./helpers";

describe("cancelOrder", () => {
  it("キャンセル可能な注文と未払いの決済単位をcancelledに更新する", async () => {
    const order = makeOrder();
    const orderRepo = makeOrderRepo(order);

    await cancelOrder({ orderId: order.id }, { orderRepo });

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.status.value).toBe("cancelled");
    expect(saved?.settlements[0]?.status).toBe("cancelled");
    expect(saved?.settlements[0]?.cancelledAt).toBeInstanceOf(Date);
  });

  it("支払い済みの注文はエラーを投げる", async () => {
    const order = makeOrder({ status: "paid" });
    const orderRepo = makeOrderRepo(order);

    await expect(
      cancelOrder({ orderId: order.id }, { orderRepo })
    ).rejects.toThrow("キャンセルできません");
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it("支払い済みの決済単位を含む注文はエラーを投げる", async () => {
    const order = makeOrder({
      settlements: [makeSettlement({ status: "paid", paidAt: new Date() })],
    });
    const orderRepo = makeOrderRepo(order);

    await expect(
      cancelOrder({ orderId: order.id }, { orderRepo })
    ).rejects.toThrow("キャンセルできません");
  });

  it("注文が存在しなければエラーを投げる", async () => {
    await expect(
      cancelOrder({ orderId: "unknown" }, { orderRepo: makeOrderRepo() })
    ).rejects.toThrow("注文が見つかりません");
  });
});
