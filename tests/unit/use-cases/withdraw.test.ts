import { describe, it, expect, vi } from "vitest";

import { withdraw } from "@/use-cases/withdraw";
import { ActiveOrdersExistError } from "@/domain/errors/active-orders-exist-error";
import { MinimumMembershipPeriodError } from "@/domain/errors/minimum-membership-period-error";
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
  makeNotificationService,
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
          notificationService: makeNotificationService(),
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
          notificationService: makeNotificationService(),
        }
      )
    ).rejects.toThrow(ActiveOrdersExistError);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it("入会から6ヶ月経っていない会員は MinimumMembershipPeriodError をthrowし、保存・Stripe解約・Clerk ban をしない", async () => {
    const userRepo = makeUserRepo(makeUser({ createdAt: new Date() }));
    const subscriptionGateway = makeSubscriptionGateway();
    const accountGateway = makeAccountGateway();

    await expect(
      withdraw(
        { clerkUserId: "clerk-1" },
        {
          userRepo,
          orderRepo: makeOrderRepo(),
          subscriptionRepo: makeSubscriptionRepo(),
          subscriptionGateway,
          accountGateway,
          errorReporter: makeErrorReporter(),
          notificationService: makeNotificationService(),
        }
      )
    ).rejects.toThrow(MinimumMembershipPeriodError);
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(subscriptionGateway.cancelSubscription).not.toHaveBeenCalled();
    expect(accountGateway.banUser).not.toHaveBeenCalled();
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
        notificationService: makeNotificationService(),
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
        notificationService: makeNotificationService(),
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
        notificationService: makeNotificationService(),
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
          notificationService: makeNotificationService(),
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
          notificationService: makeNotificationService(),
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
        notificationService: makeNotificationService(),
      }
    );

    expect(errorReporter.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ useCase: "withdraw" }),
      })
    );
  });

  // GitHub issue #853。退会の完了のメール
  describe("退会の完了のメール", () => {
    function deps(overrides?: {
      user?: ReturnType<typeof makeUser>;
      subscription?: ReturnType<typeof makeSubscriptionSnapshot> | null;
    }) {
      return {
        userRepo: makeUserRepo(overrides?.user),
        orderRepo: makeOrderRepo(),
        subscriptionRepo: makeSubscriptionRepo(
          overrides && "subscription" in overrides
            ? overrides.subscription
            : makeSubscriptionSnapshot({ stripeSubscriptionId: "sub_123" })
        ),
        subscriptionGateway: makeSubscriptionGateway(),
        accountGateway: makeAccountGateway(),
        errorReporter: makeErrorReporter(),
        notificationService: makeNotificationService(),
      };
    }

    it("退会が成功したら、退会前の会員（メールアドレス）宛てに、退会日とサブスクリプションを解約したことを1回だけ送る", async () => {
      const d = deps();

      await withdraw({ clerkUserId: "clerk-1" }, d);

      const savedUser = vi.mocked(d.userRepo.save).mock.calls[0][0];
      expect(d.notificationService.sendWithdrawn).toHaveBeenCalledOnce();
      expect(d.notificationService.sendWithdrawn).toHaveBeenCalledWith(
        expect.objectContaining({ email: "test@example.com" }),
        { withdrawnAt: savedUser.deletedAt, subscriptionCancelled: true }
      );
    });

    it("有効なサブスクリプションが無い会員は、解約していないこととして送る", async () => {
      const d = deps({ subscription: null });

      await withdraw({ clerkUserId: "clerk-1" }, d);

      expect(d.notificationService.sendWithdrawn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ subscriptionCancelled: false })
      );
    });

    it("Clerk の ban に失敗しても、退会は済んでいるため送る", async () => {
      const d = deps();
      vi.mocked(d.accountGateway.banUser).mockRejectedValue(
        new Error("Clerk error")
      );
      vi.spyOn(console, "error").mockImplementation(() => {});

      await withdraw({ clerkUserId: "clerk-1" }, d);

      expect(d.notificationService.sendWithdrawn).toHaveBeenCalledOnce();
    });

    it("進行中の注文があって退会できなかったときは送らない", async () => {
      const d = deps();
      vi.mocked(d.orderRepo.findByUserId).mockResolvedValue([
        makeOrder({
          settlements: [makeSettlement({ status: "invoice_sent" })],
        }),
      ]);

      await expect(withdraw({ clerkUserId: "clerk-1" }, d)).rejects.toThrow(
        ActiveOrdersExistError
      );
      expect(d.notificationService.sendWithdrawn).not.toHaveBeenCalled();
    });

    it("最低利用期間内で退会できなかったときは送らない", async () => {
      const d = deps({ user: makeUser({ createdAt: new Date() }) });

      await expect(withdraw({ clerkUserId: "clerk-1" }, d)).rejects.toThrow(
        MinimumMembershipPeriodError
      );
      expect(d.notificationService.sendWithdrawn).not.toHaveBeenCalled();
    });

    it("Stripe の解約に失敗して退会を取り消したときは送らない", async () => {
      const d = deps();
      vi.mocked(d.subscriptionGateway.cancelSubscription).mockRejectedValue(
        new Error("Stripe error")
      );

      await expect(withdraw({ clerkUserId: "clerk-1" }, d)).rejects.toThrow();
      expect(d.notificationService.sendWithdrawn).not.toHaveBeenCalled();
    });

    it("送信に失敗しても退会は取り消さず、ErrorReporter で運営者に知らせる", async () => {
      const d = deps();
      const error = new Error("Resend error");
      vi.mocked(d.notificationService.sendWithdrawn).mockRejectedValue(error);

      await expect(
        withdraw({ clerkUserId: "clerk-1" }, d)
      ).resolves.toBeUndefined();

      expect(d.userRepo.save).toHaveBeenCalledOnce();
      expect(
        vi.mocked(d.userRepo.save).mock.calls[0][0].deletedAt
      ).not.toBeNull();
      expect(d.errorReporter.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: expect.objectContaining({
            useCase: "withdraw",
            email: "withdrawn",
          }),
        })
      );
    });
  });
});
