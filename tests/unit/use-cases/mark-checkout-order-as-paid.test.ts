import { describe, it, expect, vi } from "vitest";

import { markCheckoutOrderAsPaid } from "@/use-cases/mark-checkout-order-as-paid";
import {
  makeOrderRepo,
  makeUserRepo,
  makeNotificationService,
  makeOrder,
  makeOrderItem,
  makeSettlement,
  makeErrorReporter,
} from "./helpers";

describe("markCheckoutOrderAsPaid", () => {
  it("決済単位をpaidにし、全明細が支払い済みなら注文もpaidにしてsendCheckoutPaidを呼ぶ", async () => {
    const order = makeOrder();
    const orderRepo = makeOrderRepo(order);
    const notificationService = makeNotificationService();

    await markCheckoutOrderAsPaid(
      { stripeCheckoutSessionId: "sess_1" },
      {
        orderRepo,
        userRepo: makeUserRepo(),
        notificationService,
        errorReporter: makeErrorReporter(),
      }
    );

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.settlements[0]?.status).toBe("paid");
    expect(saved?.settlements[0]?.paidAt).toBeInstanceOf(Date);
    expect(saved?.status.value).toBe("paid");
    expect(notificationService.sendCheckoutPaid).toHaveBeenCalled();
  });

  it("請求作成前のafter_order明細が残っている注文は、決済単位がpaidでも注文はprocessingのまま", async () => {
    const order = makeOrder({
      items: [
        makeOrderItem(),
        makeOrderItem({ paymentTiming: "after_order", settlementId: null }),
      ],
    });
    const orderRepo = makeOrderRepo(order);
    const notificationService = makeNotificationService();

    await markCheckoutOrderAsPaid(
      { stripeCheckoutSessionId: "sess_1" },
      {
        orderRepo,
        userRepo: makeUserRepo(),
        notificationService,
        errorReporter: makeErrorReporter(),
      }
    );

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.settlements[0]?.status).toBe("paid");
    expect(saved?.status.value).toBe("processing");
    expect(notificationService.sendCheckoutPaid).toHaveBeenCalled();
  });

  it("すでにpaid済みの決済単位は何もしない（Webhook再配信の冪等性）", async () => {
    const order = makeOrder({
      status: "paid",
      settlements: [makeSettlement({ status: "paid", paidAt: new Date() })],
    });
    const orderRepo = makeOrderRepo(order);
    const notificationService = makeNotificationService();

    await markCheckoutOrderAsPaid(
      { stripeCheckoutSessionId: "sess_1" },
      {
        orderRepo,
        userRepo: makeUserRepo(),
        notificationService,
        errorReporter: makeErrorReporter(),
      }
    );

    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(notificationService.sendCheckoutPaid).not.toHaveBeenCalled();
  });

  it("該当する注文が無ければエラー（Webhookを500で再試行させる）", async () => {
    const orderRepo = makeOrderRepo();

    await expect(
      markCheckoutOrderAsPaid(
        { stripeCheckoutSessionId: "sess_unknown" },
        {
          orderRepo,
          userRepo: makeUserRepo(),
          notificationService: makeNotificationService(),
          errorReporter: makeErrorReporter(),
        }
      )
    ).rejects.toThrow("注文が見つかりません");
  });

  it("注文に該当セッションIDの決済単位が無ければエラー", async () => {
    const order = makeOrder({
      settlements: [makeSettlement({ stripeCheckoutSessionId: "sess_other" })],
    });
    const orderRepo = makeOrderRepo(order);

    await expect(
      markCheckoutOrderAsPaid(
        { stripeCheckoutSessionId: "sess_1" },
        {
          orderRepo,
          userRepo: makeUserRepo(),
          notificationService: makeNotificationService(),
          errorReporter: makeErrorReporter(),
        }
      )
    ).rejects.toThrow("決済単位が見つかりません");
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it("会員が見つからない（退会済み等）場合も入金は記録し、通知だけ送らない", async () => {
    const orderRepo = makeOrderRepo(makeOrder());
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findById).mockResolvedValue(null);
    const notificationService = makeNotificationService();

    await markCheckoutOrderAsPaid(
      { stripeCheckoutSessionId: "sess_1" },
      {
        orderRepo,
        userRepo,
        notificationService,
        errorReporter: makeErrorReporter(),
      }
    );

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.settlements[0]?.status).toBe("paid");
    expect(notificationService.sendCheckoutPaid).not.toHaveBeenCalled();
  });

  // issue #270: 運営者が未払い決済単位をキャンセルした後、顧客が古いCheckoutページで
  // 決済を完了させる、またはStripeが遅延Webhookを再送すると発生しうる
  it("キャンセル済みの決済単位への入金は例外を投げず、ErrorReporterへ通知して正常終了する（Webhookに200を返しStripeのリトライを止めるため）", async () => {
    const order = makeOrder({
      status: "cancelled",
      settlements: [
        makeSettlement({ status: "cancelled", cancelledAt: new Date() }),
      ],
    });
    const orderRepo = makeOrderRepo(order);
    const notificationService = makeNotificationService();
    const errorReporter = makeErrorReporter();

    await expect(
      markCheckoutOrderAsPaid(
        { stripeCheckoutSessionId: "sess_1" },
        {
          orderRepo,
          userRepo: makeUserRepo(),
          notificationService,
          errorReporter,
        }
      )
    ).resolves.toBeUndefined();

    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(notificationService.sendCheckoutPaid).not.toHaveBeenCalled();
    expect(errorReporter.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({
          useCase: "markCheckoutOrderAsPaid",
        }),
      })
    );
  });
});
