import { describe, it, expect, vi } from "vitest";
import { createUser } from "@/use-cases/create-user";
import { makeUserRepo } from "./helpers";

describe("createUser", () => {
  it("rank=free, onboardingCompleted=false でuserRepo.saveを呼ぶ", async () => {
    const userRepo = makeUserRepo();

    await createUser(
      {
        clerkUserId: "clerk-1",
        email: "test@example.com",
        firstName: "太郎",
        lastName: "山田",
      },
      { userRepo }
    );

    expect(userRepo.save).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(saved.clerkUserId).toBe("clerk-1");
    expect(saved.email).toBe("test@example.com");
    expect(saved.rank.value).toBe("free");
    expect(saved.onboardingCompleted).toBe(false);
    expect(saved.id).toBeTruthy();
  });
});
