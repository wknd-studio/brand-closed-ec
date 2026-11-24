import { describe, it, expect, vi } from "vitest";
import { requestReturn } from "@/use-cases/request-return";
import { reconstituteReturnRequest } from "@/domain/entities/return-request";
import { reconstituteOrderItem } from "@/domain/entities/order-item";
import { InvalidReturnRequestError } from "@/domain/errors/invalid-return-request-error";
import { ReturnOrderNotFoundError } from "@/domain/errors/return-order-not-found-error";
import { Money } from "@/domain/value-objects/money";
import type { ReturnRepository } from "@/repositories/return-repository";
import type { NotificationService } from "@/repositories/notification-service";
import {
  makeOrder,
  makeOrderRepo,
  makeSettlement,
  makeUser,
  makeUserRepo,
} from "./helpers";

const CLERK_USER_ID = "clerk-1";
const USER_ID = "00000000-0000-0000-0000-000000000001";
const ORDER_ID = "00000000-0000-0000-0000-000000000001";
const ITEM_ID = "00000000-0000-0000-0000-000000000031";

// 支払い済みの Checkout の明細（数量3）1件を持つ会員の注文
function makePaidOrder(userId = USER_ID) {
  return makeOrder({
    userId,
    items: [
      reconstituteOrderItem({
        id: ITEM_ID,
        sanityProductId: "prod-1",
        productNameSnapshot: "テスト商品",
        unitPriceSnapshot: Money.of(10_000),
        quantity: 3,
        isNegotiable: false,
        negotiatedUnitPrice: null,
        paymentTiming: "at_order",
        settlementId: "00000000-0000-0000-0000-0000000000a1",
      }),
    ],
    settlements: [makeSettlement({ status: "paid" })],
  });
}

function makeReturnRepo(
  existing: ReturnType<typeof reconstituteReturnRequest>[] = []
): ReturnRepository {
  return {
    findByOrderId: vi.fn().mockResolvedValue(existing),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function makeNotificationService(): NotificationService {
  return {
    sendOrderConfirming: vi.fn(),
    sendOrderOperatorNotification: vi.fn(),
    sendLimitExceeded: vi.fn(),
    sendShippingNotification: vi.fn(),
    sendDeliveryNotification: vi.fn(),
    sendCheckoutPaid: vi.fn(),
    sendInvoicePaid: vi.fn(),
  };
}

const baseInput = {
  clerkUserId: CLERK_USER_ID,
  orderId: ORDER_ID,
  items: [{ orderItemId: ITEM_ID, quantity: 2 }],
  reasonKind: "defective",
  reasonDetail: "割れていた",
};

describe("requestReturn", () => {
  it("本人の注文の明細への申請を、申請中（requested）として保存する", async () => {
    const returnRepo = makeReturnRepo();
    const orderRepo = makeOrderRepo(makePaidOrder());

    const result = await requestReturn(baseInput, {
      userRepo: makeUserRepo(makeUser({ id: USER_ID })),
      orderRepo,
      returnRepo,
    });

    expect(orderRepo.findById).toHaveBeenCalledWith(ORDER_ID);
    expect(returnRepo.findByOrderId).toHaveBeenCalledWith(ORDER_ID);
    const saved = vi.mocked(returnRepo.save).mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      id: result.returnId,
      orderId: ORDER_ID,
      status: "requested",
      requestedByUserId: USER_ID,
      reason: "不良品: 割れていた",
      items: [{ orderItemId: ITEM_ID, quantity: 2 }],
    });
  });

  it("運営者向けの通知・顧客向けのメールを送らない（保存だけを行う）", async () => {
    const notificationService = makeNotificationService();
    const returnRepo = makeReturnRepo();
    // 通知のポートを渡しても使われないことを確かめる（use-case は通知のポートを受け取らない）
    const deps = {
      userRepo: makeUserRepo(makeUser({ id: USER_ID })),
      orderRepo: makeOrderRepo(makePaidOrder()),
      returnRepo,
      notificationService,
    };

    await requestReturn(baseInput, deps);

    expect(returnRepo.save).toHaveBeenCalledTimes(1);
    for (const send of Object.values(notificationService)) {
      expect(send).not.toHaveBeenCalled();
    }
  });

  it("他の会員の注文への申請は拒否し、保存しない", async () => {
    const returnRepo = makeReturnRepo();

    await expect(
      requestReturn(baseInput, {
        userRepo: makeUserRepo(makeUser({ id: USER_ID })),
        orderRepo: makeOrderRepo(
          makePaidOrder("00000000-0000-0000-0000-000000000099")
        ),
        returnRepo,
      })
    ).rejects.toThrow(ReturnOrderNotFoundError);
    expect(returnRepo.save).not.toHaveBeenCalled();
  });

  it("見つからない注文（RLS で他の会員の注文が見えない場合を含む）への申請は拒否する", async () => {
    const returnRepo = makeReturnRepo();

    await expect(
      requestReturn(baseInput, {
        userRepo: makeUserRepo(makeUser({ id: USER_ID })),
        orderRepo: makeOrderRepo(),
        returnRepo,
      })
    ).rejects.toThrow(ReturnOrderNotFoundError);
    expect(returnRepo.save).not.toHaveBeenCalled();
  });

  it("別の注文の明細を指す申請は拒否し、保存しない", async () => {
    const returnRepo = makeReturnRepo();

    await expect(
      requestReturn(
        {
          ...baseInput,
          items: [
            {
              orderItemId: "00000000-0000-0000-0000-000000000999",
              quantity: 1,
            },
          ],
        },
        {
          userRepo: makeUserRepo(makeUser({ id: USER_ID })),
          orderRepo: makeOrderRepo(makePaidOrder()),
          returnRepo,
        }
      )
    ).rejects.toThrow(InvalidReturnRequestError);
    expect(returnRepo.save).not.toHaveBeenCalled();
  });

  it("既存の有効な申請の数量と合わせて注文数量を超える申請は拒否する", async () => {
    const returnRepo = makeReturnRepo([
      reconstituteReturnRequest({
        id: "return-1",
        orderId: ORDER_ID,
        status: "requested",
        requestedByUserId: USER_ID,
        reason: "不良品",
        items: [{ orderItemId: ITEM_ID, quantity: 2 }],
      }),
    ]);

    await expect(
      requestReturn(baseInput, {
        userRepo: makeUserRepo(makeUser({ id: USER_ID })),
        orderRepo: makeOrderRepo(makePaidOrder()),
        returnRepo,
      })
    ).rejects.toThrow(InvalidReturnRequestError);
    expect(returnRepo.save).not.toHaveBeenCalled();
  });

  it("理由が空の申請は、注文を読む前に拒否する", async () => {
    const orderRepo = makeOrderRepo(makePaidOrder());

    await expect(
      requestReturn(
        { ...baseInput, reasonKind: "other", reasonDetail: " " },
        {
          userRepo: makeUserRepo(makeUser({ id: USER_ID })),
          orderRepo,
          returnRepo: makeReturnRepo(),
        }
      )
    ).rejects.toThrow(InvalidReturnRequestError);
    expect(orderRepo.findById).not.toHaveBeenCalled();
  });

  it("会員が見つからなければ拒否する", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const returnRepo = makeReturnRepo();

    await expect(
      requestReturn(baseInput, {
        userRepo,
        orderRepo: makeOrderRepo(makePaidOrder()),
        returnRepo,
      })
    ).rejects.toThrow("ユーザーが見つかりません");
    expect(returnRepo.save).not.toHaveBeenCalled();
  });
});
