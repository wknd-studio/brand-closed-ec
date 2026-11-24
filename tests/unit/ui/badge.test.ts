import { describe, expect, it } from "vitest";
import { badgeVariants } from "@/components/ui/badge";

describe("badgeVariants", () => {
  it('tone="info"（請求書払い）は info の色の文字になる', () => {
    expect(badgeVariants({ tone: "info" })).toContain("text-info");
  });
});
