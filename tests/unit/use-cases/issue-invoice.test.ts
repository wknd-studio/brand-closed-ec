import { describe, it, expect, vi } from "vitest";
import { issueInvoice } from "@/use-cases/issue-invoice";
import {
  makeUserRepo,
  makeOrderRepo,
  makePaymentGateway,
  makeNotificationService,
  makeOrder,
  makeOrderItem,
} from "./helpers";

const negotiableItem = makeOrderItem({ isNegotiable: true });
const invoiceOrder = makeOrder({
  status: "confirming",
  paymentFlow: "invoice",
  items: [negotiableItem],
});

describe("issueInvoice", () => {
  it("交渉価格を確定してStripe Invoiceを発行し invoice_sent にする", async () => {
    const orderRepo = makeOrderRepo(invoiceOrder);
    const paymentGateway = makePaymentGateway();

    const deps = {
      orderRepo,
      userRepo: makeUserRepo(),
      paymentGateway,
      notificationService: makeNotificationService(),
    };

    const result = await issueInvoice(
      {
        orderId: invoiceOrder.id,
        negotiatedPrices: { [negotiableItem.id]: 200_000 },
      },
      deps
    );

    expect(result).toEqual({ success: true });
    expect(paymentGateway.createInvoiceForOrder).toHaveBeenCalled();
    const savedOrder = vi.mocked(orderRepo.save).mock.calls.at(-1)?.[0];
    expect(savedOrder?.status.value).toBe("invoice_sent");
  });

  it("月次上限超過時はステータスをlimit_exceededに更新してlimitExceededを返す", async () => {
    const orderRepo = makeOrderRepo(invoiceOrder);
    vi.mocked(orderRepo.sumConfirmedAmountByUserId).mockResolvedValue(
      4_900_000
    );
    const notificationService = makeNotificationService();

    const deps = {
      orderRepo,
      userRepo: makeUserRepo(),
      paymentGateway: makePaymentGateway(),
      notificationService,
    };

    // 4,900,000 + 200,000 = 5,100,000 > 5,000,000
    const result = await issueInvoice(
      {
        orderId: invoiceOrder.id,
        negotiatedPrices: { [negotiableItem.id]: 200_000 },
      },
      deps
    );

    expect(result).toEqual({ limitExceeded: true });
    const savedOrder = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(savedOrder?.status.value).toBe("limit_exceeded");
    expect(notificationService.sendLimitExceeded).toHaveBeenCalled();
  });
});
