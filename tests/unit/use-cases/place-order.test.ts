import { describe, it, expect, vi } from "vitest";
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
    expect(deps.orderRepo.save).toHaveBeenCalledTimes(2);

    const savedOrder = vi.mocked(deps.orderRepo.save).mock.calls[0][0];
    expect(savedOrder.splitGroupId).toBeNull();
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
    expect(deps.orderRepo.save).toHaveBeenCalledTimes(1);
    expect(deps.notificationService.sendOrderConfirming).toHaveBeenCalled();
    expect(
      deps.notificationService.sendOrderOperatorNotification
    ).toHaveBeenCalled();
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
    expect(deps.orderRepo.save).not.toHaveBeenCalled();
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
    expect(deps.orderRepo.save).not.toHaveBeenCalled();
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
    expect(deps.orderRepo.save).not.toHaveBeenCalled();
  });

  it("支払いタイミングが混在する場合は2件のOrderを同一splitGroupIdで作成し、checkoutのURLを返す", async () => {
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
            quantity: 1,
            productName: "後払い固定商品",
          },
        ],
      },
      deps
    );

    expect(result.redirectUrl).toBe("https://stripe.com/pay/sess_1");
    expect(deps.paymentGateway.createCheckoutSession).toHaveBeenCalled();

    const savedOrders = vi
      .mocked(orderRepo.save)
      .mock.calls.map(([order]) => order);
    const uniqueOrderIds = new Set(savedOrders.map((o) => o.id));
    expect(uniqueOrderIds.size).toBe(2);

    const splitGroupIds = new Set(savedOrders.map((o) => o.splitGroupId));
    expect(splitGroupIds.size).toBe(1);
    expect([...splitGroupIds][0]).not.toBeNull();

    expect(deps.notificationService.sendOrderConfirming).toHaveBeenCalled();
    expect(
      deps.notificationService.sendOrderOperatorNotification
    ).toHaveBeenCalled();
  });

  it("Order Bの保存が失敗した場合、保存済みのOrder Aを削除しエラーを伝播する（原子性）", async () => {
    const orderRepo = makeOrderRepo();
    let saveCallCount = 0;
    const savedOrderIds: string[] = [];
    vi.mocked(orderRepo.save).mockImplementation(async (order) => {
      saveCallCount++;
      if (saveCallCount === 2) throw new Error("DB接続エラー");
      savedOrderIds.push(order.id);
    });

    const deps = {
      userRepo: makeUserRepo(),
      orderRepo,
      addressRepo: makeAddressRepo(),
      productRepo: makeProductRepo([fixedProduct, afterOrderFixedProduct]),
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
    ).rejects.toThrow("DB接続エラー");

    expect(savedOrderIds).toHaveLength(1);
    expect(orderRepo.delete).toHaveBeenCalledTimes(1);
    expect(orderRepo.delete).toHaveBeenCalledWith(savedOrderIds[0]);
    expect(deps.paymentGateway.createCheckoutSession).not.toHaveBeenCalled();
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
