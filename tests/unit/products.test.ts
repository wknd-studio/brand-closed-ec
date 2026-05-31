import { describe, it, expect, vi } from "vitest";

vi.mock("next-sanity", () => ({
  createClient: vi.fn(() => ({ fetch: vi.fn() })),
}));

import { getAllowedRanks } from "@/lib/sanity/products";

describe("getAllowedRanks", () => {
  it("free ランクは free のみ閲覧可能", () => {
    expect(getAllowedRanks("free")).toEqual(["free"]);
  });

  it("entry ランクは free・entry を閲覧可能", () => {
    expect(getAllowedRanks("entry")).toEqual(["free", "entry"]);
  });

  it("standard ランクは free・entry・standard を閲覧可能", () => {
    expect(getAllowedRanks("standard")).toEqual(["free", "entry", "standard"]);
  });

  it("pro ランクは free〜pro を閲覧可能", () => {
    expect(getAllowedRanks("pro")).toEqual([
      "free",
      "entry",
      "standard",
      "pro",
    ]);
  });

  it("enterprise ランクはすべて閲覧可能", () => {
    expect(getAllowedRanks("enterprise")).toEqual([
      "free",
      "entry",
      "standard",
      "pro",
      "enterprise",
    ]);
  });

  it("不明なランクは free のみ", () => {
    expect(getAllowedRanks("unknown")).toEqual(["free"]);
  });
});
