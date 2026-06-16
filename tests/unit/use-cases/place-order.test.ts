import { describe, it, expect, vi } from "vitest";
import { placeOrder } from "@/use-cases/place-order";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import { Money } from "@/domain/value-objects/money";
import {
  makeUserRepo,
  makeOrderRepo,
  makeAddressRepo,
  makeProductRepo,
  makePaymentGateway,
  makeNotificationService,
  fixedProduct,
  negotiableProduct,
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
});
