import { describe, it, expect } from "vitest";
import { resolveBrandThemeCssVars } from "@/lib/brand-theme-style";
import type { BrandTheme } from "@/lib/sanity/brand-theme";

describe("resolveBrandThemeCssVars", () => {
  it("themeがnullの場合は空オブジェクトを返す", () => {
    expect(resolveBrandThemeCssVars(null)).toEqual({});
  });

  it("配色とフォントをCSS変数として返す", () => {
    const theme: BrandTheme = {
      primaryColorHex: "#111111",
      accentColorHex: "#ff0000",
      font: "serif",
      bannerUrl: "https://cdn.sanity.io/images/example.jpg",
    };

    expect(resolveBrandThemeCssVars(theme)).toEqual({
      "--brand-primary": "#111111",
      "--brand-accent": "#ff0000",
      "--brand-font": "var(--font-brand-serif)",
    });
  });

  it("未知のフォントキーの場合は--brand-fontを含めない", () => {
    const theme: BrandTheme = {
      primaryColorHex: "#111111",
      accentColorHex: "#ff0000",
      font: "unknown",
      bannerUrl: "https://cdn.sanity.io/images/example.jpg",
    };

    const result = resolveBrandThemeCssVars(theme);
    expect(result["--brand-font"]).toBeUndefined();
    expect(result["--brand-primary"]).toBe("#111111");
  });
});
