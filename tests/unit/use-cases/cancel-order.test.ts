import { describe, it, expect, vi } from "vitest";
import { cancelOrder } from "@/use-cases/cancel-order";
import { OrderNotCancellableError } from "@/domain/errors/order-not-cancellable-error";
import { OrderConcurrentlyModifiedError } from "@/domain/errors/order-concurrently-modified-error";
import { AdminUser } from "@/domain/entities/admin-user";
import {
  makeOrderRepo,
  makeOrder,
  makeSettlement,
  makeAdminUserRepo,
} from "./helpers";

const ADMIN_CLERK_USER_ID = "clerk_admin_1";
const adminUser = AdminUser.of({
  id: "admin-user-1",
  clerkUserId: ADMIN_CLERK_USER_ID,
  name: "運営 太郎",
  email: "admin@example.com",
  createdAt: new Date(2026, 0, 1),
});

describe("cancelOrder", () => {
  it("キャンセル可能な注文と未払いの決済単位をcancelledに更新する", async () => {
    const order = makeOrder();
    const orderRepo = makeOrderRepo(order);

    await cancelOrder(
      { orderId: order.id, adminClerkUserId: ADMIN_CLERK_USER_ID, reason: "" },
      { orderRepo, adminUserRepo: makeAdminUserRepo(adminUser) }
    );

    const saved = vi.mocked(orderRepo.save).mock.calls[0]?.[0];
    expect(saved?.status.value).toBe("cancelled");
    expect(saved?.settlements[0]?.status).toBe("cancelled");
    expect(saved?.settlements[0]?.cancelledAt).toBeInstanceOf(Date);
  });

  it("操作した運営者の admin_users.id とキャンセル理由を、状態を変えた主体として保存に渡す", async () => {
    const order = makeOrder();
    const orderRepo = makeOrderRepo(order);
    const adminUserRepo = makeAdminUserRepo(adminUser);

    await cancelOrder(
      {
        orderId: order.id,
        adminClerkUserId: ADMIN_CLERK_USER_ID,
        reason: "  顧客から電話で依頼  ",
      },
      { orderRepo, adminUserRepo }
    );

    expect(adminUserRepo.findByClerkUserId).toHaveBeenCalledWith(
      ADMIN_CLERK_USER_ID
    );
    expect(vi.mocked(orderRepo.save).mock.calls[0]?.[1]).toEqual({
      type: "admin",
      adminUserId: "admin-user-1",
      reason: "顧客から電話で依頼",
    });
  });

  it("キャンセル理由が空白だけなら、理由なし（null）として保存に渡す", async () => {
    const order = makeOrder();
    const orderRepo = makeOrderRepo(order);

    await cancelOrder(
      {
        orderId: order.id,
        adminClerkUserId: ADMIN_CLERK_USER_ID,
        reason: " \n ",
      },
      { orderRepo, adminUserRepo: makeAdminUserRepo(adminUser) }
    );

    expect(vi.mocked(orderRepo.save).mock.calls[0]?.[1]).toEqual({
      type: "admin",
      adminUserId: "admin-user-1",
      reason: null,
    });
  });

  it("運営者が admin_users に無ければエラーを投げ、保存しない", async () => {
    const order = makeOrder();
    const orderRepo = makeOrderRepo(order);

    await expect(
      cancelOrder(
        { orderId: order.id, adminClerkUserId: "clerk_unknown", reason: "" },
        { orderRepo, adminUserRepo: makeAdminUserRepo(null) }
      )
    ).rejects.toThrow("運営者が見つかりません");
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it("支払い済みの注文はエラーを投げる", async () => {
    // 状態は決済単位からロールアップされるため、全明細が支払い済みの決済単位に属する注文にする
    const order = makeOrder({
      settlements: [makeSettlement({ status: "paid", paidAt: new Date() })],
    });
    expect(order.status.value).toBe("paid");
    const orderRepo = makeOrderRepo(order);

    const result = cancelOrder(
      { orderId: order.id, adminClerkUserId: ADMIN_CLERK_USER_ID, reason: "" },
      { orderRepo, adminUserRepo: makeAdminUserRepo(adminUser) }
    );
    await expect(result).rejects.toThrow(OrderNotCancellableError);
    await expect(result).rejects.toThrow("キャンセルできません");
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it("支払い済みの決済単位を含む注文はエラーを投げる", async () => {
    const order = makeOrder({
      settlements: [makeSettlement({ status: "paid", paidAt: new Date() })],
    });
    const orderRepo = makeOrderRepo(order);

    await expect(
      cancelOrder(
        {
          orderId: order.id,
          adminClerkUserId: ADMIN_CLERK_USER_ID,
          reason: "",
        },
        { orderRepo, adminUserRepo: makeAdminUserRepo(adminUser) }
      )
    ).rejects.toThrow("キャンセルできません");
  });

  it("注文が存在しなければエラーを投げる", async () => {
    await expect(
      cancelOrder(
        {
          orderId: "unknown",
          adminClerkUserId: ADMIN_CLERK_USER_ID,
          reason: "",
        },
        {
          orderRepo: makeOrderRepo(),
          adminUserRepo: makeAdminUserRepo(adminUser),
        }
      )
    ).rejects.toThrow("注文が見つかりません");
  });

  // 楽観ロック（issue #721）: 運営者が画面で見た注文と違う注文を黙ってキャンセルしない。
  // 読み直してやり直すと、その間に作られた請求（Stripe Invoice）までキャンセルしうるため、
  // 運営者に読み直してもらう
  it("保存が競合したら、読み直してやり直さずに OrderConcurrentlyModifiedError を投げる", async () => {
    const order = makeOrder();
    const orderRepo = makeOrderRepo(order);
    vi.mocked(orderRepo.save).mockRejectedValue(
      new OrderConcurrentlyModifiedError(order.id)
    );

    await expect(
      cancelOrder(
        {
          orderId: order.id,
          adminClerkUserId: ADMIN_CLERK_USER_ID,
          reason: "",
        },
        { orderRepo, adminUserRepo: makeAdminUserRepo(adminUser) }
      )
    ).rejects.toBeInstanceOf(OrderConcurrentlyModifiedError);
    expect(orderRepo.findById).toHaveBeenCalledTimes(1);
    expect(orderRepo.save).toHaveBeenCalledTimes(1);
  });
});
