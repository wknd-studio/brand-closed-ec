import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  setUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth/current-user";

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("認証済みの場合、auth()の戻り値をそのまま返しSentry.setUserを呼ぶ", async () => {
    const authResult = {
      userId: "clerk-1",
      sessionClaims: { foo: "bar" },
      getToken: vi.fn(),
    };
    vi.mocked(auth).mockResolvedValue(authResult as never);

    const result = await requireAuth();

    expect(result).toBe(authResult);
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: "clerk-1" });
  });

  it("未認証の場合、auth()の戻り値をそのまま返しSentry.setUserを呼ばない", async () => {
    const authResult = { userId: null, sessionClaims: null };
    vi.mocked(auth).mockResolvedValue(authResult as never);

    const result = await requireAuth();

    expect(result).toBe(authResult);
    expect(Sentry.setUser).not.toHaveBeenCalled();
  });
});
