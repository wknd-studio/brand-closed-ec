import { describe, it, expect, vi } from "vitest";

import { markCheckoutOrderAsPaid } from "@/use-cases/mark-checkout-order-as-paid";
import { OrderConcurrentlyModifiedError } from "@/domain/errors/order-concurrently-modified-error";
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

  it("決済完了による状態の変化は system が変えたとして保存する", async () => {
    const orderRepo = makeOrderRepo(makeOrder());

    await markCheckoutOrderAsPaid(
      { stripeCheckoutSessionId: "sess_1" },
      {
        orderRepo,
        userRepo: makeUserRepo(),
        notificationService: makeNotificationService(),
        errorReporter: makeErrorReporter(),
      }
    );

    expect(vi.mocked(orderRepo.save).mock.calls[0]?.[1]).toEqual({
      type: "system",
    });
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

  // 楽観ロック（issue #721）: 入金は実際にされているため、読んでから保存するまでの間に
  // 別の書き手（請求作成・運営者のキャンセル・同じイベントの同時配信）がコミットしていたら、
  // 注文を読み直してやり直す。読み直した注文で、支払い済み・キャンセル済みの扱いをし直す
  describe("保存の競合（楽観ロック）", () => {
    const ORDER = () => makeOrder();
    const PAID_ORDER = () =>
      makeOrder({
        settlements: [makeSettlement({ status: "paid", paidAt: new Date() })],
      });
    const CANCELLED_ORDER = () =>
      makeOrder({
        status: "cancelled",
        settlements: [
          makeSettlement({ status: "cancelled", cancelledAt: new Date() }),
        ],
      });
    const conflict = () =>
      new OrderConcurrentlyModifiedError(
        "00000000-0000-0000-0000-000000000001"
      );

    function depsWith(orderRepo: ReturnType<typeof makeOrderRepo>) {
      return {
        orderRepo,
        userRepo: makeUserRepo(),
        notificationService: makeNotificationService(),
        errorReporter: makeErrorReporter(),
      };
    }

    it("保存が競合したら、注文を読み直して保存し直し、通知は1回だけ送る", async () => {
      const orderRepo = makeOrderRepo(ORDER());
      vi.mocked(orderRepo.save).mockRejectedValueOnce(conflict());
      const deps = depsWith(orderRepo);

      await markCheckoutOrderAsPaid(
        { stripeCheckoutSessionId: "sess_1" },
        deps
      );

      expect(orderRepo.findByStripeCheckoutSessionId).toHaveBeenCalledTimes(2);
      expect(orderRepo.save).toHaveBeenCalledTimes(2);
      expect(
        vi.mocked(orderRepo.save).mock.calls[1]?.[0].settlements[0]?.status
      ).toBe("paid");
      expect(deps.notificationService.sendCheckoutPaid).toHaveBeenCalledTimes(
        1
      );
    });

    it("読み直した注文で決済単位が支払い済みなら（同じイベントの同時配信）、保存も通知もせずに終える", async () => {
      const orderRepo = makeOrderRepo(ORDER());
      vi.mocked(orderRepo.findByStripeCheckoutSessionId)
        .mockResolvedValueOnce(ORDER())
        .mockResolvedValueOnce(PAID_ORDER());
      vi.mocked(orderRepo.save).mockRejectedValueOnce(conflict());
      const deps = depsWith(orderRepo);

      await markCheckoutOrderAsPaid(
        { stripeCheckoutSessionId: "sess_1" },
        deps
      );

      expect(orderRepo.save).toHaveBeenCalledTimes(1);
      expect(deps.notificationService.sendCheckoutPaid).not.toHaveBeenCalled();
    });

    it("読み直した注文で決済単位がキャンセル済みなら、要対応として通知し、保存せずに終える", async () => {
      const orderRepo = makeOrderRepo(ORDER());
      vi.mocked(orderRepo.findByStripeCheckoutSessionId)
        .mockResolvedValueOnce(ORDER())
        .mockResolvedValueOnce(CANCELLED_ORDER());
      vi.mocked(orderRepo.save).mockRejectedValueOnce(conflict());
      const deps = depsWith(orderRepo);

      await markCheckoutOrderAsPaid(
        { stripeCheckoutSessionId: "sess_1" },
        deps
      );

      expect(orderRepo.save).toHaveBeenCalledTimes(1);
      expect(deps.errorReporter.captureException).toHaveBeenCalledTimes(1);
      expect(deps.notificationService.sendCheckoutPaid).not.toHaveBeenCalled();
    });

    it("3回続けて競合したら OrderConcurrentlyModifiedError を投げる（Webhookは失敗を返し、Stripeが再送する）", async () => {
      const orderRepo = makeOrderRepo(ORDER());
      vi.mocked(orderRepo.save).mockRejectedValue(conflict());
      const deps = depsWith(orderRepo);

      await expect(
        markCheckoutOrderAsPaid({ stripeCheckoutSessionId: "sess_1" }, deps)
      ).rejects.toBeInstanceOf(OrderConcurrentlyModifiedError);
      expect(orderRepo.save).toHaveBeenCalledTimes(3);
      expect(deps.notificationService.sendCheckoutPaid).not.toHaveBeenCalled();
    });

    it("競合以外の保存の失敗は、やり直さずに投げる", async () => {
      const orderRepo = makeOrderRepo(ORDER());
      vi.mocked(orderRepo.save).mockRejectedValue(new Error("Order保存に失敗"));

      await expect(
        markCheckoutOrderAsPaid(
          { stripeCheckoutSessionId: "sess_1" },
          depsWith(orderRepo)
        )
      ).rejects.toThrow("Order保存に失敗");
      expect(orderRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
