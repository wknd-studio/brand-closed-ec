import type { FontKey } from "@/sanity/schemas/design-theme-fonts";

const FONT_CSS_VAR: Record<FontKey, string> = {
  sans: "var(--font-brand-sans)",
  serif: "var(--font-brand-serif)",
  elegant: "var(--font-brand-elegant)",
};

export function resolveFontFamily(
  font: string | null | undefined
): string | undefined {
  if (!font) return undefined;
  return FONT_CSS_VAR[font as FontKey];
}
