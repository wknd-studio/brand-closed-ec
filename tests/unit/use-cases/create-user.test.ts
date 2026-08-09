import { describe, it, expect, vi } from "vitest";
import { createUser } from "@/use-cases/create-user";
import { makeUserRepo } from "./helpers";

describe("createUser", () => {
  it("rank=starter, onboardingCompleted=false でuserRepo.saveを呼ぶ", async () => {
    const userRepo = makeUserRepo();

    await createUser(
      {
        clerkUserId: "clerk-1",
        email: "test@example.com",
        firstName: "太郎",
        lastName: "山田",
        legalAcceptedAt: new Date(2026, 0, 1),
      },
      { userRepo }
    );

    expect(userRepo.save).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(saved.clerkUserId).toBe("clerk-1");
    expect(saved.email).toBe("test@example.com");
    expect(saved.rank.value).toBe("starter");
    expect(saved.onboardingCompleted).toBe(false);
    expect(saved.id).toBeTruthy();
    expect(saved.termsAgreedAt).toEqual(new Date(2026, 0, 1));
    expect(saved.termsVersion).toBe("2026-05-25");
  });

  it("legalAcceptedAtがnullの場合はtermsAgreedAt/termsVersionもnullで保存する", async () => {
    const userRepo = makeUserRepo();

    await createUser(
      {
        clerkUserId: "clerk-2",
        email: "test2@example.com",
        firstName: "太郎",
        lastName: "山田",
        legalAcceptedAt: null,
      },
      { userRepo }
    );

    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(saved.termsAgreedAt).toBeNull();
    expect(saved.termsVersion).toBeNull();
  });
});
