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

  it("認証済みの場合、userIdを返しSentry.setUserを呼ぶ", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "clerk-1" } as never);

    const result = await requireAuth();

    expect(result).toEqual({ userId: "clerk-1" });
    expect(Sentry.setUser).toHaveBeenCalledWith({ id: "clerk-1" });
  });

  it("未認証の場合、userId: nullを返しSentry.setUserを呼ばない", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);

    const result = await requireAuth();

    expect(result).toEqual({ userId: null });
    expect(Sentry.setUser).not.toHaveBeenCalled();
  });
});
