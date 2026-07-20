import { describe, it, expect, vi } from "vitest";

vi.mock("next-sanity", () => ({
  createClient: vi.fn(() => ({ fetch: vi.fn() })),
}));

import { isProductAccessible } from "@/lib/sanity/products";

describe("isProductAccessible", () => {
  it("ユーザーランクが min_rank 以上なら true", () => {
    expect(isProductAccessible("basic", "starter")).toBe(true);
    expect(isProductAccessible("basic", "basic")).toBe(true);
    expect(isProductAccessible("standard", "basic")).toBe(true);
  });

  it("ユーザーランクが min_rank 未満なら false", () => {
    expect(isProductAccessible("basic", "standard")).toBe(false);
    expect(isProductAccessible("starter", "pro")).toBe(false);
  });

  it("不明なランクは false", () => {
    expect(isProductAccessible("unknown", "starter")).toBe(false);
    expect(isProductAccessible("starter", "unknown")).toBe(false);
  });
});
