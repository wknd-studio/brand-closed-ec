import { describe, it, expect, vi } from "vitest";
import { createUser } from "@/use-cases/create-user";
import { makeUserRepo } from "./helpers";

const INPUT = {
  clerkUserId: "clerk-1",
  email: "test@example.com",
  firstName: "太郎",
  lastName: "山田",
};

describe("createUser", () => {
  it("rank=starter, onboardingCompleted=false でuserRepo.insertIfAbsentを呼ぶ", async () => {
    const userRepo = makeUserRepo();

    await createUser(INPUT, { userRepo });

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

    await createUser(INPUT, { userRepo });

    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it("リポジトリのエラーは呼び出し元に伝わる", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.insertIfAbsent).mockRejectedValue(new Error("db down"));

    await expect(createUser(INPUT, { userRepo })).rejects.toThrow("db down");
  });
});
