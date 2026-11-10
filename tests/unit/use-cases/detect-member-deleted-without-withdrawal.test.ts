import { describe, it, expect, vi } from "vitest";
import { detectMemberDeletedWithoutWithdrawal } from "@/use-cases/detect-member-deleted-without-withdrawal";
import { makeErrorReporter, makeUser, makeUserRepo } from "./helpers";

// GitHub issue #554（検知の内容は #531）
describe("detectMemberDeletedWithoutWithdrawal", () => {
  it("有効な会員が残っていれば、運営者にerrorで通知する", async () => {
    const user = makeUser();
    const userRepo = makeUserRepo(user);
    const errorReporter = makeErrorReporter();

    await detectMemberDeletedWithoutWithdrawal(
      { clerkUserId: "clerk-1", svixId: "msg_1" },
      { userRepo, errorReporter }
    );

    expect(userRepo.findByClerkUserId).toHaveBeenCalledWith("clerk-1");
    expect(errorReporter.captureMessage).toHaveBeenCalledWith(
      "退会処理を通らずにClerkアカウントが削除されました。Stripeのサブスクを解約し、users.deleted_atを設定してください",
      {
        level: "error",
        tags: { webhook: "clerk", eventType: "user.deleted" },
        extra: { clerkUserId: "clerk-1", userId: user.id, svixId: "msg_1" },
      }
    );
  });

  it("会員が見つからなければ（退会済み・未登録）、通知しない", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const errorReporter = makeErrorReporter();

    await detectMemberDeletedWithoutWithdrawal(
      { clerkUserId: "clerk-1", svixId: "msg_1" },
      { userRepo, errorReporter }
    );

    expect(errorReporter.captureMessage).not.toHaveBeenCalled();
  });
});
