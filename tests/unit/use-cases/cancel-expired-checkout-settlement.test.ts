import { describe, it, expect, vi } from "vitest";

import { cancelExpiredCheckoutSettlement } from "@/use-cases/cancel-expired-checkout-settlement";
import {
  makeOrderRepo,
  makeOrder,
  makeOrderItem,
  makeSettlement,
} from "./helpers";

describe("cancelExpiredCheckoutSettlement", () => {
  it("未払いの決済単位をcancelledにし、明細が残らなければ注文もcancelledにしてsystemとして保存する", async () => {
    const orderRepo = makeOrderRepo(makeOrder());

    await cancelExpiredCheckoutSettlement(
      { stripeCheckoutSessionId: "sess_1" },
      { orderRepo }
    );

    expect(orderRepo.findByStripeCheckoutSessionId).toHaveBeenCalledWith(
      "sess_1"
    );
    const [saved, changedBy] = vi.mocked(orderRepo.save).mock.calls[0] ?? [];
    expect(saved?.settlements[0]?.status).toBe("cancelled");
    expect(saved?.settlements[0]?.cancelledAt).toBeInstanceOf(Date);
    expect(saved?.status.value).toBe("cancelled");
    expect(changedBy).toEqual({ type: "system" });
  });

  it("請求作成前のafter_order明細が残っている注文は、決済単位だけcancelledにして注文はprocessingのまま", async () => {
    const orderRepo = makeOrderRepo(
      makeOrder({
        items: [
          makeOrderItem(),
          makeOrderItem({ paymentTiming: "after_order", settlementId: null }),
        ],
      })
    );

    await cancelExpiredCheckoutSettlement(
      { stripeCheckoutSessionId: "sess_1" },
      { orderRepo }
    );

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.settlements[0]?.status).toBe("cancelled");
    expect(saved?.status.value).toBe("processing");
  });

  it("該当する注文が無いセッション（注文の作成に失敗して補償削除された等）は何もしない", async () => {
    const orderRepo = makeOrderRepo();

    await expect(
      cancelExpiredCheckoutSettlement(
        { stripeCheckoutSessionId: "sess_unknown" },
        { orderRepo }
      )
    ).resolves.toBeUndefined();

    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it("注文に該当セッションIDの決済単位が無ければエラー", async () => {
    const orderRepo = makeOrderRepo(
      makeOrder({
        settlements: [
          makeSettlement({ stripeCheckoutSessionId: "sess_other" }),
        ],
      })
    );

    await expect(
      cancelExpiredCheckoutSettlement(
        { stripeCheckoutSessionId: "sess_1" },
        { orderRepo }
      )
    ).rejects.toThrow("決済単位が見つかりません");
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it("すでにcancelledの決済単位は何もしない（運営者のキャンセル済み・Webhookの再配信）", async () => {
    const orderRepo = makeOrderRepo(
      makeOrder({
        status: "cancelled",
        settlements: [
          makeSettlement({ status: "cancelled", cancelledAt: new Date() }),
        ],
      })
    );

    await cancelExpiredCheckoutSettlement(
      { stripeCheckoutSessionId: "sess_1" },
      { orderRepo }
    );

    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it("すでにpaidの決済単位は何もしない", async () => {
    const orderRepo = makeOrderRepo(
      makeOrder({
        status: "paid",
        settlements: [makeSettlement({ status: "paid", paidAt: new Date() })],
      })
    );

    await cancelExpiredCheckoutSettlement(
      { stripeCheckoutSessionId: "sess_1" },
      { orderRepo }
    );

    expect(orderRepo.save).not.toHaveBeenCalled();
  });
});
