import { describe, it, expect } from "vitest";
import { resolveFontFamily } from "@/lib/brand-theme-fonts";

describe("resolveFontFamily", () => {
  it("sansはInterのCSS変数を返す", () => {
    expect(resolveFontFamily("sans")).toBe("var(--font-brand-sans)");
  });

  it("serifはPlayfair DisplayのCSS変数を返す", () => {
    expect(resolveFontFamily("serif")).toBe("var(--font-brand-serif)");
  });

  it("elegantはCormorantのCSS変数を返す", () => {
    expect(resolveFontFamily("elegant")).toBe("var(--font-brand-elegant)");
  });

  it("undefinedはundefinedを返す", () => {
    expect(resolveFontFamily(undefined)).toBeUndefined();
  });

  it("nullはundefinedを返す", () => {
    expect(resolveFontFamily(null)).toBeUndefined();
  });

  it("未知のキーはundefinedを返す", () => {
    expect(resolveFontFamily("unknown")).toBeUndefined();
  });
});
