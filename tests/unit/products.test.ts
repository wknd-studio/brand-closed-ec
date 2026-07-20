import { describe, it, expect, vi } from "vitest";

vi.mock("next-sanity", () => ({
  createClient: vi.fn(() => ({ fetch: vi.fn() })),
}));

import { getAllowedRanks } from "@/lib/sanity/products";

describe("getAllowedRanks", () => {
  it("starter ランクは starter のみ閲覧可能", () => {
    expect(getAllowedRanks("starter")).toEqual(["starter"]);
  });

  it("basic ランクは starter・basic を閲覧可能", () => {
    expect(getAllowedRanks("basic")).toEqual(["starter", "basic"]);
  });

  it("standard ランクは starter・basic・standard を閲覧可能", () => {
    expect(getAllowedRanks("standard")).toEqual([
      "starter",
      "basic",
      "standard",
    ]);
  });

  it("pro ランクは starter〜pro を閲覧可能", () => {
    expect(getAllowedRanks("pro")).toEqual([
      "starter",
      "basic",
      "standard",
      "pro",
    ]);
  });

  it("enterprise ランクはすべて閲覧可能", () => {
    expect(getAllowedRanks("enterprise")).toEqual([
      "starter",
      "basic",
      "standard",
      "pro",
      "advanced",
      "premium",
      "enterprise",
    ]);
  });

  it("不明なランクは starter のみ", () => {
    expect(getAllowedRanks("unknown")).toEqual(["starter"]);
  });
});
