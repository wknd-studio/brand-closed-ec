import { describe, it, expect, vi } from "vitest";

import { markInvoiceOrderAsPaid } from "@/use-cases/mark-invoice-order-as-paid";
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
    expect(notificationService.sendInvoicePaid).toHaveBeenCalled();
  });

  it("入金による状態の変化は system が変えたとして保存する", async () => {
    const orderRepo = makeOrderRepo(
      makeOrder({
        items: [afterOrderItem()],
        settlements: [invoiceSettlement()],
      })
    );

    await markInvoiceOrderAsPaid(
      { stripeInvoiceId: "inv_1" },
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
        errorReporter: makeErrorReporter(),
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
      {
        orderRepo,
        userRepo: makeUserRepo(),
        notificationService,
        errorReporter: makeErrorReporter(),
      }
    );

    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(notificationService.sendInvoicePaid).not.toHaveBeenCalled();
  });

  it("該当する注文が無いInvoice（サブスクリプション請求等）は無視する", async () => {
    const orderRepo = makeOrderRepo();
    const notificationService = makeNotificationService();

    await markInvoiceOrderAsPaid(
      { stripeInvoiceId: "inv_subscription" },
      {
        orderRepo,
        userRepo: makeUserRepo(),
        notificationService,
        errorReporter: makeErrorReporter(),
      }
    );

    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(notificationService.sendInvoicePaid).not.toHaveBeenCalled();
  });

  it("注文に該当Invoice IDの決済単位が無ければ、何も記録せず正常終了する", async () => {
    const order = makeOrder({
      items: [afterOrderItem()],
      settlements: [invoiceSettlement({ stripeInvoiceId: "inv_other" })],
    });
    const orderRepo = makeOrderRepo(order);
    const notificationService = makeNotificationService();

    await expect(
      markInvoiceOrderAsPaid(
        { stripeInvoiceId: "inv_1" },
        {
          orderRepo,
          userRepo: makeUserRepo(),
          notificationService,
          errorReporter: makeErrorReporter(),
        }
      )
    ).resolves.toBeUndefined();

    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(notificationService.sendInvoicePaid).not.toHaveBeenCalled();
  });

  it("会員が見つからない（退会済み等）場合も入金は記録し、通知だけ送らない", async () => {
    const order = makeOrder({
      items: [afterOrderItem()],
      settlements: [invoiceSettlement()],
    });
    const orderRepo = makeOrderRepo(order);
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findById).mockResolvedValue(null);
    const notificationService = makeNotificationService();

    await markInvoiceOrderAsPaid(
      { stripeInvoiceId: "inv_1" },
      {
        orderRepo,
        userRepo,
        notificationService,
        errorReporter: makeErrorReporter(),
      }
    );

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.settlements[0]?.status).toBe("paid");
    expect(notificationService.sendInvoicePaid).not.toHaveBeenCalled();
  });

  // issue #270: 運営者が未払い決済単位をキャンセルした後、Stripeが遅延Webhookを
  // 再送すると発生しうる
  it("キャンセル済みの決済単位への入金は例外を投げず、ErrorReporterへ通知して正常終了する（Webhookに200を返しStripeのリトライを止めるため）", async () => {
    const order = makeOrder({
      status: "cancelled",
      items: [afterOrderItem()],
      settlements: [
        invoiceSettlement({ status: "cancelled", cancelledAt: new Date() }),
      ],
    });
    const orderRepo = makeOrderRepo(order);
    const notificationService = makeNotificationService();
    const errorReporter = makeErrorReporter();

    await expect(
      markInvoiceOrderAsPaid(
        { stripeInvoiceId: "inv_1" },
        {
          orderRepo,
          userRepo: makeUserRepo(),
          notificationService,
          errorReporter,
        }
      )
    ).resolves.toBeUndefined();

    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(notificationService.sendInvoicePaid).not.toHaveBeenCalled();
    expect(errorReporter.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ useCase: "markInvoiceOrderAsPaid" }),
      })
    );
  });

  // 楽観ロック（issue #721）: 入金は実際にされているため、読んでから保存するまでの間に
  // 別の書き手（請求作成・運営者のキャンセル・同じイベントの同時配信）がコミットしていたら、
  // 注文を読み直してやり直す。読み直した注文で、支払い済み・キャンセル済みの扱いをし直す
  describe("保存の競合（楽観ロック）", () => {
    const ORDER = () =>
      makeOrder({
        items: [afterOrderItem()],
        settlements: [invoiceSettlement()],
      });
    const PAID_ORDER = () =>
      makeOrder({
        items: [afterOrderItem()],
        settlements: [
          invoiceSettlement({ status: "paid", paidAt: new Date() }),
        ],
      });
    const CANCELLED_ORDER = () =>
      makeOrder({
        status: "cancelled",
        items: [afterOrderItem()],
        settlements: [
          invoiceSettlement({ status: "cancelled", cancelledAt: new Date() }),
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

      await markInvoiceOrderAsPaid({ stripeInvoiceId: "inv_1" }, deps);

      expect(orderRepo.findByStripeInvoiceId).toHaveBeenCalledTimes(2);
      expect(orderRepo.save).toHaveBeenCalledTimes(2);
      expect(
        vi.mocked(orderRepo.save).mock.calls[1]?.[0].settlements[0]?.status
      ).toBe("paid");
      expect(deps.notificationService.sendInvoicePaid).toHaveBeenCalledTimes(1);
    });

    it("読み直した注文で決済単位が支払い済みなら（同じイベントの同時配信）、保存も通知もせずに終える", async () => {
      const orderRepo = makeOrderRepo(ORDER());
      vi.mocked(orderRepo.findByStripeInvoiceId)
        .mockResolvedValueOnce(ORDER())
        .mockResolvedValueOnce(PAID_ORDER());
      vi.mocked(orderRepo.save).mockRejectedValueOnce(conflict());
      const deps = depsWith(orderRepo);

      await markInvoiceOrderAsPaid({ stripeInvoiceId: "inv_1" }, deps);

      expect(orderRepo.save).toHaveBeenCalledTimes(1);
      expect(deps.notificationService.sendInvoicePaid).not.toHaveBeenCalled();
    });

    it("読み直した注文で決済単位がキャンセル済みなら、要対応として通知し、保存せずに終える", async () => {
      const orderRepo = makeOrderRepo(ORDER());
      vi.mocked(orderRepo.findByStripeInvoiceId)
        .mockResolvedValueOnce(ORDER())
        .mockResolvedValueOnce(CANCELLED_ORDER());
      vi.mocked(orderRepo.save).mockRejectedValueOnce(conflict());
      const deps = depsWith(orderRepo);

      await markInvoiceOrderAsPaid({ stripeInvoiceId: "inv_1" }, deps);

      expect(orderRepo.save).toHaveBeenCalledTimes(1);
      expect(deps.errorReporter.captureException).toHaveBeenCalledTimes(1);
      expect(deps.notificationService.sendInvoicePaid).not.toHaveBeenCalled();
    });

    it("3回続けて競合したら OrderConcurrentlyModifiedError を投げる（Webhookは失敗を返し、Stripeが再送する）", async () => {
      const orderRepo = makeOrderRepo(ORDER());
      vi.mocked(orderRepo.save).mockRejectedValue(conflict());
      const deps = depsWith(orderRepo);

      await expect(
        markInvoiceOrderAsPaid({ stripeInvoiceId: "inv_1" }, deps)
      ).rejects.toBeInstanceOf(OrderConcurrentlyModifiedError);
      expect(orderRepo.save).toHaveBeenCalledTimes(3);
      expect(deps.notificationService.sendInvoicePaid).not.toHaveBeenCalled();
    });

    it("競合以外の保存の失敗は、やり直さずに投げる", async () => {
      const orderRepo = makeOrderRepo(ORDER());
      vi.mocked(orderRepo.save).mockRejectedValue(new Error("Order保存に失敗"));

      await expect(
        markInvoiceOrderAsPaid(
          { stripeInvoiceId: "inv_1" },
          depsWith(orderRepo)
        )
      ).rejects.toThrow("Order保存に失敗");
      expect(orderRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
