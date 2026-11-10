import { describe, it, expect, vi } from "vitest";

import { withdraw } from "@/use-cases/withdraw";
import { ActiveOrdersExistError } from "@/domain/errors/active-orders-exist-error";
import {
  makeUserRepo,
  makeOrderRepo,
  makeSubscriptionRepo,
  makeSubscriptionSnapshot,
  makeSubscriptionGateway,
  makeAccountGateway,
  makeUser,
  makeOrder,
  makeSettlement,
  makeErrorReporter,
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
          subscriptionRepo: makeSubscriptionRepo(),
          subscriptionGateway: makeSubscriptionGateway(),
          accountGateway: makeAccountGateway(),
          errorReporter: makeErrorReporter(),
        }
      )
    ).rejects.toThrow("ユーザーが見つかりません");
  });

  it("会員の注文に未解決の決済単位を持つものがある場合は ActiveOrdersExistError をthrowし、保存しない", async () => {
    const userRepo = makeUserRepo();
    const orderRepo = makeOrderRepo();
    vi.mocked(orderRepo.findByUserId).mockResolvedValue([
      makeOrder({ settlements: [makeSettlement({ status: "invoice_sent" })] }),
    ]);

    await expect(
      withdraw(
        { clerkUserId: "clerk-1" },
        {
          userRepo,
          orderRepo,
          subscriptionRepo: makeSubscriptionRepo(),
          subscriptionGateway: makeSubscriptionGateway(),
          accountGateway: makeAccountGateway(),
          errorReporter: makeErrorReporter(),
        }
      )
    ).rejects.toThrow(ActiveOrdersExistError);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it("会員の注文が退会を止めないもの（決済前・キャンセル済み）だけなら退会する", async () => {
    const userRepo = makeUserRepo();
    const orderRepo = makeOrderRepo();
    vi.mocked(orderRepo.findByUserId).mockResolvedValue([
      makeOrder({
        settlements: [makeSettlement({ status: "pending_payment" })],
      }),
      makeOrder({
        status: "cancelled",
        settlements: [makeSettlement({ status: "limit_exceeded" })],
      }),
    ]);

    await withdraw(
      { clerkUserId: "clerk-1" },
      {
        userRepo,
        orderRepo,
        subscriptionRepo: makeSubscriptionRepo(null),
        subscriptionGateway: makeSubscriptionGateway(),
        accountGateway: makeAccountGateway(),
        errorReporter: makeErrorReporter(),
      }
    );

    expect(orderRepo.findByUserId).toHaveBeenCalledWith(
      vi.mocked(userRepo.save).mock.calls[0][0].id
    );
    expect(vi.mocked(userRepo.save).mock.calls[0][0].deletedAt).not.toBeNull();
  });

  it("有料会員: Supabase論理削除 → Stripe解約 → Clerk ban を順に実行する", async () => {
    const user = makeUser({ rank: "basic" });
    const userRepo = makeUserRepo(user);
    const orderRepo = makeOrderRepo();
    const subscriptionRepo = makeSubscriptionRepo(
      makeSubscriptionSnapshot({ stripeSubscriptionId: "sub_123" })
    );
    const subscriptionGateway = makeSubscriptionGateway();
    const accountGateway = makeAccountGateway();

    await withdraw(
      { clerkUserId: "clerk-1" },
      {
        userRepo,
        orderRepo,
        subscriptionRepo,
        subscriptionGateway,
        accountGateway,
        errorReporter: makeErrorReporter(),
      }
    );

    const savedUser = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(savedUser.deletedAt).not.toBeNull();
    expect(subscriptionGateway.cancelSubscription).toHaveBeenCalledWith(
      "sub_123"
    );
    expect(accountGateway.banUser).toHaveBeenCalledWith("clerk-1");
  });

  it("アクティブなsubscriptionがない会員: Stripe解約をスキップする", async () => {
    const user = makeUser({ rank: "starter" });
    const userRepo = makeUserRepo(user);
    const orderRepo = makeOrderRepo();
    const subscriptionRepo = makeSubscriptionRepo(null);
    const subscriptionGateway = makeSubscriptionGateway();
    const accountGateway = makeAccountGateway();

    await withdraw(
      { clerkUserId: "clerk-1" },
      {
        userRepo,
        orderRepo,
        subscriptionRepo,
        subscriptionGateway,
        accountGateway,
        errorReporter: makeErrorReporter(),
      }
    );

    expect(subscriptionGateway.cancelSubscription).not.toHaveBeenCalled();
    expect(accountGateway.banUser).toHaveBeenCalled();
  });

  it("Stripe解約失敗時はdeleted_atをロールバックしてエラーをthrowする", async () => {
    const user = makeUser({ rank: "basic" });
    const userRepo = makeUserRepo(user);
    const orderRepo = makeOrderRepo();
    const subscriptionRepo = makeSubscriptionRepo(
      makeSubscriptionSnapshot({ stripeSubscriptionId: "sub_123" })
    );
    const subscriptionGateway = makeSubscriptionGateway();
    vi.mocked(subscriptionGateway.cancelSubscription).mockRejectedValue(
      new Error("Stripe error")
    );
    const accountGateway = makeAccountGateway();

    await expect(
      withdraw(
        { clerkUserId: "clerk-1" },
        {
          userRepo,
          orderRepo,
          subscriptionRepo,
          subscriptionGateway,
          accountGateway,
          errorReporter: makeErrorReporter(),
        }
      )
    ).rejects.toThrow();

    const rollbackCall = vi.mocked(userRepo.save).mock.calls[1];
    expect(rollbackCall[0].deletedAt).toBeNull();
    expect(accountGateway.banUser).not.toHaveBeenCalled();
  });

  it("Clerk ban 失敗時もvoidで正常終了し、console.errorでログを残す", async () => {
    const user = makeUser({ rank: "basic" });
    const userRepo = makeUserRepo(user);
    const orderRepo = makeOrderRepo();
    const subscriptionRepo = makeSubscriptionRepo(
      makeSubscriptionSnapshot({ stripeSubscriptionId: "sub_123" })
    );
    const subscriptionGateway = makeSubscriptionGateway();
    const accountGateway = makeAccountGateway();
    vi.mocked(accountGateway.banUser).mockRejectedValue(
      new Error("Clerk error")
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      withdraw(
        { clerkUserId: "clerk-1" },
        {
          userRepo,
          orderRepo,
          subscriptionRepo,
          subscriptionGateway,
          accountGateway,
          errorReporter: makeErrorReporter(),
        }
      )
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it("Clerk ban 失敗時にErrorReporterへ通知する", async () => {
    const user = makeUser({ rank: "basic" });
    const userRepo = makeUserRepo(user);
    const orderRepo = makeOrderRepo();
    const subscriptionRepo = makeSubscriptionRepo(
      makeSubscriptionSnapshot({ stripeSubscriptionId: "sub_123" })
    );
    const subscriptionGateway = makeSubscriptionGateway();
    const accountGateway = makeAccountGateway();
    const error = new Error("Clerk error");
    vi.mocked(accountGateway.banUser).mockRejectedValue(error);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errorReporter = makeErrorReporter();

    await withdraw(
      { clerkUserId: "clerk-1" },
      {
        userRepo,
        orderRepo,
        subscriptionRepo,
        subscriptionGateway,
        accountGateway,
        errorReporter,
      }
    );

    expect(errorReporter.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ useCase: "withdraw" }),
      })
    );
  });
});
