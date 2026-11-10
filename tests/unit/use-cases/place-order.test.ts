import { describe, it, expect, vi } from "vitest";

import { placeOrder, type PlaceOrderInput } from "@/use-cases/place-order";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import { ProductNotAccessibleError } from "@/domain/errors/product-not-accessible-error";
import { NegotiableProductNotOrderableError } from "@/domain/errors/negotiable-product-not-orderable-error";
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
  makeErrorReporter,
  makeAddress,
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
      errorReporter: makeErrorReporter(),
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

  it("要相談の商品を含むカートはNegotiableProductNotOrderableErrorになり、注文も決済単位も作られない", async () => {
    // Ver1 では要相談商品を扱わない（docs/domain/catalog.md・#608）。Sanity に古いデータが
    // 残っていた場合に、単価0円の明細・月次上限の対象外の注文が作られないようにする
    const deps = {
      userRepo: makeUserRepo(),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct, negotiableProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
      errorReporter: makeErrorReporter(),
    };

    const promise = placeOrder(
      {
        ...baseInput,
        cartItems: [
          { sanityProductId: "prod-1", quantity: 1, productName: "固定商品" },
          { sanityProductId: "prod-2", quantity: 1, productName: "交渉商品" },
        ],
      },
      deps
    );

    await expect(promise).rejects.toBeInstanceOf(
      NegotiableProductNotOrderableError
    );
    await expect(promise).rejects.toMatchObject({
      productId: "prod-2",
      productName: "交渉商品",
    });
    expect(deps.orderRepo.saveNewOrderWithLimitCheck).not.toHaveBeenCalled();
    expect(deps.orderRepo.save).not.toHaveBeenCalled();
    expect(deps.paymentGateway.createCheckoutSession).not.toHaveBeenCalled();
    expect(deps.notificationService.sendOrderConfirming).not.toHaveBeenCalled();
    expect(
      deps.notificationService.sendOrderOperatorNotification
    ).not.toHaveBeenCalled();
  });

  it("after_orderの固定価格商品のみの場合も決済単位を作らずinvoice-completeへ進む", async () => {
    const deps = {
      userRepo: makeUserRepo(),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([afterOrderFixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
      errorReporter: makeErrorReporter(),
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
      errorReporter: makeErrorReporter(),
    };

    await expect(placeOrder(baseInput, deps)).rejects.toThrow(
      LimitExceededError
    );
    expect(deps.orderRepo.saveNewOrderWithLimitCheck).not.toHaveBeenCalled();
    expect(deps.orderRepo.save).not.toHaveBeenCalled();
  });

  it("確定額の集計が失敗したときは、上限チェックを通さずOrderを作成しない（#597）", async () => {
    const orderRepo = makeOrderRepo();
    vi.mocked(orderRepo.sumConfirmedAmountByUserId).mockRejectedValue(
      new Error("確定額の集計に失敗")
    );

    const deps = {
      userRepo: makeUserRepo(),
      orderRepo,
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
      errorReporter: makeErrorReporter(),
    };

    await expect(placeOrder(baseInput, deps)).rejects.toThrow(
      "確定額の集計に失敗"
    );
    expect(deps.orderRepo.saveNewOrderWithLimitCheck).not.toHaveBeenCalled();
    expect(deps.orderRepo.save).not.toHaveBeenCalled();
    expect(deps.paymentGateway.createCheckoutSession).not.toHaveBeenCalled();
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
      errorReporter: makeErrorReporter(),
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
      errorReporter: makeErrorReporter(),
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
    ).rejects.toThrow("商品が見つかりません");
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
      errorReporter: makeErrorReporter(),
    };

    const error = await placeOrder(baseInput, deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProductNotAccessibleError);
    expect(error).toMatchObject({
      productId: "prod-1",
      userRank: "starter",
      requiredRank: "premium",
    });
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
      errorReporter: makeErrorReporter(),
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
      errorReporter: makeErrorReporter(),
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
      errorReporter: makeErrorReporter(),
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
      errorReporter: makeErrorReporter(),
    };

    await expect(placeOrder(baseInput, deps)).rejects.toThrow("Stripeエラー");

    const savedOrderId = vi.mocked(orderRepo.saveNewOrderWithLimitCheck).mock
      .calls[0][0].id;
    expect(orderRepo.delete).toHaveBeenCalledWith(savedOrderId);
  });

  it("Checkout Session作成の失敗を補償削除できなかった場合、ErrorReporterへ通知する", async () => {
    const orderRepo = makeOrderRepo();
    vi.mocked(orderRepo.delete).mockRejectedValue(new Error("削除も失敗"));
    const paymentGateway = makePaymentGateway();
    vi.mocked(paymentGateway.createCheckoutSession).mockRejectedValue(
      new Error("Stripeエラー")
    );

    const errorReporter = makeErrorReporter();

    const deps = {
      userRepo: makeUserRepo(),
      orderRepo,
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct]),
      paymentGateway,
      notificationService: makeNotificationService(),
      errorReporter,
    };

    await expect(placeOrder(baseInput, deps)).rejects.toThrow("Stripeエラー");

    expect(errorReporter.captureException).toHaveBeenCalledWith(
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
      errorReporter: makeErrorReporter(),
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

  describe("注文の前提が揃っていない場合は、何も保存せずエラーにする", () => {
    const makeDeps = () => ({
      userRepo: makeUserRepo(),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
      errorReporter: makeErrorReporter(),
    });

    it("会員が見つからない", async () => {
      const deps = makeDeps();
      vi.mocked(deps.userRepo.findByClerkUserId).mockResolvedValue(null);

      await expect(placeOrder(baseInput, deps)).rejects.toThrow(
        "ユーザーが見つかりません"
      );
      expect(deps.orderRepo.saveNewOrderWithLimitCheck).not.toHaveBeenCalled();
    });

    it("カートが空", async () => {
      const deps = makeDeps();

      await expect(
        placeOrder({ ...baseInput, cartItems: [] }, deps)
      ).rejects.toThrow("カートに商品がありません");
      expect(deps.orderRepo.saveNewOrderWithLimitCheck).not.toHaveBeenCalled();
    });

    it.each(["shipping-addr", "billing-addr"])(
      "住所（%s）が見つからない",
      async (missingId) => {
        const deps = makeDeps();
        vi.mocked(deps.addressRepo.findByIdAndUserId).mockImplementation((id) =>
          Promise.resolve(
            id === missingId
              ? null
              : makeAddress(id.startsWith("billing") ? "billing" : "shipping")
          )
        );

        await expect(placeOrder(baseInput, deps)).rejects.toThrow(
          "住所が見つかりません"
        );
        expect(
          deps.orderRepo.saveNewOrderWithLimitCheck
        ).not.toHaveBeenCalled();
      }
    );
  });

  it("配送先・請求先の住所は、注文する会員の住所に絞って取る（他の会員の住所IDを指定させない。#619）", async () => {
    const user = makeUser();
    const addressRepo = makeAddressRepo();

    await placeOrder(baseInput, {
      userRepo: makeUserRepo(user),
      orderRepo: makeOrderRepo(),
      addressRepo,
      productRepo: makeProductRepo([fixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
      errorReporter: makeErrorReporter(),
    });

    expect(addressRepo.findByIdAndUserId).toHaveBeenCalledWith(
      "shipping-addr",
      user.id
    );
    expect(addressRepo.findByIdAndUserId).toHaveBeenCalledWith(
      "billing-addr",
      user.id
    );
    expect(addressRepo.findById).not.toHaveBeenCalled();
  });

  it("明細の商品名・単価はサーバー側ProductSnapshotの値を使い、カートの商品名は使わない（カート改竄対策）", async () => {
    const deps = {
      userRepo: makeUserRepo(),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
      errorReporter: makeErrorReporter(),
    };

    await placeOrder(
      {
        ...baseInput,
        cartItems: [
          { sanityProductId: "prod-1", quantity: 2, productName: "偽装商品名" },
        ],
      },
      deps
    );

    const saved = vi.mocked(deps.orderRepo.saveNewOrderWithLimitCheck).mock
      .calls[0][0];
    expect(saved.items[0]).toMatchObject({
      productNameSnapshot: "固定商品",
      quantity: 2,
    });
    expect(saved.items[0]?.unitPriceSnapshot.amount).toBe(100_000);
  });
  it("月次上限チェック込みの保存には、注文の固定額の合計を渡す", async () => {
    const deps = {
      userRepo: makeUserRepo(),
      orderRepo: makeOrderRepo(),
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct, afterOrderFixedProduct]),
      paymentGateway: makePaymentGateway(),
      notificationService: makeNotificationService(),
      errorReporter: makeErrorReporter(),
    };

    await placeOrder(
      {
        ...baseInput,
        cartItems: [
          { sanityProductId: "prod-1", quantity: 2, productName: "固定商品" },
          {
            sanityProductId: "prod-3",
            quantity: 1,
            productName: "後払い固定商品",
          },
        ],
      },
      deps
    );

    const [saved, , , fixedTotal] = vi.mocked(
      deps.orderRepo.saveNewOrderWithLimitCheck
    ).mock.calls[0];
    // 固定商品100,000×2 + 後払い固定商品50,000
    expect(fixedTotal.amount).toBe(250_000);
    expect(saved.getFixedTotal().amount).toBe(250_000);
  });
});
