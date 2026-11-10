import { SanityBrandThemeQueryService } from "@/infrastructure/sanity/sanity-brand-theme-query-service";
import type { BrandThemeQueryService } from "@/queries/brand-theme-query-service";

export function brandThemeQueryService(): BrandThemeQueryService {
  return new SanityBrandThemeQueryService();
}
