import { describe, it, expect, vi } from "vitest";

vi.mock("next-sanity", () => ({
  createClient: vi.fn(() => ({ fetch: vi.fn() })),
}));

import { isProductAccessible } from "@/lib/sanity/products";

describe("isProductAccessible", () => {
  it("ユーザーランクが min_rank 以上なら true", () => {
    expect(isProductAccessible("entry", "free")).toBe(true);
    expect(isProductAccessible("entry", "entry")).toBe(true);
    expect(isProductAccessible("standard", "entry")).toBe(true);
  });

  it("ユーザーランクが min_rank 未満なら false", () => {
    expect(isProductAccessible("entry", "standard")).toBe(false);
    expect(isProductAccessible("free", "pro")).toBe(false);
  });

  it("不明なランクは false", () => {
    expect(isProductAccessible("unknown", "free")).toBe(false);
    expect(isProductAccessible("free", "unknown")).toBe(false);
  });
});
