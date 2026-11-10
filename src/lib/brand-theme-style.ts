import { resolveFontFamily } from "./brand-theme-fonts";
import type { BrandThemeDto } from "@/queries/brand-theme-query-service";

export function resolveBrandThemeCssVars(
  theme: BrandThemeDto | null
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
