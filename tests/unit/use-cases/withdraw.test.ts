import { describe, it, expect, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { withdraw } from "@/use-cases/withdraw";
import { ActiveOrdersExistError } from "@/domain/errors/active-orders-exist-error";
import {
  makeUserRepo,
  makeOrderRepo,
  makeSubscriptionGateway,
  makeAccountGateway,
  makeUser,
  makeOrder,
} from "./helpers";

describe("withdraw", () => {
  it("userが見つからない場合はエラーをthrowする", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);

    await expect(
      withdraw(
        { clerkUserId: "clerk-1" },
        {
          userRepo,
          orderRepo: makeOrderRepo(),
          subscriptionGateway: makeSubscriptionGateway(),
          accountGateway: makeAccountGateway(),
        }
      )
    ).rejects.toThrow("ユーザーが見つかりません");
  });

  it("進行中の注文がある場合は ActiveOrdersExistError をthrowする", async () => {
    const userRepo = makeUserRepo();
    const orderRepo = makeOrderRepo();
    vi.mocked(orderRepo.findActiveByUserId).mockResolvedValue([makeOrder()]);

    await expect(
      withdraw(
        { clerkUserId: "clerk-1" },
        {
          userRepo,
          orderRepo,
          subscriptionGateway: makeSubscriptionGateway(),
          accountGateway: makeAccountGateway(),
        }
      )
    ).rejects.toThrow(ActiveOrdersExistError);
  });

  it("有料会員: Supabase論理削除 → Stripe解約 → Clerk削除を順に実行する", async () => {
    const user = makeUser({ rank: "basic" }).with({
      stripeSubscriptionId: "sub_123",
    });
    const userRepo = makeUserRepo(user);
    const orderRepo = makeOrderRepo();
    const subscriptionGateway = makeSubscriptionGateway();
    const accountGateway = makeAccountGateway();

    await withdraw(
      { clerkUserId: "clerk-1" },
      { userRepo, orderRepo, subscriptionGateway, accountGateway }
    );

    const savedUser = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(savedUser.deletedAt).not.toBeNull();
    expect(subscriptionGateway.cancelSubscription).toHaveBeenCalledWith(
      "sub_123"
    );
    expect(accountGateway.deleteUser).toHaveBeenCalledWith("clerk-1");
  });

  it("stripeSubscriptionIdがない会員: Stripe解約をスキップする", async () => {
    const user = makeUser({ rank: "starter" }).with({
      stripeSubscriptionId: null,
    });
    const userRepo = makeUserRepo(user);
    const orderRepo = makeOrderRepo();
    const subscriptionGateway = makeSubscriptionGateway();
    const accountGateway = makeAccountGateway();

    await withdraw(
      { clerkUserId: "clerk-1" },
      { userRepo, orderRepo, subscriptionGateway, accountGateway }
    );

    expect(subscriptionGateway.cancelSubscription).not.toHaveBeenCalled();
    expect(accountGateway.deleteUser).toHaveBeenCalled();
  });

  it("Stripe解約失敗時はdeleted_atをロールバックしてエラーをthrowする", async () => {
    const user = makeUser({ rank: "basic" }).with({
      stripeSubscriptionId: "sub_123",
    });
    const userRepo = makeUserRepo(user);
    const orderRepo = makeOrderRepo();
    const subscriptionGateway = makeSubscriptionGateway();
    vi.mocked(subscriptionGateway.cancelSubscription).mockRejectedValue(
      new Error("Stripe error")
    );
    const accountGateway = makeAccountGateway();

    await expect(
      withdraw(
        { clerkUserId: "clerk-1" },
        { userRepo, orderRepo, subscriptionGateway, accountGateway }
      )
    ).rejects.toThrow();

    const rollbackCall = vi.mocked(userRepo.save).mock.calls[1];
    expect(rollbackCall[0].deletedAt).toBeNull();
    expect(accountGateway.deleteUser).not.toHaveBeenCalled();
  });

  it("Clerk削除失敗時もvoidで正常終了し、console.errorでログを残す", async () => {
    const user = makeUser({ rank: "basic" }).with({
      stripeSubscriptionId: "sub_123",
    });
    const userRepo = makeUserRepo(user);
    const orderRepo = makeOrderRepo();
    const subscriptionGateway = makeSubscriptionGateway();
    const accountGateway = makeAccountGateway();
    vi.mocked(accountGateway.deleteUser).mockRejectedValue(
      new Error("Clerk error")
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      withdraw(
        { clerkUserId: "clerk-1" },
        { userRepo, orderRepo, subscriptionGateway, accountGateway }
      )
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it("Clerk削除失敗時にSentry.captureExceptionを呼ぶ", async () => {
    const user = makeUser({ rank: "basic" }).with({
      stripeSubscriptionId: "sub_123",
    });
    const userRepo = makeUserRepo(user);
    const orderRepo = makeOrderRepo();
    const subscriptionGateway = makeSubscriptionGateway();
    const accountGateway = makeAccountGateway();
    const error = new Error("Clerk error");
    vi.mocked(accountGateway.deleteUser).mockRejectedValue(error);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(Sentry.captureException).mockClear();

    await withdraw(
      { clerkUserId: "clerk-1" },
      { userRepo, orderRepo, subscriptionGateway, accountGateway }
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ useCase: "withdraw" }),
      })
    );
  });
});
