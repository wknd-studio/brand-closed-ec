import { resolveFontFamily } from "./brand-theme-fonts";
import type { BrandTheme } from "./sanity/brand-theme";

export function resolveBrandThemeCssVars(
  theme: BrandTheme | null
): Record<string, string> {
  if (!theme) return {};

  const vars: Record<string, string> = {
    "--brand-primary": theme.primaryColorHex,
    "--brand-accent": theme.accentColorHex,
  };

  const fontFamily = resolveFontFamily(theme.font);
  if (fontFamily) vars["--brand-font"] = fontFamily;

  return vars;
}
