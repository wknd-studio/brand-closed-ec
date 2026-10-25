import { describe, it, expect, vi } from "vitest";
import { createUser } from "@/use-cases/create-user";
import { makeAccountGateway, makeUserRepo } from "./helpers";

const INPUT = {
  clerkUserId: "clerk-1",
  email: "test@example.com",
  firstName: "太郎",
  lastName: "山田",
};

describe("createUser", () => {
  it("rank=starter, onboardingCompleted=false でuserRepo.insertIfAbsentを呼ぶ", async () => {
    const userRepo = makeUserRepo();

    await createUser(INPUT, { userRepo, accountGateway: makeAccountGateway() });

    expect(userRepo.insertIfAbsent).toHaveBeenCalledTimes(1);
    const inserted = vi.mocked(userRepo.insertIfAbsent).mock.calls[0][0];
    expect(inserted.clerkUserId).toBe("clerk-1");
    expect(inserted.email).toBe("test@example.com");
    expect(inserted.rank.value).toBe("starter");
    expect(inserted.onboardingCompleted).toBe(false);
    expect(inserted.id).toBeTruthy();
  });

  // user.createdの再送やselectPlanが先に行を作っていた場合に、既存行（入力済みの
  // 氏名・電話番号・プラン）を初期値で上書きしないよう、saveは使わない
  it("userRepo.saveは呼ばない（既存行を上書きしない）", async () => {
    const userRepo = makeUserRepo();

    await createUser(INPUT, { userRepo, accountGateway: makeAccountGateway() });

    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it("リポジトリのエラーは呼び出し元に伝わる", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.insertIfAbsent).mockRejectedValue(new Error("db down"));

    await expect(
      createUser(INPUT, { userRepo, accountGateway: makeAccountGateway() })
    ).rejects.toThrow("db down");
  });

  // GitHub issue #530: <UserProfile /> から会員が自分でClerkアカウントを削除すると
  // 退会処理（withdraw）を通らないため、作成時にユーザーごとの削除を無効にする
  it("ClerkユーザーのSelf Service Deleteを無効にする", async () => {
    const userRepo = makeUserRepo();
    const accountGateway = makeAccountGateway();

    await createUser(INPUT, { userRepo, accountGateway });

    expect(accountGateway.disableSelfDelete).toHaveBeenCalledWith("clerk-1");
  });

  it("Clerkの更新に失敗したらエラーを呼び出し元に伝える", async () => {
    const userRepo = makeUserRepo();
    const accountGateway = makeAccountGateway();
    vi.mocked(accountGateway.disableSelfDelete).mockRejectedValue(
      new Error("clerk down")
    );

    await expect(
      createUser(INPUT, { userRepo, accountGateway })
    ).rejects.toThrow("clerk down");
  });

  // Clerkの再送で再び呼ばれたとき、行はinsertIfAbsentで二重に作られず、
  // 削除の無効化だけがやり直される
  it("Clerkの更新が失敗した後の再送でも、行はinsertIfAbsentで作り、削除の無効化をやり直す", async () => {
    const userRepo = makeUserRepo();
    const accountGateway = makeAccountGateway();
    vi.mocked(accountGateway.disableSelfDelete)
      .mockRejectedValueOnce(new Error("clerk down"))
      .mockResolvedValueOnce(undefined);

    await expect(
      createUser(INPUT, { userRepo, accountGateway })
    ).rejects.toThrow();
    await createUser(INPUT, { userRepo, accountGateway });

    expect(userRepo.insertIfAbsent).toHaveBeenCalledTimes(2);
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(accountGateway.disableSelfDelete).toHaveBeenCalledTimes(2);
  });
});
