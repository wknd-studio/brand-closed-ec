import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { StripeMock, createFetchHttpClient } = vi.hoisted(() => {
  const createFetchHttpClient = vi.fn(() => ({ kind: "fetch" }));
  const StripeMock = Object.assign(
    vi.fn(function (this: { key: string }, key: string) {
      this.key = key;
    }),
    { createFetchHttpClient }
  );
  return { StripeMock, createFetchHttpClient };
});

vi.mock("stripe", () => ({ default: StripeMock }));

describe("getStripe", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    StripeMock.mockClear();
    createFetchHttpClient.mockClear();
    process.env = { ...ORIGINAL_ENV, STRIPE_SECRET_KEY: "sk_test_dummy" };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("STRIPE_SECRET_KEY と Fetch API ベースの HTTP クライアントで Stripe を生成する（Workers では Node.js の http が使えないため）", async () => {
    const { getStripe } = await import("@/infrastructure/stripe/client");

    getStripe();

    expect(StripeMock).toHaveBeenCalledWith("sk_test_dummy", {
      httpClient: { kind: "fetch" },
    });
  });

  it("2回目以降は同じインスタンスを返し、Stripe を生成し直さない", async () => {
    const { getStripe } = await import("@/infrastructure/stripe/client");

    const first = getStripe();
    const second = getStripe();

    expect(second).toBe(first);
    expect(StripeMock).toHaveBeenCalledTimes(1);
  });
});
