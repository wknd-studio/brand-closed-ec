import { describe, it, expect, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { placeOrder, type PlaceOrderInput } from "@/use-cases/place-order";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import { Money } from "@/domain/value-objects/money";
import {
  makeUser,
  makeUserRepo,
  makeOrderRepo,
  makeAddressRepo,
  makeProductRepo,
  makePaymentGateway,
  makeNotificationService,
  fixedProduct,
  negotiableProduct,
  afterOrderFixedProduct,
} from "./helpers";

const baseInput = {
  clerkUserId: "clerk-1",
  cartItems: [
    { sanityProductId: "prod-1", quantity: 1, productName: "固定商品" },
  ],
  shippingAddressId: "shipping-addr",
  billingAddressId: "billing-addr",
  baseUrl: "http://localhost:3000",
};

describe("placeOrder", () => {
  it("固定商品のみならcheckoutフローでStripeセッションURLを返す", async () => {
    const deps = {
      userRepo: makeUserRepo(),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
    };

    const result = await placeOrder(baseInput, deps);

    expect(result.redirectUrl).toBe("https://stripe.com/pay/sess_1");
    expect(deps.paymentGateway.createCheckoutSession).toHaveBeenCalled();
    // 決済単位を含む注文の新規作成（月次上限チェック込み） → Checkout Session IDを
    // 決済単位に反映して再保存
    expect(deps.orderRepo.saveNewOrderWithLimitCheck).toHaveBeenCalledTimes(1);
    expect(deps.orderRepo.save).toHaveBeenCalledTimes(1);

    const firstSaved = vi.mocked(deps.orderRepo.saveNewOrderWithLimitCheck).mock
      .calls[0][0];
    expect(firstSaved.status.value).toBe("processing");
    expect(firstSaved.settlements).toHaveLength(1);
    expect(firstSaved.settlements[0]).toMatchObject({
      flow: "checkout",
      status: "pending_payment",
      stripeCheckoutSessionId: null,
    });
    expect(firstSaved.settlements[0].amount.amount).toBe(100_000);
    expect(firstSaved.items).toHaveLength(1);
    expect(firstSaved.items[0]).toMatchObject({
      paymentTiming: "at_order",
      settlementId: firstSaved.settlements[0].id,
    });

    const lastSaved = vi.mocked(deps.orderRepo.save).mock.calls[0][0];
    expect(lastSaved.settlements[0].stripeCheckoutSessionId).toBe("sess_1");
  });

  it("交渉商品を含む場合はinvoiceフローで invoice-complete URLを返す", async () => {
    const deps = {
      userRepo: makeUserRepo(),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([negotiableProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
    };

    const result = await placeOrder(
      {
        ...baseInput,
        cartItems: [
          { sanityProductId: "prod-2", quantity: 1, productName: "交渉商品" },
        ],
      },
      deps
    );

    expect(result.redirectUrl).toContain("/order/invoice-complete");
    expect(deps.orderRepo.saveNewOrderWithLimitCheck).toHaveBeenCalledTimes(1);
    expect(deps.orderRepo.save).not.toHaveBeenCalled();
    expect(deps.paymentGateway.createCheckoutSession).not.toHaveBeenCalled();
    expect(deps.notificationService.sendOrderConfirming).toHaveBeenCalled();
    expect(
      deps.notificationService.sendOrderOperatorNotification
    ).toHaveBeenCalled();

    // after_orderの明細は決済単位を作らず、settlement_id=NULLのまま対応待ちになる
    const saved = vi.mocked(deps.orderRepo.saveNewOrderWithLimitCheck).mock
      .calls[0][0];
    expect(saved.settlements).toEqual([]);
    expect(saved.items[0]).toMatchObject({
      paymentTiming: "after_order",
      settlementId: null,
    });
  });

  it("after_orderの固定価格商品のみの場合も決済単位を作らずinvoice-completeへ進む", async () => {
    const deps = {
      userRepo: makeUserRepo(),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([afterOrderFixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
    };

    const result = await placeOrder(
      {
        ...baseInput,
        cartItems: [
          {
            sanityProductId: "prod-3",
            quantity: 1,
            productName: "後払い固定商品",
          },
        ],
      },
      deps
    );

    const saved = vi.mocked(deps.orderRepo.saveNewOrderWithLimitCheck).mock
      .calls[0][0];
    expect(result.redirectUrl).toBe(
      `/order/invoice-complete?order_id=${saved.id}`
    );
    expect(saved.settlements).toEqual([]);
    expect(deps.paymentGateway.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("月次上限を超えた場合はLimitExceededErrorを投げる", async () => {
    const orderRepo = makeOrderRepo();
    vi.mocked(orderRepo.sumConfirmedAmountByUserId).mockResolvedValue(
      4_000_000
    );

    const deps = {
      userRepo: makeUserRepo(),
      orderRepo,
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([
        { ...fixedProduct, unitPrice: Money.of(2_000_000) },
      ]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
    };

    await expect(placeOrder(baseInput, deps)).rejects.toThrow(
      LimitExceededError
    );
    expect(deps.orderRepo.saveNewOrderWithLimitCheck).not.toHaveBeenCalled();
    expect(deps.orderRepo.save).not.toHaveBeenCalled();
  });

  it("支払いタイミングが混在するカートでも、合計で上限超過ならOrderが作成されない", async () => {
    const orderRepo = makeOrderRepo();
    vi.mocked(orderRepo.sumConfirmedAmountByUserId).mockResolvedValue(
      4_000_000
    );

    const deps = {
      userRepo: makeUserRepo(),
      orderRepo,
      addressRepo: makeAddressRepo(),
      // standardランクの月次上限は5,000,000円。confirmedAmount(4,000,000) +
      // at_order(2,000,000) + after_order(2,000,000) = 8,000,000 > 5,000,000
      productRepo: makeProductRepo([
        { ...fixedProduct, unitPrice: Money.of(2_000_000) },
        { ...afterOrderFixedProduct, unitPrice: Money.of(2_000_000) },
      ]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
    };

    await expect(
      placeOrder(
        {
          ...baseInput,
          cartItems: [
            { sanityProductId: "prod-1", quantity: 1, productName: "固定商品" },
            {
              sanityProductId: "prod-3",
              quantity: 1,
              productName: "後払い固定商品",
            },
          ],
        },
        deps
      )
    ).rejects.toThrow(LimitExceededError);

    expect(orderRepo.saveNewOrderWithLimitCheck).not.toHaveBeenCalled();
    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(orderRepo.delete).not.toHaveBeenCalled();
    expect(deps.paymentGateway.createCheckoutSession).not.toHaveBeenCalled();
    expect(deps.notificationService.sendOrderConfirming).not.toHaveBeenCalled();
  });

  it("カートに存在しない商品IDが含まれる場合はエラーを投げる（カート改竄対策）", async () => {
    const deps = {
      userRepo: makeUserRepo(),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
    };

    await expect(
      placeOrder(
        {
          ...baseInput,
          cartItems: [
            {
              sanityProductId: "prod-does-not-exist",
              quantity: 1,
              productName: "偽装商品",
            },
          ],
        },
        deps
      )
    ).rejects.toThrow();
    expect(deps.orderRepo.saveNewOrderWithLimitCheck).not.toHaveBeenCalled();
  });

  it("自分のランクでは閲覧できない商品が含まれる場合はエラーを投げる（カート改竄対策）", async () => {
    const deps = {
      userRepo: makeUserRepo(makeUser({ rank: "starter" })),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([{ ...fixedProduct, minRank: "premium" }]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
    };

    await expect(placeOrder(baseInput, deps)).rejects.toThrow();
    expect(deps.orderRepo.saveNewOrderWithLimitCheck).not.toHaveBeenCalled();
  });

  it("支払いタイミングが混在するカートでも注文は1件のまま。at_order明細だけをCheckout決済単位に紐付け、after_order明細は未紐付けにする", async () => {
    const orderRepo = makeOrderRepo();
    const deps = {
      userRepo: makeUserRepo(),
      orderRepo,
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct, afterOrderFixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
    };

    const result = await placeOrder(
      {
        ...baseInput,
        cartItems: [
          { sanityProductId: "prod-1", quantity: 1, productName: "固定商品" },
          {
            sanityProductId: "prod-3",
            quantity: 2,
            productName: "後払い固定商品",
          },
        ],
      },
      deps
    );

    expect(result.redirectUrl).toBe("https://stripe.com/pay/sess_1");
    expect(deps.paymentGateway.createCheckoutSession).toHaveBeenCalledTimes(1);

    const createdOrder = vi.mocked(orderRepo.saveNewOrderWithLimitCheck).mock
      .calls[0][0];
    const updatedOrder = vi.mocked(orderRepo.save).mock.calls[0][0];
    expect(updatedOrder.id).toBe(createdOrder.id);

    const order = createdOrder;
    expect(order.items).toHaveLength(2);
    expect(order.settlements).toHaveLength(1);
    // 決済単位の金額はat_order明細のみ（after_orderは請求作成時に別の決済単位になる）
    expect(order.settlements[0].amount.amount).toBe(100_000);

    const atOrderItem = order.items.find((i) => i.paymentTiming === "at_order");
    const afterOrderItem = order.items.find(
      (i) => i.paymentTiming === "after_order"
    );
    expect(atOrderItem?.settlementId).toBe(order.settlements[0].id);
    expect(afterOrderItem?.settlementId).toBeNull();

    // Checkoutに渡す明細もat_orderのみ
    const [, lineItems] = vi.mocked(deps.paymentGateway.createCheckoutSession)
      .mock.calls[0];
    expect(lineItems).toEqual([
      { productName: "固定商品", unitPrice: 100_000, quantity: 1 },
    ]);

    // after_orderが含まれるので運営者・会員へ確認通知を送る
    expect(deps.notificationService.sendOrderConfirming).toHaveBeenCalled();
    expect(
      deps.notificationService.sendOrderOperatorNotification
    ).toHaveBeenCalled();
  });

  it("at_orderのみの注文ではafter_order向けの確認通知は送らない", async () => {
    const deps = {
      userRepo: makeUserRepo(),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
    };

    await placeOrder(baseInput, deps);

    expect(deps.notificationService.sendOrderConfirming).not.toHaveBeenCalled();
  });

  it("注文作成（月次上限チェック込みRPC）が失敗した場合、エラーを伝播する（DB関数のトランザクションにより何も保存されないため補償削除は不要）", async () => {
    const orderRepo = makeOrderRepo();
    vi.mocked(orderRepo.saveNewOrderWithLimitCheck).mockRejectedValue(
      new Error("DB接続エラー")
    );

    const deps = {
      userRepo: makeUserRepo(),
      orderRepo,
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
    };

    await expect(placeOrder(baseInput, deps)).rejects.toThrow("DB接続エラー");

    expect(orderRepo.delete).not.toHaveBeenCalled();
    expect(deps.paymentGateway.createCheckoutSession).not.toHaveBeenCalled();
    expect(deps.notificationService.sendOrderConfirming).not.toHaveBeenCalled();
  });

  it("Checkout Session作成に失敗した場合、保存済みの注文を削除しエラーを伝播する（原子性）", async () => {
    const orderRepo = makeOrderRepo();
    const paymentGateway = makePaymentGateway();
    vi.mocked(paymentGateway.createCheckoutSession).mockRejectedValue(
      new Error("Stripeエラー")
    );

    const deps = {
      userRepo: makeUserRepo(),
      orderRepo,
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct]),
      paymentGateway,
      notificationService: makeNotificationService(),
    };

    await expect(placeOrder(baseInput, deps)).rejects.toThrow("Stripeエラー");

    const savedOrderId = vi.mocked(orderRepo.saveNewOrderWithLimitCheck).mock
      .calls[0][0].id;
    expect(orderRepo.delete).toHaveBeenCalledWith(savedOrderId);
  });

  it("Checkout Session作成の失敗を補償削除できなかった場合、Sentryに送信する", async () => {
    const orderRepo = makeOrderRepo();
    vi.mocked(orderRepo.delete).mockRejectedValue(new Error("削除も失敗"));
    const paymentGateway = makePaymentGateway();
    vi.mocked(paymentGateway.createCheckoutSession).mockRejectedValue(
      new Error("Stripeエラー")
    );

    const deps = {
      userRepo: makeUserRepo(),
      orderRepo,
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct]),
      paymentGateway,
      notificationService: makeNotificationService(),
    };

    await expect(placeOrder(baseInput, deps)).rejects.toThrow("Stripeエラー");

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ useCase: "placeOrder" }),
      })
    );
  });

  it("cartItemsにpaymentTimingを注入してもサーバー側ProductSnapshotの値が優先される（カート改竄対策）", async () => {
    const deps = {
      userRepo: makeUserRepo(),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct]), // paymentTiming: at_order
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
    };

    const tamperedInput = {
      ...baseInput,
      cartItems: [
        {
          sanityProductId: "prod-1",
          quantity: 1,
          productName: "固定商品",
          paymentTiming: "after_order",
        },
      ],
    } as unknown as PlaceOrderInput;

    const result = await placeOrder(tamperedInput, deps);

    expect(result.redirectUrl).toBe("https://stripe.com/pay/sess_1");
    expect(deps.paymentGateway.createCheckoutSession).toHaveBeenCalled();
  });
});
