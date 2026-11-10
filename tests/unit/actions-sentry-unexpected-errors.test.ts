import { describe, it, expect, vi, beforeEach } from "vitest";

// catch で握りつぶしていた Server Action が、想定外の例外を Sentry に送ること（#310）。
// 業務ルールの違反（DomainError）は入力に起因する想定内の失敗のため送らない

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("@/composition/address", () => ({
  createAddress: vi.fn(),
  updateAddress: vi.fn(),
  deleteAddress: vi.fn(),
  setDefaultAddress: vi.fn(),
}));

vi.mock("@/composition/member", () => ({
  withdraw: vi.fn(),
}));

vi.mock("@/composition/order", () => ({
  cancelOrder: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { requireAuth } from "@/lib/auth/current-user";
import {
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from "@/composition/address";
import { withdraw } from "@/composition/member";
import { cancelOrder as cancelOrderUseCase } from "@/composition/order";
import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";
import { ActiveOrdersExistError } from "@/domain/errors/active-orders-exist-error";
import { OrderNotCancellableError } from "@/domain/errors/order-not-cancellable-error";
import {
  createAddressAction,
  updateAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  deleteAccount,
} from "@/app/(member)/settings/actions";
import { cancelOrder } from "@/app/admin/orders/[id]/actions";

const addressCases = [
  {
    useCase: "setDefaultAddress",
    mock: setDefaultAddress,
    run: () => setDefaultAddressAction("addr_1", "shipping"),
    error: "デフォルト住所の更新に失敗しました",
  },
  {
    useCase: "createAddress",
    mock: createAddress,
    run: () => createAddressAction(new FormData()),
    error: "住所の登録に失敗しました",
  },
  {
    useCase: "updateAddress",
    mock: updateAddress,
    run: () => updateAddressAction("addr_1", new FormData()),
    error: "住所の更新に失敗しました",
  },
  {
    useCase: "deleteAddress",
    mock: deleteAddress,
    run: () => deleteAddressAction("addr_1"),
    error: "住所の削除に失敗しました",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({
    userId: "clerk_1",
    sessionClaims: { metadata: { role: "admin" } },
  } as never);
});

describe.each(addressCases)("$useCase の Server Action", (c) => {
  it("想定外の例外は Sentry に送り、エラーを返す", async () => {
    const err = new Error("DB接続エラー");
    vi.mocked(c.mock).mockRejectedValue(err);

    expect(await c.run()).toEqual({ error: c.error });
    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      tags: { useCase: c.useCase },
    });
  });

  it("DomainError は Sentry に送らない", async () => {
    vi.mocked(c.mock).mockRejectedValue(new InvalidPhoneNumberError("123"));

    expect(await c.run()).toEqual({ error: c.error });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe("deleteAccount", () => {
  it("想定外の例外は Sentry に送り、エラーを返す", async () => {
    const err = new Error("Stripe API エラー");
    vi.mocked(withdraw).mockRejectedValue(err);

    expect(await deleteAccount()).toEqual({ error: "退会処理に失敗しました" });
    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      tags: { useCase: "withdraw" },
    });
  });

  it("進行中の注文がある（ActiveOrdersExistError）なら Sentry に送らない", async () => {
    vi.mocked(withdraw).mockRejectedValue(new ActiveOrdersExistError());

    expect(await deleteAccount()).toEqual({
      error: "進行中の注文があるため退会できません",
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe("cancelOrder（管理画面）", () => {
  it("想定外の例外は Sentry に送り、エラーを返す", async () => {
    const err = new Error("DB接続エラー");
    vi.mocked(cancelOrderUseCase).mockRejectedValue(err);

    expect(await cancelOrder("order_1", "")).toEqual({
      error: "DB接続エラー",
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      tags: { useCase: "cancelOrder" },
      extra: { orderId: "order_1" },
    });
  });

  it("キャンセルできない状態（DomainError）なら Sentry に送らない", async () => {
    const err = new OrderNotCancellableError("order_1");
    vi.mocked(cancelOrderUseCase).mockRejectedValue(err);

    expect(await cancelOrder("order_1", "")).toEqual({ error: err.message });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
